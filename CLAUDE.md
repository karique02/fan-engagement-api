# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — run with nodemon (auto-restart on save)
- `npm start` — run with plain node
- No test suite, no lint script configured. There is no build step (plain CommonJS, no bundler/transpiler).

## Required environment (`.env`)

The app throws at startup (before listening) if any of these are missing:
`DATABASE_URL`, `JWT_SECRET`, `API_PUBLIC_URL`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`,
`FIREBASE_SERVICE_ACCOUNT_JSON`. `PORT` defaults to `3000`. `.env.example` only lists
`PORT`/`DATABASE_URL`/`JWT_SECRET`/`FIREBASE_SERVICE_ACCOUNT_JSON` — it's stale on the rest, copy the
full list above when setting up a local `.env`.

`FIREBASE_SERVICE_ACCOUNT_JSON` holds the full Firebase service account key (Firebase console →
Project Settings → Service Accounts → Generate new private key) as a single-line JSON string, pasted
exactly as downloaded — do not reformat it or the private key's escaped `\n` will break `JSON.parse`
at boot. It must belong to the same Firebase project as `fan-engagement-android`'s
`google-services.json`. The installed `firebase-admin` major version (14.x) uses the modular API —
`initializeApp`/`cert` from `firebase-admin/app` and `getMessaging` from `firebase-admin/messaging`
(not `admin.credential.cert(...)`/`admin.messaging()`, which don't exist on this version's default
export). `initializeApp({ credential: cert(...) })` runs near the top of `server.js`, backing the
`notifications/*` routes below.

`NODE_ENV=production` switches the `pg` Pool to `ssl: { rejectUnauthorized: false }`; otherwise SSL
is disabled. SMTP is Gmail specifically (`nodemailer.createTransport({ service: "gmail", ... })`),
using `SMTP_USER`/`SMTP_PASS` as Gmail app-credentials.

## Architecture

Everything lives in one file: `server.js` (~2500 lines, plain Express, CommonJS). There is no
router/controller/service/model split — to find or add an endpoint, search this file directly for
its path. Endpoints are defined in file order roughly matching the grouping below; add new routes
near their sibling group rather than at the end of the file.

**Data access**: raw `pg` `Pool`, no ORM/query builder. SQL is written inline per-route as tagged
template strings against `public.<table>` qualified names, with `$1`/`$2`… placeholders. Multi-step
writes (e.g. recommendation training) explicitly `BEGIN`/`COMMIT`/`ROLLBACK` on a checked-out client
via `pool.connect()` — follow that pattern for any new multi-statement transaction instead of relying
on autocommit per query.

**Auth**: `authenticateToken` middleware (server.js:266) requires `Authorization: Bearer <token>`,
verifies with `jwt.verify(token, JWT_SECRET)`, and sets `req.authenticatedUser` (JWT payload; user id
is `.sub`). Apply it per-route as an Express middleware arg — there's no global auth gate, and a few
routes are intentionally public (see below). Registration hashes passwords with `argon2` and issues
an email-verification flow: a raw random token is emailed, only its SHA-256 hash is stored in
`email_verification` (`createEmailVerificationToken`/`createOrReplaceEmailVerification`, server.js:59-105).
`GET /api/v1/auth/verify-email` renders an HTML landing page (`renderEmailVerificationPage`,
server.js:166), not JSON — it's meant to be opened directly from the emailed link.
`POST /api/v1/auth/login` also returns `data.user.userType` (the `public."user".user_type` column,
`1` or `2`) — used by `fan-engagement-web` to gate its Dashboard tab/route to `userType === 2`. The
signed JWT itself is unchanged (`sub`/`username`/`email` only); `userType` travels only in the login
response body. The login body also accepts an optional `client` field — when `client === "web"` and
the matched user's `user_type !== 2`, login is rejected with `403` and `data.reason: "not_admin"`
(no `accessToken`/`user` in the response), restricting `fan-engagement-web` to admin accounts only.
This field is **web-exclusive**: `fan-engagement-android` must never send it, since fans there are
typically `userType 1` and would otherwise be locked out of the app.

**Response envelope**: every route responds via `sendSuccess(res, req, { statusCode, message, data })`
or `sendError(res, req, { statusCode, message, data })` (server.js:230/248). Response shape is always
`{ code, status, message, timestamp, method, data }`. Always use these helpers for new routes — never
call `res.json()` directly. `message` strings are user-facing and in Spanish; keep new ones consistent
in tone (see the `sendError`/`sendSuccess` defaults for register/verify flows as examples).

**Errors**: unmatched routes and thrown errors fall through to the two catch-all handlers at the very
bottom of the file — a 404 `app.use((req, res) => ...)` then a 4-arg error handler that logs and
returns a generic 500. New async routes should `try { ... } catch (error) { next(error); }` rather than
handling/formatting errors inline, so they reach the shared 500 handler.

**Route groups** (all under `/api/v1`):
- `auth/*` — register, login, verify-email (public, HTML response), resend-email-verification
- `users/me/fcm-token` — push token register/delete (authenticated)
- `products`, `promotions` — read-only catalog (authenticated)
- `products/interaction`, `promotions/interaction` — fan engagement tracking (authenticated); this is
  the core product signal the recommender trains on. `products/interaction/all` and
  `promotions/interaction/all` are the paginated/filterable list equivalents and are intentionally
  **not** authenticated. Both accept the same query params, validated by the shared
  `parseInteractionListQuery()` helper (server.js, right above these two routes): `username` and
  `productName` (products) / `promotionTitle` (promotions) — free-text `ILIKE '%value%'`, restricted
  to `/^[\p{L}0-9 ._-]{0,100}$/u` (letters incl. accented/ñ, digits, space, `.`/`_`/`-`) — `dateFrom`/
  `dateTo` (`YYYY-MM-DD`, filtering `last_interaction_at` inclusive on both ends), and `page`/
  `pageSize` (`pageSize` only accepts `15`/`30`/`45`, defaulting to `15` for any other value; `page`
  defaults to `1`). Any invalid text filter, invalid date format, or `dateFrom > dateTo` responds
  `400` via `sendError`. The response's `data` now includes `pagination: { page, pageSize,
  totalItems, totalPages }` alongside `interactions`, computed from a `COUNT(*) OVER()` window
  function in the same paginated query (no second round-trip).
- `cart/*` — shopping cart CRUD: `GET cart`, `POST cart/products`, `POST cart/promotions`,
  `PATCH cart/items/:cartItemId`, `DELETE cart/items/:cartItemId`, `DELETE cart` (all authenticated)
- `purchases/*` — authenticated. `POST purchases` is checkout: converts the authenticated user's
  cart into a `purchase` (`status = 'pending'`) plus one `purchase_item` per cart line, in a single
  transaction, then empties the cart (same statement pattern as `DELETE cart`) — `400` if the cart is
  missing or empty, and nothing is created. A product item's `unit_price` snapshot is `product.price`
  at checkout time; a promotion item's `unit_price` is derived (no stored promotion price column)
  from `AVG(product.price)` over `promotion_product`'s linked products, adjusted by
  `discount_percentage` or by `pay_quantity/buy_quantity`, falling back to `0` if the promotion has no
  linked products (see the `PROMOTION_UNIT_PRICE_SELECT`/`PROMOTION_UNIT_PRICE_JOIN` constants right
  before this route group — reused by checkout's cart read). `item_name`/`unit_price`/`line_total` are
  copied at checkout and never recalculated against the catalog afterward, so a later price or
  promotion change doesn't alter historical purchases. `GET purchases` is the paginated/filterable
  global history (web admin) — same paginate-with-`COUNT(*) OVER()` pattern as
  `products/interaction/all`, reusing `INTERACTION_TEXT_FILTER_REGEX`/`INTERACTION_DATE_REGEX`/
  `INTERACTION_PAGE_SIZES`, with its own `status` filter (`pending`/`completed`/`cancelled`) validated
  against `PURCHASE_STATUSES`; `GET purchases/me` is the same paginated shape forced to the
  authenticated user, **with** each purchase's items inlined (via the shared
  `fetchPurchaseItemsByPurchaseIds()` helper) to avoid Android needing an N+1 detail call;
  `GET purchases/:purchaseId` is the single-purchase detail (`404` if missing), items included, current
  catalog `image`/`categoryName` joined in per item alongside the immutable snapshot fields;
  `PATCH purchases/:purchaseId/status` updates `status` and stamps/clears `completed_at`/
  `cancelled_at` accordingly (`404` if missing, `400` if `status` isn't one of the three values). The
  status update is written as `UPDATE ... FROM (SELECT $1::bigint, $2::varchar ...)` rather than
  referencing `$2` directly in both the `SET` and the `CASE` branches — Postgres can't always infer a
  consistent type for a bare parameter reused across an assignment and a comparison in the same
  statement ("inconsistent types deduced for parameter"), so the CTE pins the type once.
- `recommendations/train` — manually triggers collaborative filtering; **not authenticated**; no-ops
  (`{ skipped: true }`) if a run is already in progress
- `products/recommendations`, `promotions/recommendations` — authenticated; read the precomputed
  recommendation tables, they do not train on request
- `dashboard/engagement` — authenticated; aggregates KPIs, a 30-day activity approximation (grouped
  by `last_interaction_at`, not a real event history — see the schema note below), top-5 product/
  promotion rankings, recommender coverage, and the interaction→purchase funnel, for the web's
  `/dashboard` page. The `funnel` block reads `purchase`/`purchase_item` (`status <> 'cancelled'`
  counts as converted; `pending` **and** `completed` both count, only `cancelled` doesn't) — it no
  longer looks at `shopping_cart`/`shopping_cart_item` at all, so there is no cart-based funnel
  fallback if `purchase` is empty
- `users` — authenticated; lists all users (`id`, `username`, `email`, `hasFcmToken`), used by the
  web's Notifications tab to populate its recipient autocomplete. `id` is explicitly cast
  (`id::integer`) in the query — `pg` returns `bigint` columns as strings by default, and this `id`
  round-trips back into `POST /notifications/send`'s `userIds` body, which validates with
  `Number.isInteger`; without the cast every send to specific users 400s
- `images` — authenticated; lists `public.image` rows (`id`, `url`, `sourceType`, `sourceId`), used
  by the web's Notifications tab image picker. One-time seeded with a manual `INSERT ... SELECT
  DISTINCT ... ON CONFLICT (url) DO NOTHING` per source table, copying the distinct URLs already in
  `product.image`/`promotion.image` (no seed script kept in the repo — run it directly against the
  target database if `image` ever needs re-seeding) — there is no upload flow, the picker only offers
  what's already seeded
- `notifications/send` — authenticated; sends a push notification via Firebase Admin
  (`getMessaging().sendEachForMulticast`, batched to ≤500 tokens) to either every user with a
  non-null `fcm_token` (`target: "all"`) or an explicit `userIds` list (`target: "users"`). A token
  FCM reports as unregistered/invalid gets cleared (`fcm_token = NULL`) automatically. Every call
  writes one `notification_log` row (aggregate counts) plus one `notification_log_recipient` row per
  intended recipient (`status`: `delivered`/`failed`/`no_token`) — the response echoes those counts
  and a per-recipient breakdown
- `notifications/log` — authenticated; paginated/filterable (reuses `parseInteractionListQuery()` with
  `entityParam: "title"`, so it accepts the same `page`/`pageSize`/`dateFrom`/`dateTo` contract as the
  interaction list endpoints, plus `title` — `ILIKE` on `notification_log.title` — and `username` —
  `ILIKE` on any recipient's username via `EXISTS` against `notification_log_recipient`, filtering to
  only the sends where that user appears, whether via `target: "all"` or an explicit pick). Each
  returned log row includes a `recipients: { userId, username, status }[]` array (a second query keyed
  by the page's log ids, merged in JS — kept separate from the paginated `COUNT(*) OVER()` query so
  joining recipients doesn't multiply/break pagination) — the web uses this both to decide what to
  show in its "Destino" column (a lone recipient's username instead of "Usuarios específicos" when
  `target: "users"` had exactly one) and to render the full per-recipient breakdown in its detail modal
- `DELETE notifications/log/:id` — authenticated; deletes one `notification_log` row (and its
  `notification_log_recipient` rows via `ON DELETE CASCADE`); `404` if the id doesn't exist
- `GET`/`PUT parameters/personalized-notifications` — authenticated; read/write the 6 `parameters`
  rows driving the personalized notification scheduler below plus the recommender's purchase boost
  (`data.settings`: `enabled`, `intervalMinutes`, `repeatDays`, `startHour`, `endHour`,
  `purchaseSignalWeight`). `PUT` validates ranges (`intervalMinutes` 1-1440, `repeatDays` 0-365,
  `startHour` 0-23, `endHour` 1-24, `startHour < endHour`, `purchaseSignalWeight` 0-10) and `400`s via
  `sendError` otherwise; persists with `INSERT ... ON CONFLICT (key) DO UPDATE` per key inside a
  transaction. A changed `intervalMinutes` only takes effect on the *next* scheduled cycle (the
  current one is already scheduled) — same behavior as the CF training interval below. The endpoint's
  path/name stayed as-is (not renamed to something recommender-related) specifically so the existing
  web client didn't need a route change for this one extra field.
- `POST notifications/personalized/run` — authenticated; runs
  `runPersonalizedNotificationCycle({ ignoreSchedule: true })` immediately, bypassing the `enabled`
  flag and the hour window (but still respecting `repeatDays`) — a manual test trigger for admins.
  `{ skipped: true }` if a cycle is already running, same criterion as `/recommendations/train`.

**Personalized notifications**: `startPersonalizedNotificationScheduler()` mirrors
`startCollaborativeFilteringTrainingScheduler()` exactly — first fire 20s after boot (offset from the
training scheduler's 10s so they don't collide), then re-reads
`personalized_notification_interval_minutes` from `parameters` after every cycle to reschedule. Each
cycle (`runPersonalizedNotificationCycle`, guarded by its own `isPersonalizedNotificationCycleRunning`
flag): unless `ignoreSchedule: true`, skips if `personalized_notification_enabled = 0` or the current
hour in `America/Lima` (via `Intl.DateTimeFormat`) falls outside
`[personalized_notification_start_hour, personalized_notification_end_hour)`; otherwise selects, in one
query, the highest-`recommendation_score` product per user from `user_product_recommendation` among
users with a non-null `fcm_token` whose selected product hasn't been sent to them (`target_type =
'personalized'`) within the last `personalized_notification_repeat_days` days; sends one
`getMessaging().sendEach(...)` message per user (title `"Te puede interesar"`, fixed body template,
`product.image` as `imageUrl` when present) in batches of ≤500; clears `fcm_token` on
`messaging/registration-token-not-registered`/`messaging/invalid-registration-token` exactly like
`/notifications/send`; and inserts one `notification_log` row per notified user
(`target_type='personalized'`, `sent_by_user_id=NULL`, `product_id` set) plus its
`notification_log_recipient` row, in one transaction. `sent_by_user_id IS NULL` on `notification_log`
now means a system-originated send; the web's `/notifications` tab renders that as
"Sistema (automático)".

**Recommendations engine**: `trainCollaborativeFiltering()` runs product- and promotion-level
collaborative filtering in-process against interaction **and purchase** data
(`trainProductRecommendations`/`trainPromotionRecommendations`) inside a single transaction, writing
to `user_product_recommendation` / `user_promotion_recommendation`. Each of those two functions
prepends a `user_product_signal`/`user_promotion_signal` CTE that `FULL OUTER JOIN`s
`user_product_interaction`/`user_promotion_interaction` against a `purchased_product`/
`purchased_promotion` CTE (rows from `purchase`/`purchase_item` where `purchase.status <> 'cancelled'`),
adding `getIntegerParameter("purchase_signal_weight", 2)` points on top of any existing `rating` for a
purchased (user, product) pair — the `FULL OUTER JOIN` is what lets a purchased item with **no** prior
interaction still enter the similarity matrix, with `rating` equal to just the purchase weight. This
signal CTE replaces `user_product_interaction`/`user_promotion_interaction` in all three places the
old query referenced them (`upi_a`, `upi_b`, the outer `upi` in `user_candidate_recommendation`) — the
similarity/ranking SQL itself is unchanged. A global `isCollaborativeFilteringTrainingRunning` flag
prevents overlapping runs. In addition to the manual `POST /api/v1/recommendations/train` trigger,
`startCollaborativeFilteringTrainingScheduler()` (called from `app.listen`'s callback) self-schedules
on a loop via `setTimeout`, first firing 10s after boot, then re-reading the interval from a DB-stored
parameter (`getIntegerParameter("collaborative_filtering_training_interval_minutes", 10)`) after every
run — so the interval can be changed at runtime by updating that DB row, no redeploy needed.

**Health/root**: `GET /` returns plain text (not the JSON envelope) — deliberate, per the comment
directly above it in server.js. `GET /api/v1/health` does a DB round-trip check.

Deployed at `https://fan-engagement-api-production.up.railway.app` on Railway; this URL is hardcoded
into both client apps (`fan-engagement-web`, `fan-engagement-android`), so a route path or response
shape change here requires updating callers in those sibling repos.
