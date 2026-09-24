# Runbook

How to set up, run, deploy and operate Stumari. Default cluster: **devnet**. Never touch mainnet without the M7 decision in the [roadmap](roadmap.md) and the checklist in [security.md](../architecture/security.md#before-mainnet-checklist).

Some parts are still being built (`scripts/bootstrap.ts`, the web routes, `apps/mcp`). If a command below disagrees with the code, the code and [configuration.md](../architecture/configuration.md) win. Fix this runbook in the same change.

## 1. Prerequisites

The toolchain matches [CLAUDE.md](../../CLAUDE.md#toolchain-windows-host--wsl).

**Windows host**
- Node 24, pnpm 9 (`packageManager: pnpm@9.12.0`), Python 3.11, Docker Desktop, Git Bash.
- The C: drive is nearly full (~25 GB free), so avoid large installs.

**WSL Ubuntu-24.04 (root)**
- Rust 1.98 (+1.89 via `onchain/rust-toolchain.toml`), Agave/Solana CLI 3.1.10, Anchor 1.1.2, Surfpool 1.6 at `~/.local/bin/surfpool`.
- PATH is **not** set for non-interactive shells. Source `scripts/wsl-env.sh` first. It also sets `NO_DNA=1`, which Anchor and Surfpool commands expect.
- Calling WSL from Git Bash: write a script file and run it. Never inline `wsl bash -lc '…'`, because variables and `/mnt/c/...` paths get mangled.

```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/Users/User/Workspace/colosseum/scripts/program.sh build
```

**Accounts (founders create them; see roadmap M0b):** Vercel, Turso, Helius (free devnet RPC URL), GitHub (for faucet.solana.com). Later a domain, and cron-job.org or Upstash.

**Keys** (all gitignored under `onchain/keys/`; never commit, paste into chat or print them):

| File | What | How |
|---|---|---|
| `onchain/keys/stumari_escrow-keypair.json` | program id keypair `6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf` | shared between founders via password manager ([ADR-0008](../decisions/README.md)) |
| `onchain/keys/operator-devnet.json` | devnet operator = fee payer = quote signer = admin (arbiter stub) = program upgrade authority | `solana-keygen new --no-bip39-passphrase -o /mnt/c/Users/User/Workspace/colosseum/onchain/keys/operator-devnet.json` inside WSL |

On devnet, use the **same key** as deployer and admin. `initialize_config` only accepts the program's upgrade authority ([escrow-program.md](../architecture/escrow-program.md#initialize_configquote_signer-pubkey-fee_bps-u16-confirm_window_secs-u32-release_delay_secs-u32)).

## 2. Environment variables

The source of truth is [configuration.md](../architecture/configuration.md). The tables are copied here for convenience.

### Web app (`apps/web/.env.local`, Vercel env)

| Variable | Required | Example / default | Purpose |
|---|---|---|---|
| `STUMARI_CLUSTER` | yes | `devnet` | `localnet` \| `devnet` \| `mainnet-beta` |
| `SOLANA_RPC_URL` | yes | `https://api.devnet.solana.com` locally; a **Helius/Triton devnet URL** on Vercel (the public endpoint rate-limits shared IPs) | server-only RPC (reads + sends); never `NEXT_PUBLIC_*` |
| `STUMARI_PROGRAM_ID` | yes | `6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf` | escrow program; must equal `onchain/artifacts/program-id.txt` (checked at startup) |
| `STUMARI_MINT` | yes | devnet mock USDC mint from bootstrap | accepted stablecoin |
| `OPERATOR_SECRET_KEY` | yes | base58 of the 64-byte secret (as Phantom exports) **or** a JSON byte array (as `solana-keygen` writes) — both accepted | fee payer, rent payer, quote signer |
| `ADMIN_SECRET_KEY` | no | defaults to `OPERATOR_SECRET_KEY` | arbiter stub (config admin) |
| `ADMIN_WALLETS` | yes | `Abc…,Def…` | wallets allowed into `/admin` |
| `AUTH_SECRET` | yes | ≥ 32 random bytes (hex) | HMAC for session cookies |
| `CRON_SECRET` | yes | random | bearer token for `/api/cron/*` |
| `LIBSQL_URL` | yes | `file:./.data/stumari.db` | DB. **Never `file:` on Vercel** (read-only, non-persistent FS). Use `libsql://…turso.io` |
| `LIBSQL_AUTH_TOKEN` | prod | | Turso token |
| `STUMARI_DEMO_MODE` | no | `true` on devnet | enables demo wallet + faucet; forced off on mainnet |
| `NEXT_PUBLIC_SITE_URL` | yes | `http://localhost:3000` | absolute links (iCal feed URLs, booking links); its host is checked in SIWS messages |
| `AMOUNT_CAP_MINOR` | no | `1500000000` (1,500 USDC) | per-booking cap during the pilot (`/pay` → `422 AMOUNT_CAP`) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | no | | notify founders of new applications |

`apps/web/.env.example` lists all of them. Generate secrets without printing any key material:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # AUTH_SECRET, then again for CRON_SECRET
```

For `OPERATOR_SECRET_KEY`, open `onchain/keys/operator-devnet.json` in an editor and paste the byte array into `.env.local` (or Vercel's env UI). Don't `cat` it into a terminal that is being recorded or logged.

### On-chain config (set by `scripts/bootstrap.ts`)

| Field | Devnet demo | Mainnet pilot |
|---|---|---|
| `fee_bps` | 0 (pilot offer) | 0 until 2026-12-31, then 150 |
| `confirm_window_secs` | 7200 | 7200 |
| `release_delay_secs` | 120 (so the demo can show a release) | 86400 |
| `mint` | mock USDC (6 decimals, operator is mint authority) | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

### MCP server (`apps/mcp`)

| Variable | Purpose |
|---|---|
| `STUMARI_API_URL` | base URL of the web app, e.g. `http://localhost:3000` |
| `AGENT_SECRET_KEY` | optional (devnet only): lets the MCP server sign as the agent wallet |
| `AGENT_MAX_AMOUNT_MINOR` | max price the MCP server will sign for (default 200 USDC) |

### Scripts

`scripts/.env` (or the web `.env.local`). The bootstrap reads `SOLANA_RPC_URL`, `STUMARI_PROGRAM_ID`, `OPERATOR_SECRET_KEY` (or `OPERATOR_KEYPAIR_PATH=onchain/keys/operator-devnet.json`), `LIBSQL_URL`.

## 3. Local development

From the repo root in Git Bash:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local     # then fill it in (section 2)
pnpm --filter web db:migrate                     # creates apps/web/.data/stumari.db
pnpm dev                                         # http://localhost:3000
pnpm --filter web cron                           # second terminal: runs sync + release every 60 s
```

Tests: `pnpm test` (all workspaces) and `pnpm typecheck`. The ML pipeline lives in `ml/`. If Windows Application Control blocks a compiled wheel (e.g. `sklearn.metrics`), run `ml/` in WSL ([pricing-and-risk-model.md](../architecture/pricing-and-risk-model.md)).

**Local chain (optional, for time travel).** In a WSL script: `. scripts/wsl-env.sh && surfpool start`. The RPC is at `http://127.0.0.1:8899`, and WSL2 forwards localhost to Windows. Set `STUMARI_CLUSTER=localnet` and `SOLANA_RPC_URL=http://127.0.0.1:8899`, deploy with `scripts/program.sh deploy localhost`, then run the bootstrap against it. Jump the clock with the `surfnet_timeTravel` cheatcode to demonstrate tiers and release.

## 4. Program: build, test, deploy

All through `scripts/program.sh` (ADR-0008). It rsyncs `onchain/` to `~/stumari-onchain` in WSL, builds there, and copies the `.so`, the IDL and `Cargo.lock` back to `onchain/artifacts/` and `onchain/`.

```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/Users/User/Workspace/colosseum/scripts/program.sh build
MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/Users/User/Workspace/colosseum/scripts/program.sh test
MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/Users/User/Workspace/colosseum/scripts/program.sh id   # must print 6Y17gFD9…U6nf
```

**Deploy to devnet.** You need the program keypair in `onchain/keys/`, and a funded deployer, which is the operator key (section 1). Program deploys cost several devnet SOL in rent. Environment variables don't cross the `wsl` boundary reliably, so put the deploy in a small script (outside the repo) and run that:

```bash
# deploy-devnet.sh — run with: MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/<path>/deploy-devnet.sh
export DEPLOYER_KEYPAIR=/mnt/c/Users/User/Workspace/colosseum/onchain/keys/operator-devnet.json
bash /mnt/c/Users/User/Workspace/colosseum/scripts/program.sh deploy devnet
```

Afterwards, commit `onchain/artifacts/idl/stumari_escrow.json` if it changed, and regenerate the Codama client in `packages/escrow-client`.

## 5. Devnet bootstrap

`scripts/bootstrap.ts` is **being built**. Check `scripts/package.json` for the final command. It will:
1. create the mock USDC mint (6 decimals, operator = mint authority) and the treasury token account;
2. run `initialize_config` with the devnet values in section 2 (signed by the upgrade authority);
3. seed a demo hotel in the DB with room types and units, and register it on-chain.

```bash
pnpm --filter @stumari/scripts exec tsx bootstrap.ts   # expected shape; confirm once the script lands
```

Copy the printed mint into `STUMARI_MINT` (locally and on Vercel), and note the demo hotel's slug for `/h/{slug}`. Run it **against the same DB the web app uses**. For Vercel, that means the Turso URL and token (section 6).

## 6. Deploy the web app (Vercel + Turso)

Founders create the accounts. Never use a `file:` database on Vercel.

**Turso**
1. Create a database (dashboard at app.turso.tech, or the Turso CLI inside WSL), e.g. `stumari`, in a region near Vercel's (e.g. Frankfurt).
2. Copy its URL (`libsql://stumari-<org>.turso.io`) and create an auth token.
3. Apply migrations from your machine against Turso:
   ```bash
   LIBSQL_URL='libsql://…turso.io' LIBSQL_AUTH_TOKEN='…' pnpm --filter web db:migrate
   ```

**Vercel**
1. New Project → import the GitHub repo → **Root Directory `apps/web`** (framework Next.js; Vercel detects the pnpm workspace).
2. Add every variable from section 2: `LIBSQL_URL` (Turso), `LIBSQL_AUTH_TOKEN`, `SOLANA_RPC_URL` (Helius devnet URL), `STUMARI_DEMO_MODE=true`, `NEXT_PUBLIC_SITE_URL=https://<project>.vercel.app`, and the rest.
3. Deploy. `NEXT_PUBLIC_*` values are baked in at build time, so **redeploy** after changing `NEXT_PUBLIC_SITE_URL`, e.g. when the custom domain arrives (M5).
4. Smoke test: `/`, `/ka`, `/ru`, submit `/apply` → it appears in `/admin`; `/api/config/public` shows `cluster: devnet`; make a demo booking on `/h/{slug}`.

## 7. External cron scheduler

Vercel Hobby runs cron at most once a day, so production uses an external scheduler. The endpoints accept GET and POST with `Authorization: Bearer ${CRON_SECRET}` ([api.md](../architecture/api.md#cron)). The demo does not depend on the scheduler, because reads crank due bookings lazily.

| Job | URL | Schedule |
|---|---|---|
| release | `https://<site>/api/cron/release` | every minute |
| sync | `https://<site>/api/cron/sync` | every 10 minutes |

**cron-job.org:** Create cronjob → URL above → schedule → Advanced → Request method `GET`, header `Authorization: Bearer <CRON_SECRET>` → save. Check the execution history for `200`.

**Upstash QStash (alternative):**

```bash
curl -X POST "https://qstash.upstash.io/v2/schedules/https://<site>/api/cron/release" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Upstash-Cron: * * * * *" \
  -H "Upstash-Forward-Authorization: Bearer $CRON_SECRET"
# repeat for /api/cron/sync with "Upstash-Cron: */10 * * * *"
```

Check by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/release` returns 200; without the header it returns 401.

## 8. MCP server for Claude Desktop

In Claude Desktop, go to Settings → Developer → **Edit Config**. This opens the right `claude_desktop_config.json` for the Store or installer version. Add:

```json
{
  "mcpServers": {
    "stumari": {
      "command": "node",
      "args": [
        "C:/Users/User/Workspace/colosseum/apps/mcp/node_modules/tsx/dist/cli.mjs",
        "C:/Users/User/Workspace/colosseum/apps/mcp/src/index.ts"
      ],
      "env": {
        "STUMARI_API_URL": "https://<site>",
        "AGENT_SECRET_KEY": "<devnet-only agent key>",
        "AGENT_MAX_AMOUNT_MINOR": "200000000"
      }
    }
  }
}
```

- Restart Claude Desktop. The five tools appear: `search_availability`, `get_quote`, `book`, `cancel`, `booking_status`.
- Leave out `AGENT_SECRET_KEY` to get unsigned transactions back instead of bookings. Use a **dedicated devnet agent wallet**, never the operator key or a wallet with real funds. The server refuses to sign on mainnet.
- Fund the agent wallet with test USDC (it needs no SOL): `curl -X POST https://<site>/api/demo/faucet -H 'content-type: application/json' -d '{"wallet":"<agent address>"}'`.
- The server logs only to stderr. Claude Desktop's MCP logs show startup errors.

## 9. Phantom on devnet

1. Phantom → Settings → **Developer Settings** → turn on **Testnet Mode** → select **Solana Devnet**.
2. Copy your Solana address and get test USDC from `/api/demo/faucet` (or use the site's Test wallet instead). The mock USDC is our own mint, so Phantom may list it as an unknown token. That's expected.
3. Guests need no SOL: the operator pays fees. Phantom may still show a devnet or simulation warning.
4. For the dashboard, sign in with the hotel's payout wallet (Sign-In With Solana). For `/admin`, the wallet must be in `ADMIN_WALLETS`.

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `/mnt/c/...` becomes `C:/Program Files/Git/mnt/c/...`, or `$VAR` is empty inside WSL | Git Bash (MSYS) path conversion and quoting | Prefix `MSYS_NO_PATHCONV=1` and run a script file, not `wsl bash -lc "…"` |
| `$'\r': command not found`, `bad interpreter` | CRLF line endings in a `.sh` | `.gitattributes` forces LF for `*.sh`. For files created on Windows, fix with `sed -i 's/\r$//' file.sh` (in WSL) or `git add --renormalize .` |
| `anchor`/`solana`/`surfpool: command not found` in WSL | non-interactive shell PATH | `. /mnt/c/Users/User/Workspace/colosseum/scripts/wsl-env.sh` first |
| `airdrop request failed` / 429 on devnet | public faucet rate limits | https://faucet.solana.com with GitHub login (higher limits), or transfer from another devnet wallet |
| Public devnet RPC 429 in the app | shared-IP rate limits (always on Vercel) | Helius devnet URL in `SOLANA_RPC_URL` |
| Data vanishes on Vercel / `SQLITE_READONLY` | `LIBSQL_URL=file:` on Vercel | Turso `libsql://` URL + token, then redeploy |
| App refuses to start: program id mismatch | `STUMARI_PROGRAM_ID` ≠ `onchain/artifacts/program-id.txt` | Use `6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf` |
| `initialize_config` fails `Unauthorized` | the admin signer is not the program's upgrade authority | Bootstrap with the deployer key (section 1) |
| Sign-in fails | `NEXT_PUBLIC_SITE_URL` host ≠ the host in the browser (`localhost` vs `127.0.0.1`, preview URL vs domain) | Browse on the configured host, or fix the env and redeploy |
| `400 WALLET_MODIFIED_TX` | the wallet added instructions/priority fees to the server-built tx | Try another Wallet Standard wallet, or use the Test wallet |
| `409 SIMULATION_FAILED` with a program error | e.g. `QuoteExpired`, `HotelInactive`, `Paused`; operator out of SOL | Get a new quote; check the hotel is registered; top up the operator (alert below 1 SOL) |
| Test wallet balance gone | `localStorage` cleared or new browser profile → new key | Click "Get 500 test USDC" again (devnet money only) |
| Cron returns 401 | missing/incorrect `Authorization: Bearer` header | Match `CRON_SECRET` exactly |
