# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — run with nodemon (auto-restart on save)
- `npm start` — run with plain node
- No test suite, no lint script configured. There is no build step (plain CommonJS, no bundler/transpiler).

## Required environment (`.env`)

The app throws at startup (before listening) if any of these are missing:
`DATABASE_URL`, `JWT_SECRET`, `API_PUBLIC_URL`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`,
`FIREBASE_SERVICE_ACCOUNT_JSON`, `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`, `ENDPOINT`.
`PORT` defaults to `3000`. `.env.example` only lists a subset — it's stale on the rest, copy the full
list above when setting up a local `.env`.

The 5 bucket variables (`BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`, `ENDPOINT`) come from
a Railway Storage Bucket (`catalog-images`, in the `fan-engagement-walter-ormeño` project) enlazado al
servicio por variable reference (preset AWS SDK) — see spec 20. Locally, get them from that bucket's
Credentials tab in the Railway dashboard (or `railway variables` if linked) and paste them into `.env`;
never fabricate values.

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
    middlewares/           # authenticateToken.js, requireAdmin.js
    validation/            # listQuery.js (parseInteractionListQuery), patterns.js (regexes, statuses)
    sql/                   # promotionUnitPrice.js (PROMOTION_UNIT_PRICE_SELECT/JOIN)
  modules/
    health/                # GET /, GET /api/v1/health
    auth/                  # register, login, verify-email, resend-email-verification + templates/
    users/                 # GET /users, PUT|DELETE /users/me/fcm-token
    images/                # GET /images
    catalog/               # GET /products, GET /promotions
    catalogAdmin/           # admin/* CRUD of products, promotions, categories, member promotions
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
signed JWT payload also carries `userType` (spec 19, added so `requireAdmin` below can read it from
`req.authenticatedUser` without a DB round-trip) alongside `sub`/`username`/`email` — a token issued
before spec 19 won't have it, so `requireAdmin` treats a missing/mismatched `userType` claim as
non-admin (`403`), never a crash. The login body also accepts an optional `client` field, restricting login to the account type each
client expects: `client === "web"` rejects with `403`/`data.reason: "not_admin"` when the matched
user's `user_type !== 2` (restricting `fan-engagement-web` to admin accounts only); `client ===
"android"` rejects with `403`/`data.reason: "not_fan"` when `user_type !== 1` (restricting
`fan-engagement-android` to fan accounts only, reversing the earlier exception that let admins log
in there unrestricted). Either rejection returns no `accessToken`/`user` in the response. Any other
value or an absent `client` field leaves login unchanged.

**Admin authorization** (spec 19): `requireAdmin` middleware
(`src/shared/middlewares/requireAdmin.js`) responds `403` unless
`req.authenticatedUser.userType === 2` — it always runs **after** `authenticateToken` (so a request
with no/invalid token still gets `401` from `authenticateToken` first, never a `403` from
`requireAdmin`). This is the first server-side role check in the API — every previous admin-only
surface (dashboard, notifications, parameters) was gated client-side only. All `/api/v1/admin/*`
routes (`catalogAdmin` module below) apply both middlewares via a single `router.use("/api/v1/admin",
authenticateToken, requireAdmin)` in `catalogAdmin.routes.js`, rather than repeating both on every
route like other modules do with `authenticateToken` alone.

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
- `products`, `promotions` — read-only catalog (authenticated); both now filter `WHERE active =
  true` (spec 19) so an item soft-deleted through the admin CRUD below stops appearing here
- `admin/products`, `admin/product-categories`, `admin/promotions`, `admin/promotion-categories`,
  `admin/member-promotions` (`src/modules/catalogAdmin/`, spec 19) — every route requires
  `authenticateToken` + `requireAdmin` (see **Admin authorization** above). `GET admin/products`,
  `GET admin/promotions`, `GET admin/member-promotions` are paginated (`search`/`page`/`pageSize`,
  same `COUNT(*) OVER()` pattern as `purchases`/`users/fans`) and include inactive rows, unlike their
  public read-only counterparts; the two category endpoints (`admin/product-categories`,
  `admin/promotion-categories`) return a plain unpaginated list, matching the route table in spec 19
  (no `search`/`page`/`pageSize` params for those two). `product`/`promotion` support soft delete:
  `DELETE` sets `active = false` (row kept, never physically removed — interaction/purchase history
  FKs into these tables), and `active` is also accepted on `PUT` so the same endpoint reactivates a
  previously deactivated item — there's no separate `/restore` route. Categories have no `active`
  column; `DELETE` on a category is a real `DELETE FROM`, blocked with `409` (pre-checked with a
  `COUNT(*)` query, not a caught FK error) if any `product`/`promotion` still references it.
  `POST`/`PUT admin/promotions` take `productIds: number[]` and replace `promotion_product` for that
  promotion in one transaction (`replacePromotionProducts` in `catalogAdmin.repository.js`: delete
  all rows for the promotion, then re-insert the given list) — always the full desired list, no
  incremental add/remove. `GET admin/promotions` also includes each row's `productIds` (spec 21
  addendum): `listPromotions` in `catalogAdmin.service.js` runs a second query
  (`findPromotionProductIdsByPromotionIds`) against `promotion_product` for the whole page's promotion
  ids and merges the results in JS, mirroring the `notification_log` + recipients pattern in
  `notifications.service.js` — kept as a second query rather than a `JOIN`/`array_agg` in the main
  paginated query so the `COUNT(*) OVER()` window function isn't affected by the join's row
  multiplication. Payload validation mirrors the schema's own `CHECK` constraints
  (`price >= 0`, `0 < discountPercentage <= 100`, `buyQuantity > payQuantity` when both are given,
  varchar length caps) and is done in `catalogAdmin.service.js`, not the repository; a `deadline`
  must additionally be a real future date, but only when creating a promotion (an update may set any
  valid date). A foreign-key violation on an unknown `productCategoryId`/`promotionCategoryId`/
  `productIds` entry is caught by constraint name (same pattern as
  `interactions.service.js`) and re-thrown as a clean `400 AppError` instead of a raw `500`.
  `product`, `product_category`, `promotion`, and `promotion_category` did not have an `id` sequence/
  `DEFAULT` before spec 19 (unlike `member_promotion`, which already did) — they were only ever
  seeded with explicit ids, never inserted from application code — so spec 19 also added
  `<table>_id_seq` + `ALTER TABLE ... ALTER COLUMN id SET DEFAULT nextval(...)` for all four tables
  (seeded starting at `MAX(id) + 1`) as a prerequisite for these `POST` endpoints to work at all; this
  wasn't in the spec's own migration section, it surfaced while implementing it.
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
- `dashboard/engagement/user/:userId` (spec 17) — authenticated; per-fan mirror of the block above,
  entirely separate from it (`fetchEngagementRawData` above is untouched). `:userId` must be a
  positive integer resolving to a `public."user"` row with `user_type = 1`, else `404` via `AppError`
  (an admin id, or any nonexistent id, both 404). `fetchFanById`/`fetchUserEngagementRawData` in
  `dashboard.repository.js` run everything `WHERE user_id = $1` (or `WHERE ... AND user_id = $1` for
  the funnel/purchase queries): product/promotion interaction totals+avg rating, last activity
  (`GREATEST` of both interaction tables' `MAX(last_interaction_at)`, defaulting to
  `'-infinity'::timestamptz` — node-postgres parses that as the JS value `-Infinity`, not a `Date`, so
  the service checks `instanceof Date` rather than truthiness to decide `lastActivityAt: null`), the
  same 30-day `generate_series` activity shape as the global endpoint but per-user and without
  `activeFans` (not meaningful for one user), the funnel (`hasInteraction`/`hasPurchase` booleans
  instead of counts, since it's one fan), top-5 recommendations and top-5 interacted items per
  product/promotion. Response `data` shape: `{ user: { id, username, fullName }, kpis: {
  productInteractions, promotionInteractions, totalInteractions, averageProductRating,
  averagePromotionRating, purchases, purchasedAmount, lastActivityAt }, activity: { days: [{ date,
  interactions }] (always 30) }, funnel: { hasInteraction, hasPurchase, purchasedItems,
  purchasedAmount }, recommendedProducts, recommendedPromotions, topProducts, topPromotions }`. Does
  not read/affect the global `GET /dashboard/engagement`, its top-5 rankings, or recommender health —
  those stay global by explicit product decision (spec 17).
- `users` — authenticated; lists all users (`id`, `username`, `email`, `hasFcmToken`), used by the
  web's Notifications tab to populate its recipient autocomplete. `id` is explicitly cast
  (`id::integer`) in the query — `pg` returns `bigint` columns as strings by default, and this `id`
  round-trips back into `POST /notifications/send`'s `userIds` body, which validates with
  `Number.isInteger`; without the cast every send to specific users 400s
- `users/fans` — authenticated; registered in `users.routes.js` **before** `GET /users` (spec 17
  convention — no dynamic-param routes exist in this module yet, but keep new static routes above it
  regardless). Paginated/filterable list of `user_type = 1` rows only (`id`, `username`, `email`,
  `fullName`), for the web dashboard's fan search/picker (spec 17) — does not touch `GET /users`,
  which keeps feeding the Notifications autocomplete unchanged. Query params: `search` (`ILIKE` on
  `username`/`email`/`full_name`, validated with `INTERACTION_TEXT_FILTER_REGEX`), `page` (default
  `1`), `pageSize` (`INTERACTION_PAGE_SIZES`, default `15`) — same paginate-with-`COUNT(*) OVER()`
  pattern as `purchases.service.js`'s `listPurchases`, `AppError(400, …)` for an invalid `search`.
  Response `data`: `{ fans: [...], pagination: { page, pageSize, totalItems, totalPages } }`.
- `images` — authenticated; lists `public.image` rows (`id`, `url`, `sourceType`, `sourceId`,
  `objectKey`), used by the web's Notifications tab image picker and (spec 21) the generalized
  `ImagePicker` in the Gestión tab's catalog CRUD forms. Each row's returned `url` is resolved
  (`src/shared/images/presignedUrlCache.js`'s `resolveImageUrl`): a value starting with `http` (legacy
  external URL) is returned as-is; anything else is treated as a bucket `object_key` and presigned
  (7-day signature, cached in-process by key and transparently renewed once under ~24h of life
  remain — an in-memory cache, so it resets on every restart/redeploy with no user-visible downtime).
  This same resolver is applied to `product.image`/`promotion.image` (`catalog.service.js`) and
  `member_promotion.image` (`membership.service.js`) — the storage convention (http passthrough vs.
  bucket key) is shared across all four `image`-bearing columns (spec 20). The `objectKey` field
  (spec 21 addendum, additive — `null` for a legacy `http` row) exists because the resolved `url` is
  presigned and never re-signed once persisted elsewhere: a caller that stores this endpoint's `url`
  value (instead of the raw `objectKey`) into `product.image`/`promotion.image`/`member_promotion.image`
  bakes in a signature that silently stops working once it expires, since `resolveImageUrl` treats
  anything starting with `http` as a permanent external URL and never re-signs it. Callers persisting
  a picked image (as opposed to just displaying it, like the Notifications send flow) must store
  `objectKey ?? url` instead.
- `admin/images` (`src/modules/images/`, spec 20) — `authenticateToken` + `requireAdmin`, mounted the
  same way as `catalogAdmin`'s admin routes. `POST admin/images` (multipart, field name `file`)
  uploads a catalog image to the bucket: `imagesUploadRateLimit.middleware.js` first enforces 20
  uploads/hour per admin user (in-memory sliding window, counts every request that reaches the route,
  including ones later rejected for size/type — not just successful ones), then
  `imagesUpload.middleware.js` (multer, memory storage, 5MB hard limit, translated to a clean `400`
  `AppError` on `LIMIT_FILE_SIZE` instead of a raw multer error) parses the file. `images.service.js`
  then validates the *real* file type by magic bytes (`src/shared/images/detectImageType.js` — jpeg/
  png/gif/webp signatures; extension and declared `Content-Type` are never trusted), uploads to the
  bucket at a random key (`catalog/<uuid>.<ext>`) via `@aws-sdk/client-s3`, and inserts a
  `public.image` row (`source_type: 'upload'`, `source_id: null`, `object_key` and `url` both set to
  that key). `GET admin/images/:id/usage` looks up which `product`/`promotion`/`member_promotion` rows
  currently have that image's value in their own `image` column (`{ products, promotions,
  memberPromotions }`, each `{ id, name|title }`). `DELETE admin/images/:id` removes the object from
  the bucket (if it has one — a legacy external-URL row has no `object_key`) and the `public.image`
  row; nothing else is auto-deleted, and a row is never removed just because a product/promotion later
  stops referencing it (deliberate — see spec 20's Decisiones) — checking usage before deleting is a
  UI-level responsibility (spec 21).
  `scripts/migrate-images-to-bucket.js` (run with `node scripts/migrate-images-to-bucket.js`, or
  `railway run -- node scripts/migrate-images-to-bucket.js` against a linked environment) migrates
  every remaining external-URL `image` on `product`/`promotion`/`member_promotion` to the bucket:
  downloads each URL, validates its real type the same way as the upload endpoint, uploads it, and
  updates the row's `image` column to the new `object_key` — idempotent (only selects rows whose
  `image` still starts with `http`) and non-aborting (a single row's failure, e.g. a dead external
  URL, is logged and skipped, the rest still run). Per the root `CLAUDE.md`'s production-DB rule, this
  script is the one explicit, spec-authorized exception allowing the agent to run it directly against
  Railway — every other production SQL still goes through the user via pgAdmin.
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
  the 3 `parameters` rows deciding server-side visibility of the free-shipping promotion (spec 15,
  correcting spec 14): `free_shipping_notice_enabled` (`getBooleanParameter`, default `true`),
  `free_shipping_notice_start_hour` (default `9`), `free_shipping_notice_end_hour` (default `21`) —
  `data.settings: { enabled, startHour, endHour }`. There is no `intervalDays`/"cada cuántos días
  reaparece" concept anymore — spec 14 stored that per-device on Android, which meant every fan saw
  the banner at a different time; spec 15 dropped it entirely in favor of one enabled+hour-window
  decision that's the same for every fan. `PUT` validates `startHour` 0-23, `endHour` 1-24,
  `startHour < endHour`, and persists with the same transaction + upsert-per-key pattern as
  `personalized-notifications`. `src/shared/promotions/freeShippingVisibility.js`
  (`isFreeShippingPromotionVisible(pool)`) reads these 3 parameters plus the current hour in
  `America/Lima` (same `Intl.DateTimeFormat` pattern as `personalizedNotifications.job.js`) and
  returns whether the promotion should be visible right now; `catalog.repository.js`'s
  `listPromotions()` and `recommendations.repository.js`'s `listPromotionRecommendations()` both take
  this flag and filter out `promotion_category_id = 3` ("Free Shipping", exclusive to this one
  promotion) unless it's `true` — same criterion, same result, for every fan hitting either endpoint.
  On top of that global flag, `hasUserPurchasedFreeShippingPromotion(pool, userId)` (same file) is a
  **per-user** exception (post-spec-15, added on explicit request): a fan with any non-cancelled
  purchase of this promotion stops seeing it, in both endpoints — `catalog.service.js`'s
  `listPromotions(userId)` and `recommendations.service.js`'s `listPromotionRecommendations(userId)`
  AND this into the global flag before calling the repository, so the repository query itself is
  unchanged, it just receives `false` for a fan who already bought it. This is why
  `GET /api/v1/promotions` (`catalog.controller.js`) now reads `req.authenticatedUser.sub` and passes
  it to the service — it used to ignore the authenticated user entirely.
  Free shipping is a real, purchasable promotion again: `public.promotion` row `id = 4`
  ("Envío gratis por tiempo limitado"), `promotion_category_id = 3`, **no** row in
  `promotion_product` — it doesn't depend on any catalog product. Its price comes from the new
  `promotion.fixed_price` column (`50.00` here) instead of the usual `AVG(product.price)` derivation:
  `PROMOTION_UNIT_PRICE_SELECT` (`src/shared/sql/promotionUnitPrice.js`) now checks `fixed_price`
  first, before `discount_percentage`/`buy_quantity`/`pay_quantity` — those other three still assume
  a `promotion_product` row and are unchanged for every other promotion. `fixed_price` is meant only
  for a promotion with no linked products; nothing enforces that beyond convention (the `CHECK` just
  requires `fixed_price IS NULL OR fixed_price > 0`), so a promotion with both `fixed_price` **and**
  `promotion_product` rows would have `fixed_price` win silently.
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
