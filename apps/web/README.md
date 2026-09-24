# apps/web

Next.js 16 (App Router, Turbopack) app for Stumari: the hotel landing page (EN/KA/RU), the pilot application form, and the API. Checkout, booking page, hotel dashboard and admin land here next (English only). Specs: [`docs/architecture/api.md`](../../docs/architecture/api.md), [`data-model.md`](../../docs/architecture/data-model.md), [`configuration.md`](../../docs/architecture/configuration.md).

> This Next.js version differs from older ones. Read the bundled docs in `node_modules/next/dist/docs/` before touching routing, route handlers, metadata or caching (see `AGENTS.md`).

## Run locally

```bash
cp apps/web/.env.example apps/web/.env.local   # optional: everything has a dev default
pnpm --filter web db:migrate                   # creates apps/web/.data/stumari.db
pnpm --filter web dev                          # http://localhost:3000
```

| Script | What it does |
|---|---|
| `dev` / `build` / `start` | Next.js |
| `test` | Vitest: application validator, locale resolution + dictionary parity, pilot offer parity with `docs/sales/offer.md`, rate limiter (temp SQLite), env parsing (both secret-key formats), money formatting |
| `typecheck` / `lint` | `tsc --noEmit` / ESLint |
| `db:generate` | `drizzle-kit generate` — new SQL migration in `drizzle/` after editing `lib/db/schema.ts` |
| `db:migrate` | apply migrations to `LIBSQL_URL` (reads `.env.local`) |

## Layout

```
app/
  [lang]/            root layout for localized pages: <html lang>, static params en/ka/ru
    page.tsx         landing          → served at /, /ka, /ru
    apply/page.tsx   pilot application → /apply, /ka/apply, /ru/apply
    opengraph-image.tsx
  (site)/            root layout for English-only pages (privacy; later /h, /b, /my, /dashboard, /admin)
  api/
    applications/    POST — pilot applications
    config/public/   GET  — public chain + pilot config
  global-not-found.tsx, icon.svg, apple-icon.tsx, robots.ts, sitemap.ts, fonts.ts, globals.css
components/          header, footer, language switcher, landing sections, apply form
lib/
  env-schema.ts      zod-validated server env (pure, tested) · env.ts: cached accessor, server-only
  keys.ts            Solana secret key parsing (base58 or JSON byte array) → public key
  db/                schema.ts (every table in data-model.md), client.ts, index.ts (getDb), migrate.ts
  rate-limit.ts      sliding-window limits persisted in rate_events
  applications.ts    request validator for POST /api/applications
  i18n/              locales, typed dictionaries, localized metadata
messages/            en.json (source), ka.json + ru.json (machine-drafted, marked "_note")
drizzle/             generated SQL migrations (commit them)
```

## i18n

No library and no middleware. English is the default and is served without a prefix: `next.config.ts` rewrites `/` → `/en` and `/apply` → `/en/apply`, and redirects `/en` back to `/`. Georgian and Russian are real `[lang]` segments. `lib/i18n/dictionaries.ts` types every dictionary as `typeof en`, so a missing key in `ka.json`/`ru.json` fails the build; a test checks the key sets match exactly. **KA/RU copy is machine-drafted — founders proofread before hotel calls.** The pilot terms in `en.json` must equal the "copy exactly" list in `docs/sales/offer.md` (tested).

Fonts: Inter + Literata (Latin, Cyrillic) with Noto Sans/Serif Georgian for Georgian glyphs, all self-hosted by `next/font`.

## API (this wave)

| Route | Notes |
|---|---|
| `POST /api/applications` | JSON body per `lib/applications.ts`. `201 { id }` · `400 VALIDATION_FAILED` (with `issues[]`) / `INVALID_JSON` · `413` · `429 RATE_LIMITED` (5 per IP hash per 10 min, `retry-after` header). A filled `website` honeypot gets `201` and nothing is stored. Stores `ip_hash = sha256(ip + AUTH_SECRET)`, never the IP. Sends a Telegram message after the response when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set; failures are ignored. |
| `GET /api/config/public` | `{ cluster, program_id, mint, quote_signer, demo_mode, pilot_offer }`. `quote_signer` is derived from `OPERATOR_SECRET_KEY` (null until set); `mint` is null until the devnet bootstrap has run. Fee and payout delay are the pilot constants until the escrow client can read the on-chain Config. |

Every route handler declares `export const runtime = "nodejs"`.

## Environment

See [`.env.example`](.env.example) and `configuration.md`. Everything has a development default, so `pnpm dev` works with no `.env.local`. In production `AUTH_SECRET` and `NEXT_PUBLIC_SITE_URL` are required, and on Vercel `LIBSQL_URL` must be a Turso URL. Solana settings (`OPERATOR_SECRET_KEY`, `STUMARI_MINT`, …) are validated when present and may be empty, so the landing page can be deployed before the chain setup; features that need them check for `null`. Error messages never echo values.

## Deploy (Vercel + Turso)

1. `turso db create stumari` → `LIBSQL_URL=libsql://…turso.io`, `turso db tokens create stumari` → `LIBSQL_AUTH_TOKEN`.
2. Run migrations against Turso once from a laptop: `LIBSQL_URL=… LIBSQL_AUTH_TOKEN=… pnpm --filter web db:migrate`.
3. Vercel project root `apps/web`; set the env vars from `.env.example` (`AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`, `LIBSQL_*`, optional `TELEGRAM_*`, Solana vars when ready).
