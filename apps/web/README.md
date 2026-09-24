# apps/web

Next.js 16 (App Router, Turbopack) app for Stumari: the hotel landing page (EN/KA/RU), the pilot application form, guest checkout (`/h/[slug]`), the booking page (`/b/[id]`), `/my`, `/model`, and the API. The hotel dashboard and admin land here next (English only). Specs: [`docs/architecture/api.md`](../../docs/architecture/api.md), [`data-model.md`](../../docs/architecture/data-model.md), [`configuration.md`](../../docs/architecture/configuration.md).

> This Next.js version differs from older ones. Read the bundled docs in `node_modules/next/dist/docs/` before touching routing, route handlers, metadata or caching (see `AGENTS.md`).

## Run locally

```bash
cp apps/web/.env.example apps/web/.env.local   # optional: everything has a dev default
pnpm --filter web db:migrate                   # creates apps/web/.data/stumari.db
pnpm --filter web dev                          # http://localhost:3000
```

With a chain: `pnpm --filter @stumari/scripts bootstrap -- --cluster localnet` (Surfpool in Docker, the program, mock USDC, the demo hotel `stumari-demo` and `.env.local`), then `pnpm --filter web dev`, open `/h/stumari-demo`, pick the test wallet, "Get 500 test USDC", "See prices", pay. `pnpm --filter web cron` runs both cron jobs every 60 s against the running app; `pnpm --filter web e2e` drives quote → pay → confirm → cancel over HTTP (`E2E_BASE_URL`, default `http://localhost:3000`).

| Script | What it does |
|---|---|
| `dev` / `build` / `start` | Next.js |
| `test` | Vitest: application validator, locale + dictionary parity, pilot offer parity, rate limiter, env parsing, money; availability/occupancy/holds (incl. concurrent holds across connections), SSRF guard, iCal parse/export/sync, `/api/tx/send` allow-list, pricing wiring + pay checks, public booking view (no PII), guest action windows |
| `typecheck` / `lint` | `next typegen && tsc --noEmit` / ESLint |
| `cron` | `scripts/cron-loop.ts`: POSTs `/api/cron/sync` and `/api/cron/release` every 60 s with `CRON_SECRET` |
| `e2e` | `scripts/e2e-checkout.ts`: HTTP end-to-end guest flow against a running app on localnet/devnet (refuses mainnet) |
| `db:generate` | `drizzle-kit generate` — new SQL migration in `drizzle/` after editing `lib/db/schema.ts` |
| `db:migrate` | apply migrations to `LIBSQL_URL` (reads `.env.local`) |

## Layout

```
app/
  [lang]/            root layout for localized pages: <html lang>, static params en/ka/ru
    page.tsx         landing          → served at /, /ka, /ru
    apply/page.tsx   pilot application → /apply, /ka/apply, /ru/apply
    opengraph-image.tsx
  (site)/            root layout for English-only pages
    privacy/, model/ /privacy, /model (calibration chart from ml/reports)
    (guest)/         wallet provider + guest header: h/[slug] checkout, b/[bookingId] booking, my
  api/               route handlers (table below)
  global-not-found.tsx, icon.svg, apple-icon.tsx, robots.ts, sitemap.ts, fonts.ts, globals.css
components/          header, footer, language switcher, landing sections, apply form,
                     checkout/ (menu, refund timeline, "Why this price"), booking/, wallet/, model/
lib/
  env-schema.ts      zod-validated server env (pure, tested) · env.ts: cached accessor, server-only
  keys.ts            Solana secret key parsing (base58 or JSON byte array) → public key
  db/                schema.ts (every table in data-model.md), client.ts, index.ts (getDb), migrate.ts
  rate-limit.ts      sliding-window limits persisted in rate_events
  applications.ts    request validator for POST /api/applications
  i18n/              locales, typed dictionaries, localized metadata
  api/               ApiError + handler wrapper, JSON body parsing, rate-limit enforcement, hold owner cookie
  solana/            chain context (RPC, operator/admin signers, 503 when unset), program-id check,
                     on-chain Config cache, chain clock, operator-signed sends
  inventory/         occupancy SQL, availability, single-statement quote holds, SSRF-guarded fetch,
                     iCal parse / sync / export
  hotels.ts          public hotel queries, stay validation
  quotes/            pricing wiring (@stumari/core priceMenu + wallet history), quote creation + expiry
  bookings/          public view + terms text, chain mirror (applyChainState), built_txs cache/allow-list,
                     /pay, guest actions, relay (/tx/send, /submitted), auto-confirm + lazy crank
  cron.ts, faucet.ts cron jobs (batch 20, concurrency 4), demo faucet
  client/            browser only: API client, Wallet Standard + demo wallet (no RPC in the browser)
messages/            en.json (source), ka.json + ru.json (machine-drafted, marked "_note")
drizzle/             generated SQL migrations (commit them)
```

## i18n

No library and no middleware. English is the default and is served without a prefix: `next.config.ts` rewrites `/` → `/en` and `/apply` → `/en/apply`, and redirects `/en` back to `/`. Georgian and Russian are real `[lang]` segments. `lib/i18n/dictionaries.ts` types every dictionary as `typeof en`, so a missing key in `ka.json`/`ru.json` fails the build; a test checks the key sets match exactly. **KA/RU copy is machine-drafted — founders proofread before hotel calls.** The pilot terms in `en.json` must equal the "copy exactly" list in `docs/sales/offer.md` (tested).

Fonts: Inter + Literata (Latin, Cyrillic) with Noto Sans/Serif Georgian for Georgian glyphs, all self-hosted by `next/font`.

## API

Contract: `docs/architecture/api.md`. Errors are `{ error: { code, message } }` (plus `reason`, `booking` or `balance_minor` where noted).

| Route | Notes |
|---|---|
| `POST /api/applications` | pilot applications: `201 { id }` · `400` · `413` · `429` (5 per IP hash per 10 min); honeypot → `201`, nothing stored; optional Telegram notification after the response |
| `GET /api/config/public` | cluster, program id, mint, quote signer, demo mode; `pilot_offer.fee_bps` / `payout_delay_hours` from the on-chain Config (cached 60 s), pilot constants when unreadable |
| `GET /api/hotels?city=` · `GET /api/hotels/{slug}` · `GET …/availability` | active hotels only; availability never holds and ignores the caller's own hold |
| `POST /api/quotes` | signed quote + 10-minute hold (one `INSERT … SELECT` picks the lowest free unit; `stumari_cid` cookie, agents `mcp:{wallet}`); `409 UNAVAILABLE`, `400 INVALID_DATES` / `TOO_MANY_GUESTS` / `INVALID_WALLET`, `429` (10 per IP per 10 min) |
| `GET /api/quotes/{id}` | `{ envelope, status }` with lazy expiry |
| `POST /api/quotes/{id}/pay` | `create_booking` for the derived booking id: `410 QUOTE_EXPIRED`, `409 HOLD_LOST` / `ALREADY_PAID` (+ `booking`) / `INSUFFICIENT_FUNDS` / `SIMULATION_FAILED`, `403 WALLET_MISMATCH`, `422 AMOUNT_CAP`; unit iCal re-sync when older than 2 min; the same bytes on repeats while the blockhash has ≥ 60 blocks left |
| `POST /api/tx/send` | allow-list by message hash + operator fee payer, every signature verified (`FOREIGN_TX`, `WALLET_MODIFIED_TX`), relay + confirm (≤ 30 s), DB mirror; after a payment, `after()` re-syncs the unit and auto-confirms when there is no conflict |
| `POST /api/bookings/{id}/submitted` | sign-and-send wallets: waits for the signature, checks it touched the booking, mirrors the chain |
| `GET /api/bookings/{id}` · `POST …/refresh` | public view (never guest name/email/phone/wallet); lazily cranks release / void when due (chain clock) |
| `POST /api/bookings/{id}/tx` | guest cancel (`min_refund` = tiers at now + 90 s, returned as `refund_minor`), dispute, void; `409 NOT_ALLOWED` + `reason`, `403 WALLET_MISMATCH` |
| `GET /api/wallets/{wallet}/bookings` | public views of the wallet's bookings |
| `GET /api/ical/{token}` | unit export feed (occupying bookings + manual blocks), `no-store` |
| `POST /api/demo/faucet` | demo mode only, never mainnet: 500 test USDC; 3/hour/wallet, 10/hour/IP |
| `GET`/`POST /api/cron/sync` · `/api/cron/release` | `Authorization: Bearer ${CRON_SECRET}` (503 when unset); iCal + quote expiry + reconcile + auto-confirm + rate-event pruning / release + void |

Every route handler declares `export const runtime = "nodejs"`.

## Environment

See [`.env.example`](.env.example) and `configuration.md`. Everything has a development default, so `pnpm dev` works with no `.env.local`. In production `AUTH_SECRET` and `NEXT_PUBLIC_SITE_URL` are required, and on Vercel `LIBSQL_URL` must be a Turso URL. Solana settings (`OPERATOR_SECRET_KEY`, `STUMARI_MINT`, …) are validated when present and may be empty, so the landing page can be deployed before the chain setup; chain routes answer `503 CHAIN_NOT_CONFIGURED` until they are set, and cron routes `503` without `CRON_SECRET`. `STUMARI_PROGRAM_ID` must equal `onchain/artifacts/program-id.txt` (inlined at build) and the escrow client's id, else `503 PROGRAM_ID_MISMATCH` plus a startup error. `AUTH_SECRET` is ≥ 32 bytes of hex; a `libsql://` URL needs `LIBSQL_AUTH_TOKEN` in production; a production build on Vercel fails without `NEXT_PUBLIC_SITE_URL`. Rate-limit keys trust `X-Forwarded-For` only on Vercel (`x-real-ip` otherwise). Error messages never echo values.

## Deploy (Vercel + Turso)

1. `turso db create stumari` → `LIBSQL_URL=libsql://…turso.io`, `turso db tokens create stumari` → `LIBSQL_AUTH_TOKEN`.
2. Run migrations against Turso once from a laptop: `LIBSQL_URL=… LIBSQL_AUTH_TOKEN=… pnpm --filter web db:migrate`.
3. Vercel project root `apps/web`; set the env vars from `.env.example` (`AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`, `LIBSQL_*`, optional `TELEGRAM_*`, Solana vars when ready).
