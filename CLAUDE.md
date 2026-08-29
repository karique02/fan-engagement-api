# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — run with nodemon (auto-restart on save)
- `npm start` — run with plain node
- No test suite, no lint script configured. There is no build step (plain CommonJS, no bundler/transpiler).

## Required environment (`.env`)

The app throws at startup (before listening) if any of these are missing:
`DATABASE_URL`, `JWT_SECRET`, `API_PUBLIC_URL`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
`PORT` defaults to `3000`. `.env.example` only lists `PORT`/`DATABASE_URL`/`JWT_SECRET` — it's stale,
copy the full list above when setting up a local `.env`.

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
- `recommendations/train` — manually triggers collaborative filtering; **not authenticated**; no-ops
  (`{ skipped: true }`) if a run is already in progress
- `products/recommendations`, `promotions/recommendations` — authenticated; read the precomputed
  recommendation tables, they do not train on request
- `dashboard/engagement` — authenticated; aggregates KPIs, a 30-day activity approximation (grouped
  by `last_interaction_at`, not a real event history — see the schema note below), top-5 product/
  promotion rankings, recommender coverage, and the interaction→cart funnel, for the web's
  `/dashboard` page

**Recommendations engine**: `trainCollaborativeFiltering()` (server.js:452) runs product- and
promotion-level collaborative filtering in-process against interaction/cart data
(`trainProductRecommendations`/`trainPromotionRecommendations`, server.js:311/381) inside a single
transaction, writing to `user_product_recommendation` / `user_promotion_recommendation`. A global
`isCollaborativeFilteringTrainingRunning` flag prevents overlapping runs. In addition to the manual
`POST /api/v1/recommendations/train` trigger, `startCollaborativeFilteringTrainingScheduler()`
(server.js:498, called from `app.listen`'s callback) self-schedules on a loop via `setTimeout`, first
firing 10s after boot, then re-reading the interval from a DB-stored parameter
(`getIntegerParameter("collaborative_filtering_training_interval_minutes", 10)`, server.js:288) after
every run — so the interval can be changed at runtime by updating that DB row, no redeploy needed.

**Health/root**: `GET /` returns plain text (not the JSON envelope) — deliberate, per the comment
directly above it in server.js. `GET /api/v1/health` does a DB round-trip check.

Deployed at `https://fan-engagement-api-production.up.railway.app` on Railway; this URL is hardcoded
into both client apps (`fan-engagement-web`, `fan-engagement-android`), so a route path or response
shape change here requires updating callers in those sibling repos.
