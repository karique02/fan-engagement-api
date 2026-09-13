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
export). `initializeApp({ credential: cert(...) })` runs as a side effect of requiring
`src/config/firebase.js` (required once from `src/app.js`), backing the `notifications/*` routes
below.

`NODE_ENV=production` switches the `pg` Pool to `ssl: { rejectUnauthorized: false }`; otherwise SSL
is disabled. SMTP is Gmail specifically (`nodemailer.createTransport({ service: "gmail", ... })`),
using `SMTP_USER`/`SMTP_PASS` as Gmail app-credentials.

The `pg` Pool (`src/config/database.js`) sets `options: "-c timezone=America/Lima"`, forcing every
connection's Postgres session `TimeZone` GUC to `America/Lima` instead of the server/cloud default
(typically UTC on Railway) — backend-only, no schema change. This matters for more than display: most
`timestamp with time zone` columns store an absolute instant and are unaffected either way, but
`promotion.deadline` is `timestamp without time zone`, and comparisons like `cart.repository.js`'s
`pr.deadline < CURRENT_TIMESTAMP` implicitly interpret that naive timestamp using the session's
`TimeZone` to convert it to an instant — without this setting (session defaulting to UTC), a deadline
entered as Lima wall-clock time was being read 5 hours off. Also fixes any `::text`/`to_char(...)`
timestamp formatting done in SQL to render as Lima time instead of UTC. Does **not** affect the
response envelope's `timestamp` field (`src/shared/http/response.js`, `new Date().toISOString()`) —
that's JS-side and always UTC `Z`, a separate concern from DB session timezone. Also does not change
what a DB client with its own separate session (e.g. pgAdmin) displays — that's governed by that
client's own connection settings, not this pool's.

## Architecture

Modular by feature (spec 08). `server.js` at the repo root is ~10 lines: it requires `src/app.js`,
calls `app.listen(...)`, and starts the two background job schedulers. Everything else lives under
`src/`:

```
src/
  app.js                  # express, cors, json, mounts every module router, 404 + error handler
  config/                 # env.js, database.js (pg Pool), firebase.js, mailer.js
  shared/
    http/                 # response.js (sendSuccess/sendError), asyncHandler.js
    errors/                # AppError.js, error.middleware.js, notFound.middleware.js
    middlewares/           # authenticateToken.js
    validation/            # listQuery.js (parseInteractionListQuery), patterns.js (regexes, statuses)
    sql/                   # promotionUnitPrice.js (PROMOTION_UNIT_PRICE_SELECT/JOIN)
  modules/
    health/                # GET /, GET /api/v1/health
    auth/                  # register, login, verify-email, resend-email-verification + templates/
    users/                 # GET /users, PUT|DELETE /users/me/fcm-token
    images/                # GET /images
    catalog/               # GET /products, GET /promotions
    interactions/          # products/promotions interaction routes (2 public, 2 authenticated)
    cart/                  # 6 shopping cart routes
    purchases/             # checkout + history routes, fetchPurchaseItemsByPurchaseIds
    notifications/         # send, log, delete log, personalized/run
    parameters/            # GET|PUT personalized-notifications, GET|PUT free-membership, getIntegerParameter()/getBooleanParameter()
    recommendations/       # train (delegates to the CF job), products/promotions recommendations
    dashboard/             # GET /dashboard/engagement
    membership/            # GET /membership/me, POST /membership/trial, GET /membership/promotions
  jobs/
    collaborativeFiltering.job.js     # trainCollaborativeFiltering + its scheduler + running-flag
    personalizedNotifications.job.js  # runPersonalizedNotificationCycle + its scheduler + running-flag
```

Each module follows the same layering: `<module>.routes.js` (declares path/method/middleware) →
`<module>.controller.js` (parses `req`, calls the service, calls `sendSuccess`/`sendError`, wrapped in
`asyncHandler` so a rejected promise reaches the error middleware without a manual `try/catch`) →
`<module>.service.js` (orchestrates, throws `AppError(statusCode, message, data)` for expected error
conditions) → `<module>.repository.js` (SQL literal, receives a pool or a transaction client, returns
raw `pg` rows). `auth` additionally has `auth.schema.js` (request-shape validation, returning
`{ ok: true, value }` or `{ ok: false, statusCode, message }`) and `templates/` for its two rendered
HTML pieces (`verificationEmail.js`, `verificationPage.js`). To find or change an endpoint, go to its
module folder under `src/modules/` rather than searching a single file.

**Data access**: raw `pg` `Pool` (`src/config/database.js`), no ORM/query builder. SQL is written
literally in each repository as tagged template strings against `public.<table>` qualified names,
with `$1`/`$2`… placeholders — copied verbatim from the pre-modularization code, not rewritten.
Multi-step writes (e.g. recommendation training, checkout) explicitly `BEGIN`/`COMMIT`/`ROLLBACK` on a
checked-out client via `pool.connect()` in the service layer — follow that pattern for any new
multi-statement transaction instead of relying on autocommit per query.

**Auth**: `authenticateToken` middleware (`src/shared/middlewares/authenticateToken.js`) requires
`Authorization: Bearer <token>`, verifies with `jwt.verify(token, JWT_SECRET)`, and sets
`req.authenticatedUser` (JWT payload; user id is `.sub`). Apply it per-route in each module's
`*.routes.js` — there's no global auth gate, and a few routes are intentionally public (see below).
Registration hashes passwords with `argon2` and issues an email-verification flow: a raw random token
is emailed, only its SHA-256 hash is stored in `email_verification`
(`createOrReplaceEmailVerification` in `src/modules/auth/auth.repository.js`).
`GET /api/v1/auth/verify-email` renders an HTML landing page
(`renderEmailVerificationPage` in `src/modules/auth/templates/verificationPage.js`), not JSON — it's
meant to be opened directly from the emailed link.
`POST /api/v1/auth/login` also returns `data.user.userType` (the `public."user".user_type` column,
`1` or `2`) — used by `fan-engagement-web` to gate its Dashboard tab/route to `userType === 2`. The
signed JWT itself is unchanged (`sub`/`username`/`email` only); `userType` travels only in the login
response body. The login body also accepts an optional `client` field, restricting login to the account type each
client expects: `client === "web"` rejects with `403`/`data.reason: "not_admin"` when the matched
user's `user_type !== 2` (restricting `fan-engagement-web` to admin accounts only); `client ===
"android"` rejects with `403`/`data.reason: "not_fan"` when `user_type !== 1` (restricting
`fan-engagement-android` to fan accounts only, reversing the earlier exception that let admins log
in there unrestricted). Either rejection returns no `accessToken`/`user` in the response. Any other
value or an absent `client` field leaves login unchanged.

**Response envelope**: every route responds via `sendSuccess(res, req, { statusCode, message, data })`
or `sendError(res, req, { statusCode, message, data })` (`src/shared/http/response.js`). Response
shape is always `{ code, status, message, timestamp, method, data }`. Always use these helpers for new
routes — never call `res.json()` directly. `message` strings are user-facing and in Spanish; keep new
ones consistent in tone (see the `sendError`/`sendSuccess` defaults for register/verify flows as
examples).

**Errors**: unmatched routes and thrown errors fall through to the two catch-alls mounted last in
`src/app.js` — `notFoundMiddleware` (`src/shared/errors/notFound.middleware.js`, a 404) then
`errorMiddleware` (`src/shared/errors/error.middleware.js`, a 4-arg handler that logs and returns a
generic 500, or formats an `AppError` using its own `statusCode`/`message`/`data` if that's what was
thrown). Controllers are wrapped in `asyncHandler` (`src/shared/http/asyncHandler.js`), so a service
that simply `throw`s (an `AppError` or otherwise) reaches the error middleware without each controller
needing its own `try { ... } catch (error) { next(error); }` boilerplate.

**Route groups** (all under `/api/v1`):
- `auth/*` — register, login, verify-email (public, HTML response), resend-email-verification
- `users/me/fcm-token` — push token register/delete (authenticated)
- `products`, `promotions` — read-only catalog (authenticated)
- `products/interaction`, `promotions/interaction` — fan engagement tracking (authenticated); this is
  the core product signal the recommender trains on. `products/interaction/all` and
  `promotions/interaction/all` are the paginated/filterable list equivalents and are intentionally
  **not** authenticated (see `src/modules/interactions/interactions.routes.js`). Both accept the same
  query params, validated by the shared `parseInteractionListQuery()` helper
  (`src/shared/validation/listQuery.js`): `username` and
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
  linked products (see `PROMOTION_UNIT_PRICE_SELECT`/`PROMOTION_UNIT_PRICE_JOIN` in
  `src/shared/sql/promotionUnitPrice.js` — reused by checkout's cart read in
  `purchases.repository.js`). `item_name`/`unit_price`/`line_total` are copied at checkout and never
  recalculated against the catalog afterward, so a later price or promotion change doesn't alter
  historical purchases. `GET purchases` is the paginated/filterable global history (web admin) — same
  paginate-with-`COUNT(*) OVER()` pattern as `products/interaction/all`, reusing
  `INTERACTION_TEXT_FILTER_REGEX`/`INTERACTION_DATE_REGEX`/`INTERACTION_PAGE_SIZES`
  (`src/shared/validation/patterns.js`), with its own `status` filter
  (`pending`/`completed`/`cancelled`) validated against `PURCHASE_STATUSES`; `GET purchases/me` is the
  same paginated shape forced to the authenticated user, **with** each purchase's items inlined (via
  the shared `fetchPurchaseItemsByPurchaseIds()` helper in `purchases.repository.js`) to avoid Android
  needing an N+1 detail call;
  `GET purchases/:purchaseId` is the single-purchase detail (`404` if missing), items included, current
  catalog `image`/`categoryName` joined in per item alongside the immutable snapshot fields;
  (`purchases.routes.js` registers `GET /purchases/me` **before** `GET /purchases/:purchaseId` —
  reversing that order would make Express match `me` as `:purchaseId`);
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
- `GET`/`PUT parameters/personalized-notifications` (`src/modules/parameters/`) — authenticated;
  read/write the 6 `parameters` rows driving the personalized notification scheduler below plus the
  recommender's purchase boost
  (`data.settings`: `enabled`, `intervalMinutes`, `repeatDays`, `startHour`, `endHour`,
  `purchaseSignalWeight`). `PUT` validates ranges (`intervalMinutes` 1-1440, `repeatDays` 0-365,
  `startHour` 0-23, `endHour` 1-24, `startHour < endHour`, `purchaseSignalWeight` 0-10) and `400`s via
  `sendError` otherwise; persists with `INSERT ... ON CONFLICT (key) DO UPDATE` per key inside a
  transaction. A changed `intervalMinutes` only takes effect on the *next* scheduled cycle (the
  current one is already scheduled) — same behavior as the CF training interval below. The endpoint's
  path/name stayed as-is (not renamed to something recommender-related) specifically so the existing
  web client didn't need a route change for this one extra field.
- `GET`/`PUT parameters/free-membership` (`src/modules/parameters/`) — authenticated; read/write the
  single `free_membership_notice_enabled` parameter (`data.settings: { noticeEnabled }`) that controls
  whether Android's Home shows the free-trial membership highlight card to a fan without an active
  membership. Uses the new `getBooleanParameter(pool, key, defaultValue)` in
  `parameters.repository.js`, added alongside `getIntegerParameter` (not touching it) because
  `getIntegerParameter` has a known bug that discards `0` (`parameters.repository.js`, `parsedValue <=
  0` falls back to the default) — no boolean flag modeled through it can ever be turned off.
  `getBooleanParameter` reads `'1'`/`'0'` literally, `0` included.
- `membership/*` (`src/modules/membership/`) — authenticated. `GET membership/me` resolves the
  authenticated user's membership status from `user_membership` (no `status` column — validity is
  derived as `ends_at > now()` on the most recent row per user, no expiry job) plus
  `free_membership_notice_enabled`: `{ isMember, source, startedAt, endsAt, daysRemaining,
  trialAvailable, noticeEnabled }`. `trialAvailable` is `true` only if the user has never inserted a
  `source = 'trial'` row (a partial unique index, `uq_user_membership_trial`, enforces one trial per
  user at the DB level). `POST membership/trial` inserts a `source = 'trial'` row with `ends_at = now()
  + 1 month`; `409`s with `data.reason = 'trial_already_used'` if a trial row already exists (checked
  in the service before insert, for a clear message — the unique index is the actual guarantee).
  `GET membership/promotions` lists `member_promotion WHERE active = true`, each item annotated with
  `locked: true` when the authenticated user has no membership row with `ends_at > now()`.
  `member_promotion` is a table entirely separate from `promotion` (by explicit product decision): it
  has no relation to `promotion_category` or `user_promotion_interaction`, so member-only promotions
  never enter the collaborative filtering job or `GET /promotions`/`GET /promotions/recommendations`
  without any extra `WHERE` clause in those existing queries. Seeded with 4 invented-but-club-coherent
  rows reusing image URLs already present in `public.image` — documented here as demo data, not real
  club promotions. Renewing membership after the trial expires reuses the existing `POST
  /api/v1/purchases` flow against product id 15 (`'Membresía Oficial'`, already a normal catalog
  product) — there is no automatic link from a completed purchase to a new `user_membership(source =
  'paid')` row; an admin has to create that manually today (out of scope, see spec 13's Riesgos).
- `GET`/`PUT parameters/free-shipping-notice` (`src/modules/parameters/`) — authenticated; read/write
  the 4 `parameters` rows driving Android's periodic free-shipping banner on Home (spec 14):
  `free_shipping_notice_enabled` (`getBooleanParameter`, default `true`),
  `free_shipping_notice_interval_days` (default `14`), `free_shipping_notice_start_hour` (default
  `9`), `free_shipping_notice_end_hour` (default `21`) — `data.settings: { enabled, intervalDays,
  startHour, endHour }`. `PUT` validates the same shape as `personalized-notifications`
  (`intervalDays` 1-365, `startHour` 0-23, `endHour` 1-24, `startHour < endHour`) and persists with
  the same transaction + upsert-per-key pattern. This endpoint replaces the fixed promotion
  `id = 4` ("Envío Gratis por Mochila Oficial"), deleted from `public.promotion` — the banner is
  purely informational (Home-only, no checkout/shipping-cost logic anywhere in the schema) and the
  web only manages these parameters, it doesn't render the banner itself.
- `POST notifications/personalized/run` — authenticated; runs
  `runPersonalizedNotificationCycle({ ignoreSchedule: true })` immediately, bypassing the `enabled`
  flag and the hour window (but still respecting `repeatDays`) — a manual test trigger for admins.
  `{ skipped: true }` if a cycle is already running, same criterion as `/recommendations/train`.

**Personalized notifications**: both the cycle function and its scheduler live together in
`src/jobs/personalizedNotifications.job.js` (per spec 08, so the module and its in-memory
`isPersonalizedNotificationCycleRunning` flag share the same closure).
`startPersonalizedNotificationScheduler()` mirrors
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

**Recommendations engine**: like the personalized-notifications job, `trainCollaborativeFiltering()`,
`trainProductRecommendations()`/`trainPromotionRecommendations()`,
`startCollaborativeFilteringTrainingScheduler()`, and the `isCollaborativeFilteringTrainingRunning`
flag all live together in `src/jobs/collaborativeFiltering.job.js` (per spec 08); the `recommendations`
module's `POST /recommendations/train` route just calls into this job.
`trainCollaborativeFiltering()` runs product- and promotion-level
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
similarity/ranking SQL itself is unchanged. The `isCollaborativeFilteringTrainingRunning` flag
prevents overlapping runs. In addition to the manual `POST /api/v1/recommendations/train` trigger,
`startCollaborativeFilteringTrainingScheduler()` (called from `server.js`'s `app.listen` callback)
self-schedules on a loop via `setTimeout`, first firing 10s after boot, then re-reading the interval
from a DB-stored parameter (`getIntegerParameter(pool, "collaborative_filtering_training_interval_minutes",
10)`, from `src/modules/parameters/parameters.repository.js`) after every run — so the interval can be
changed at runtime by updating that DB row, no redeploy needed.

**Health/root**: `GET /` (`src/modules/health/health.controller.js`) returns plain text (not the JSON
envelope) — deliberate. `GET /api/v1/health` does a DB round-trip check.

Deployed at `https://fan-engagement-api-production.up.railway.app` on Railway; this URL is hardcoded
into both client apps (`fan-engagement-web`, `fan-engagement-android`), so a route path or response
shape change here requires updating callers in those sibling repos.
