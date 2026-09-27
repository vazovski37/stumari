# scripts

Operational scripts for the local chain and devnet. Run them from the repo root on Windows
(Git Bash or PowerShell), with Docker Desktop running for localnet:

```sh
pnpm --filter @stumari/scripts bootstrap --cluster localnet [--reset]
pnpm --filter @stumari/scripts bootstrap --cluster devnet
pnpm --filter @stumari/scripts fund --to <wallet> [--amount 500]
pnpm --filter @stumari/scripts timetravel --to +2h | +3d | +90m | 2026-10-20T10:00:00Z
pnpm --filter @stumari/scripts smoke
pnpm --filter @stumari/scripts e2e           # full loop on a reset localnet (docs/plan/e2e-report.md)
pnpm --filter @stumari/scripts e2e:screens   # PNG screenshots with headless Edge
pnpm --filter @stumari/scripts mews <setup|availability|price|book|show|cancel>   # Mews Connector API (demo)
pnpm --filter @stumari/scripts typecheck
```

Contracts: `docs/architecture/configuration.md` (env, on-chain config, demo data),
`escrow-program.md` (`initialize_config` gate, `register_hotel`), ADR-0008 (program build in
WSL) and ADR-0015 (localnet = Surfpool in Docker + cheatcodes). No script ever targets mainnet:
`--cluster mainnet-beta`, `STUMARI_CLUSTER=mainnet-beta` or a mainnet RPC URL is refused.

## Environment

Read with the precedence process env > `scripts/.env` > `apps/web/.env.local`:

| Variable | Default | Used for |
|---|---|---|
| `OPERATOR_SECRET_KEY` | — | operator key (base58 or JSON bytes); otherwise `OPERATOR_KEYPAIR_PATH` |
| `OPERATOR_KEYPAIR_PATH` | `onchain/keys/operator-devnet.json` | fee payer, quote signer, config admin, mint authority, upgrade authority |
| `SOLANA_RPC_URL` | devnet: `https://api.devnet.solana.com` | devnet only (a localhost URL is ignored there); localnet is always `http://127.0.0.1:8899` |
| `STUMARI_PROGRAM_ID` | `onchain/artifacts/program-id.txt` | must equal the escrow client's program id |
| `LIBSQL_URL`, `LIBSQL_AUTH_TOKEN` | `file:./.data/stumari.db` (relative to `apps/web`) | web database to migrate and seed |
| `DEMO_HOTEL_WALLET` | `onchain/keys/demo-hotel.json` (generated if missing) | payout wallet of `stumari-demo`, e.g. a founder's Phantom |

`fund`, `timetravel` and `smoke` use the cluster the bootstrap wrote (`STUMARI_CLUSTER` in
`apps/web/.env.local`). Keys are loaded from `onchain/keys/*.json` (gitignored) and never printed.

## bootstrap

Brings a cluster to the demo-ready state. Every step checks before it acts, so a second run
prints `bootstrap: already up to date (0 changes)`.

1. **localnet:** `scripts/localnet.sh start` (or `reset` with `--reset`: a fresh, empty chain);
   `surfnet_setAccount` gives the operator 1,000 SOL and the demo hotel and agent wallets 10 SOL
   when they hold less than half of that; `surfnet_writeProgram` writes
   `onchain/artifacts/stumari_escrow.so` at `6Y17gFD9…U6nf` in 256 KiB chunks with the operator
   as upgrade authority (skipped when the deployed bytes already match). The Program and
   ProgramData accounts are then checked the way `initialize_config` checks them (Program →
   ProgramData PDA, upgrade authority = operator); a wrong authority is rewritten with
   `surfnet_setAccount`.
   **devnet:** checks that the operator holds at least 0.05 SOL (else: `fund <operator> at
   faucet.solana.com`) and that the program is deployed (see "Devnet program deploy"); warns when
   the deployed bytes differ from the local build.
2. **Mock USDC:** a classic SPL mint, 6 decimals, operator = mint authority. Its address is
   `createAccountWithSeed(operator, "stumari-mock-usdc-v1", Token program)`, so it is the same on
   every cluster and after every localnet reset. Once the Config exists, its `mint` wins.
3. **Treasury:** the operator's ATA of the mint.
4. **`initialize_config`** (signed by the operator as upgrade authority): quote signer = operator,
   `fee_bps` 0, `confirm_window_secs` 7200, `release_delay_secs` 120. On later runs a drifted
   field is corrected with `update_config` (`paused` is left alone).
5. **Web DB:** `pnpm --filter web db:migrate`, then the demo hotel exactly as configuration.md
   "Demo data": `stumari-demo`, "Stumari Demo Guesthouse", Sololaki, Tbilisi, 14:00/12:00,
   City Hotel, status active, default policy; Double room (BB) 65.00 / Fri–Sat 75.00 with units
   D1, D2; Twin room (BB) 60.00, T1; Family suite (BB) 110.00, F1. Only missing rows are inserted,
   so admin edits survive a re-run; a changed `DEMO_HOTEL_WALLET` updates `payout_wallet`.
6. **`register_hotel`** (with the payout ATA) — or `update_hotel` when the on-chain authority
   differs from the payout wallet — and the Hotel PDA / signature recorded on the hotel row.
7. **Agent wallet** (`onchain/keys/agent-devnet.json`, if present): topped up to 1,000 mock USDC
   when it holds less than 100 (for the MCP demo; it needs no SOL).
8. **`apps/web/.env.local`** (created from `.env.example` on first run, then merged in place):
   `STUMARI_CLUSTER`, `SOLANA_RPC_URL`, `STUMARI_PROGRAM_ID`, `STUMARI_MINT`,
   `OPERATOR_SECRET_KEY` (base58; an existing value for the same key is kept as written),
   `ADMIN_WALLETS` (existing entries + the operator), `AUTH_SECRET` and `CRON_SECRET` (32 random
   bytes as hex, generated once and preserved), `LIBSQL_URL`, `STUMARI_DEMO_MODE=true`,
   `NEXT_PUBLIC_SITE_URL` (kept, default `http://localhost:3000`). Other lines are untouched; the
   log names changed keys, never values.

`--reset` resets the chain only. The database is kept (the demo hotel is re-registered on the new
chain); bookings made on the old chain stay in it. For an empty database, stop the web app and
delete `apps/web/.data/stumari.db` before bootstrapping.

### Devnet program deploy

The deploy itself runs in WSL (ADR-0008). The operator must deploy, so that it becomes the
upgrade authority `initialize_config` requires. Environment variables do not cross the `wsl`
boundary reliably, so use a throwaway script outside the repo:

```sh
# Git Bash: /tmp is C:\Users\<you>\AppData\Local\Temp
cat > /tmp/deploy-devnet.sh <<'EOF'
export DEPLOYER_KEYPAIR=/mnt/c/Users/User/Workspace/colosseum/onchain/keys/operator-devnet.json
bash /mnt/c/Users/User/Workspace/colosseum/scripts/program.sh deploy devnet
EOF
MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/Users/User/AppData/Local/Temp/deploy-devnet.sh
```

The deploy costs a few devnet SOL of rent: fund the operator at faucet.solana.com first, then run
`bootstrap --cluster devnet`.

## fund

Mints mock USDC to any wallet's ATA (the operator pays the ATA rent, the wallet needs no SOL).
The mint is read from the on-chain Config. Same effect as the web app's demo faucet, without its
rate limits.

## timetravel

Moves the localnet clock forward with `surfnet_timeTravel` to show a tier change, the confirm
deadline or a release. Relative targets count from the chain clock. The clock cannot go back:
afterwards the chain runs ahead of wall-clock time, so quotes stamped with wall-clock time fail
`create_booking` (`QuoteExpired`) until `bootstrap --cluster localnet --reset`.

## smoke

A chain-side end-to-end check of a bootstrapped cluster (writes no DB rows): prices a real quote
for `stumari-demo` (Double room, check-in 5 days ahead, 2 nights) with the committed model and
signs it with the operator; a fresh guest wallet receives exactly the Standard price in mock USDC
and no SOL; `create_booking` is built by `@stumari/escrow-client`, signed by the guest like a
browser wallet and relayed (operator = fee payer, quote signer, rent payer); the operator
confirms; the guest cancels with `minRefundForCancel`. It asserts guest / hotel / treasury token
balances and the amounts stored on the Booking against `splitCancel` from `@stumari/core`, that
the vault is closed, and that the guest never held SOL. On devnet it costs the operator the
Booking account rent (≈ 0.0034 SOL, never returned by design).

## mews

A CLI over `@stumari/mews-client` (`packages/mews-client/README.md`) for the Mews Connector API.
It uses the **demo** environment by default. Any other host, including production
`https://api.mews.com`, is refused unless `MEWS_ALLOW_PRODUCTION=1` (or `true`) is also set. Production needs
a certified private integration (the hotel must be on Enterprise or have the Connectivity
Add-on). Never automate a staff login.

| Variable | Default | |
|---|---|---|
| `MEWS_PLATFORM_URL` | `https://api.mews-demo.com` | must be https |
| `MEWS_CLIENT_TOKEN`, `MEWS_ACCESS_TOKEN` | — | required; never printed. For the demo, copy a pair from [docs.mews.com › Environments](https://docs.mews.com/connector-api/guidelines/environments) into your shell, not into a committed file |
| `MEWS_CLIENT` | `Stumari 0.1.0` | the `Client` field of every request |
| `MEWS_ALLOW_PRODUCTION` | — | `1` or `true` to allow a non-demo host (the web app accepts the same values) |

Variables are read with the same precedence as the other scripts (process env > `scripts/.env` >
`apps/web/.env.local`).

```sh
pnpm --filter @stumari/scripts mews setup                     # enterprise, timezone, service, room types, rates, age categories
pnpm --filter @stumari/scripts mews availability --from 2026-11-03 --to 2026-11-06 [--room-type "Double Room"]
pnpm --filter @stumari/scripts mews price --from 2026-11-03 --to 2026-11-05 --room-type "Double Room" --rate "Fully Flexible" --adults 2
pnpm --filter @stumari/scripts mews book  --from 2026-11-03 --to 2026-11-05 --room-type "Double Room" --rate "Fully Flexible" \
  --adults 2 --name "Test Stumari" --notes "Stumari demo — prepaid in USDC (test)"
pnpm --filter @stumari/scripts mews show   --id <reservationId>
pnpm --filter @stumari/scripts mews cancel --id <reservationId> [--notes "..."]
```

- Dates are `YYYY-MM-DD` in the Mews enterprise timezone. `--from` defaults to today + 30 days and
  `--to` to `--from` + 7 days (availability) or + 1 night.
- `--room-type` and `--rate` take an id or a (partial, unique) name. They default to the first room
  type and the default rate. `--adults` defaults to 2 and `--children` to 0. `--service <id>`
  selects another bookable service; `setup` lists them.
- `availability` prints Mews's free units per night, with the checkout date excluded. `min` is what
  can be sold for the whole range.
- `book` creates the guest (`customers/add`), then a `Confirmed` reservation (`--state Optional` to
  hold it) with overbooking checks on and no confirmation email. It records no payment in Mews:
  the USDC prepayment goes only into the notes. On the demo, book only fake guests.
- `cancel` cancels with no cancellation fee and no email, then shows the reservation.

Live demo check (2026-09-28, "API Hotel Gross Pricing", Europe/Budapest): `book` of a Double Room for
2026-11-03 → 11-05 sent `2026-11-03T14:00:00Z` → `2026-11-05T10:00:00Z` (15:00 / 11:00 CET). Free
Double Rooms dropped from 5 to 4 on 11-03 and 11-04 (not on 11-05), and returned to 5 after `cancel`.

## Other files

- `localnet.sh start|stop|status|logs|reset` — Surfpool in Docker on `127.0.0.1:8899` (ADR-0015).
- `program.sh build|test|fmt|deploy <cluster>|id` — the Anchor program in WSL (ADR-0008).
- `wsl-env.sh` — Solana/Rust PATH for non-interactive WSL shells.
- `lib/` — env loading and `.env.local` merging, keypairs, Kit RPC helpers, surfnet cheatcodes,
  upgradeable-loader checks, the mock mint, the web DB (the web app's own client and schema) and
  the demo data.
