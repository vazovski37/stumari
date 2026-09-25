# Security Model

## Assets
Guest USDC in escrow · hotel payouts · the operator key (fee payer, quote signer) · the admin key (arbiter stub) · guest contact data · hotel application data.

## Key custody (MVP)

| Key | Where | Blast radius if stolen |
|---|---|---|
| Operator / quote signer | `OPERATOR_SECRET_KEY` env on the web server | Can mint quotes at arbitrary prices and co-sign bookings — **but a guest must still sign and pay**, so no funds can be taken; can confirm pending bookings before their deadline; can drain the operator's own SOL. Rotate with `update_config`. |
| Admin | `ADMIN_SECRET_KEY` env (devnet: same as operator) | Can split **disputed** bookings between guest and hotel, void **pending** bookings (refund only), register/deactivate hotels, change a hotel's payout wallet for **future** bookings, pause new bookings, set fee ≤ 10% for **future** bookings. Cannot send escrow anywhere except the booking's snapshotted guest and hotel owners or the treasury (bounded by each booking's fee snapshot). |
| Program upgrade authority | deployer keypair (`onchain/keys/`, gitignored) | Can replace the program → full control. **Mainnet: transfer to a Squads multisig or make immutable before holding meaningful funds.** |

Never commit keys. `.gitignore` covers `*.json` keypairs under `onchain/keys/`, `.env*`, `apps/web/.data/`.

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| Guest alters price/terms in the payment tx | `create_booking` requires `quote_signer` signature over the whole message (ADR-0004) |
| Replay of a quote / double booking of one quote | `booking_id` is derived from the quote id, so the booking PDA (`init`) enforces one booking per quote on-chain; server marks the quote `used`; one hold per client |
| Operator SOL drain via gasless txs | `/pay` and `/bookings/{id}/tx` rate-limited per wallet and IP; txs built only if valid against a fresh on-chain read and after simulation; signed tx cached per `(booking, action)` until its blockhash expires (repeat calls get the same bytes); one booking per quote; alert when operator balance < 1 SOL; Booking rent (~0.00334 SOL) is an accepted per-booking cost |
| Vault griefing (unsolicited deposit blocks close) | every exit sweeps vault excess to the treasury before `close_account` |
| Admin redirects a hotel's payout | payout owner is snapshotted on the booking (`hotel_authority`); `update_hotel` affects new bookings only |
| Guest loses refund to a confirm race or tier boundary | `cancel_booking(min_refund)` fails instead of refunding less than shown |
| Front-running `initialize_config` | only the program's upgrade authority can initialize |
| Relaying foreign or modified transactions | `/api/tx/send` accepts only txs whose message hash we built and whose fee payer is the operator; all signatures verified |
| Cheap price via clean wallet, pay with risky wallet | if `buyer_wallet` was used for pricing, `/pay` requires `payer == buyer_wallet` |
| Terms changed after purchase | tiers, amount, times and `fee_bps` stored on the booking; config changes never apply retroactively |
| Hotel never delivers / room not as described | 24 h dispute window after check-in; admin arbiter (disclosed stub) |
| Double booking via OTA calendar lag | `Pending` → confirm after fresh re-sync; permissionless void after 2 h → full refund |
| SSRF via iCal URLs | https only, private-IP/loopback denylist after DNS resolution (inside the socket lookup), redirect re-check, size + time limits; the test-only `ICAL_ALLOW_LOOPBACK` is accepted on localnet only (ADR-0017) |
| Session forgery | HMAC-signed cookie, `httpOnly`, `sameSite=lax`, `secure` in prod; SIWS nonce single-use, 5-min TTL |
| Application spam | per-IP rate limit, honeypot field, server-side validation |
| Faucet abuse | demo mode only, never on mainnet, per-wallet + per-IP rate limits |
| Prompt injection via on-chain data / iCal summaries (MCP) | tools return structured data; iCal `SUMMARY` never shown to the model verbatim beyond a length-limited, escaped field |
| RPC lies / stale reads | server verifies booking account owner = program id, discriminator, and fields before trusting; confirmed commitment |

## Honest limits of the trust property (say these out loud)

- The program is **upgradeable by Stumari** today (upgrade authority = the deployer/operator key on devnet). Whoever holds that key could replace the program. Before real money: upgrade authority → multisig, or freeze the program.
- **Disputed** bookings can only be settled by the admin key. If Stumari disappeared, disputed funds would stay locked (non-disputed bookings still release or refund permissionlessly).

## Before mainnet (checklist)

- [ ] Independent review of `stumari_escrow` (at minimum a second engineer + Solana security checklist in the solana-dev skill `security.md`).
- [ ] Upgrade authority → Squads multisig; admin → multisig.
- [ ] Operator key in a KMS or at least a separate low-balance hot wallet; alerting on balance.
- [ ] Per-booking amount cap (`AMOUNT_CAP_MINOR`, default 1,500 USDC) enforced off-chain during the pilot (`/pay` → `422 AMOUNT_CAP`).
- [ ] Legal/tax review for the pilot hotels (USDC receipts in Georgia) — not legal advice from this repo.
