# Configuration

## Web app (`apps/web/.env.local`, Vercel env)

| Variable | Required | Example / default | Purpose |
|---|---|---|---|
| `STUMARI_CLUSTER` | yes | `devnet` | `localnet` \| `devnet` \| `mainnet-beta` |
| `SOLANA_RPC_URL` | yes | `https://api.devnet.solana.com` | server RPC (reads + sends) |
| `STUMARI_PROGRAM_ID` | yes | `6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf` | escrow program |
| `STUMARI_MINT` | yes | devnet mock USDC mint from bootstrap | accepted stablecoin |
| `OPERATOR_SECRET_KEY` | yes | base58 64-byte secret **or** JSON byte array | fee payer, rent payer, quote signer |
| `ADMIN_SECRET_KEY` | no | defaults to `OPERATOR_SECRET_KEY` | arbiter stub (config admin) |
| `ADMIN_WALLETS` | yes | `Abc…,Def…` | wallets allowed into `/admin` |
| `AUTH_SECRET` | yes | ≥ 32 random bytes (hex) | HMAC for session cookies |
| `CRON_SECRET` | yes | random | bearer token for `/api/cron/*` |
| `LIBSQL_URL` | yes | `file:./.data/stumari.db` | DB (Turso URL in prod) |
| `LIBSQL_AUTH_TOKEN` | prod | | Turso token |
| `STUMARI_DEMO_MODE` | no | `true` on devnet | enables demo wallet + faucet; forced off on mainnet |
| `NEXT_PUBLIC_SITE_URL` | yes | `http://localhost:3000` | absolute links (iCal feed URLs, booking links) |

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
| `AGENT_SECRET_KEY` | optional (devnet only): lets the MCP server sign as the agent wallet |

## Scripts

`scripts/.env` (or the web `.env.local`) — the bootstrap reads `SOLANA_RPC_URL`, `STUMARI_PROGRAM_ID`, `OPERATOR_SECRET_KEY` (or `OPERATOR_KEYPAIR_PATH=onchain/keys/operator-devnet.json`), `LIBSQL_URL`.
