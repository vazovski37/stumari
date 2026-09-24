# Configuration

## Web app (`apps/web/.env.local`, Vercel env)

| Variable | Required | Example / default | Purpose |
|---|---|---|---|
| `STUMARI_CLUSTER` | yes | `devnet` | `localnet` \| `devnet` \| `mainnet-beta` |
| `SOLANA_RPC_URL` | yes | `https://api.devnet.solana.com` locally; a **Helius/Triton devnet URL** on Vercel (the public endpoint rate-limits shared IPs) | server-only RPC (reads + sends); never `NEXT_PUBLIC_*` |
| `STUMARI_PROGRAM_ID` | yes | `6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf` | escrow program |
| `STUMARI_MINT` | yes | devnet mock USDC mint from bootstrap | accepted stablecoin |
| `OPERATOR_SECRET_KEY` | yes | base58 of the 64-byte secret (as Phantom exports) **or** a JSON byte array (as `solana-keygen` writes) — both accepted | fee payer, rent payer, quote signer |
| `ADMIN_SECRET_KEY` | no | defaults to `OPERATOR_SECRET_KEY` | arbiter stub (config admin) |
| `ADMIN_WALLETS` | yes | `Abc…,Def…` | wallets allowed into `/admin` |
| `AUTH_SECRET` | yes | ≥ 32 random bytes (hex) | HMAC for session cookies |
| `CRON_SECRET` | yes | random | bearer token for `/api/cron/*` |
| `LIBSQL_URL` | yes | `file:./.data/stumari.db` | DB. **Never `file:` on Vercel** (read-only, non-persistent FS) — use `libsql://…turso.io` |
| `LIBSQL_AUTH_TOKEN` | prod | | Turso token |
| `STUMARI_DEMO_MODE` | no | `true` on devnet | enables demo wallet + faucet; forced off on mainnet |
| `NEXT_PUBLIC_SITE_URL` | yes | `http://localhost:3000` | absolute links (iCal feed URLs, booking links); its host is checked in SIWS messages |
| `AMOUNT_CAP_MINOR` | no | `1500000000` (1,500 USDC) | per-booking cap during the pilot (`/pay` → `422 AMOUNT_CAP`) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | no | | notify founders of new applications |

`.env.example` in `apps/web` lists all of them.

## On-chain config (set by `scripts/bootstrap.ts`)

| Field | Devnet demo | Mainnet pilot |
|---|---|---|
| `fee_bps` | 0 (pilot offer) | 0 until 2026-12-31, then 150 |
| `confirm_window_secs` | 7200 | 7200 |
| `release_delay_secs` | 120 (so the demo can show a release) | 86400 |
| `mint` | mock USDC (6 decimals, operator is mint authority) | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

## MCP server (`apps/mcp`)

| Variable | Purpose |
|---|---|
| `STUMARI_API_URL` | base URL of the web app, e.g. `http://localhost:3000` |
| `AGENT_SECRET_KEY` | optional (devnet only): lets the MCP server sign as the agent wallet — same formats as `OPERATOR_SECRET_KEY` |
| `AGENT_MAX_AMOUNT_MINOR` | max price the MCP server will sign for (default `500000000` = 500 USDC, above any demo-hotel stay) |

## Demo data (seeded by `scripts/bootstrap.ts`)

Demo hotel slug **`stumari-demo`** — "Stumari Demo Guesthouse", Sololaki, Tbilisi; `checkin_time` 14:00, `checkout_time` 12:00, `City Hotel`; room types: Double room (BB) 65.00 USDC / Fri–Sat 75.00, 2 units; Twin room (BB) 60.00, 1 unit; Family suite (BB) 110.00, 1 unit; default policy. Payout wallet: a generated devnet keypair (`onchain/keys/demo-hotel.json`, gitignored) unless `DEMO_HOTEL_WALLET` is set (e.g. a founder's Phantom address, so the dashboard can be shown signed in as the hotel).

## Scripts

`scripts/.env` (or the web `.env.local`) — the bootstrap reads `SOLANA_RPC_URL`, `STUMARI_PROGRAM_ID`, `OPERATOR_SECRET_KEY` (or `OPERATOR_KEYPAIR_PATH=onchain/keys/operator-devnet.json`), `LIBSQL_URL`.
