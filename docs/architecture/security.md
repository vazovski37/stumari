# Security Model

## Assets
Guest USDC in escrow · hotel payouts · the operator key (fee payer, quote signer) · the admin key (arbiter stub) · guest contact data · hotel application data.

## Key custody (MVP)

| Key | Where | Blast radius if stolen |
|---|---|---|
| Operator / quote signer | `OPERATOR_SECRET_KEY` env on the web server | Can mint quotes at arbitrary prices and co-sign bookings — **but a guest must still sign and pay**, so no funds can be taken; can confirm pending bookings; can drain the operator's own SOL. Rotate with `update_config`. |
| Admin | `ADMIN_SECRET_KEY` env (devnet: same as operator) | Can split **disputed** bookings between guest and hotel, void **pending** bookings (refund only), register/deactivate hotels, pause new bookings, set fee ≤ 10% for **future** bookings. Cannot send escrow anywhere except guest, hotel, or treasury (bounded by each booking's fee snapshot). |
| Program upgrade authority | deployer keypair (`onchain/keys/`, gitignored) | Can replace the program → full control. **Mainnet: transfer to a Squads multisig or make immutable before holding meaningful funds.** |

Never commit keys. `.gitignore` covers `*.json` keypairs under `onchain/keys/`, `.env*`, `apps/web/.data/`.

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| Guest alters price/terms in the payment tx | `create_booking` requires `quote_signer` signature over the whole message (ADR-0004) |
| Replay of a quote / double booking of one quote | booking PDA is unique per `booking_id`; server marks quote `used`; hold is single-owner |
| Cheap price via clean wallet, pay with risky wallet | if `buyer_wallet` was used for pricing, `/pay` requires `payer == buyer_wallet` |
| Terms changed after purchase | tiers, amount, times and `fee_bps` stored on the booking; config changes never apply retroactively |
| Hotel never delivers / room not as described | 24 h dispute window after check-in; admin arbiter (disclosed stub) |
| Double booking via OTA calendar lag | `Pending` → confirm after fresh re-sync; permissionless void after 2 h → full refund |
| SSRF via iCal URLs | https only, private-IP/loopback denylist after DNS resolution, redirect re-check, size + time limits |
| Session forgery | HMAC-signed cookie, `httpOnly`, `sameSite=lax`, `secure` in prod; SIWS nonce single-use, 5-min TTL |
| Application spam | per-IP rate limit, honeypot field, server-side validation |
| Faucet abuse | demo mode only, never on mainnet, per-wallet + per-IP rate limits |
| Prompt injection via on-chain data / iCal summaries (MCP) | tools return structured data; iCal `SUMMARY` never shown to the model verbatim beyond a length-limited, escaped field |
| RPC lies / stale reads | server verifies booking account owner = program id, discriminator, and fields before trusting; confirmed commitment |

## Before mainnet (checklist)

- [ ] Independent review of `stumari_escrow` (at minimum a second engineer + Solana security checklist in the solana-dev skill `security.md`).
- [ ] Upgrade authority → Squads multisig; admin → multisig.
- [ ] Operator key in a KMS or at least a separate low-balance hot wallet; alerting on balance.
- [ ] Per-booking amount cap (e.g. 1,500 USDC) enforced off-chain during the pilot.
- [ ] Legal/tax review for the pilot hotels (USDC receipts in Georgia) — not legal advice from this repo.
