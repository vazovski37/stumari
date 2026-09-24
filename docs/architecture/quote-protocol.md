# Quote Protocol (v1)

A quote is the seller agent's offer: a menu of contracts for one specific request, signed by Stumari's quote signer. The same key co-signs the on-chain `create_booking`, so an off-chain quote and an on-chain booking are provably from the same authority (`config.quote_signer`).

## Envelope

```json
{
  "quote": { "...canonical body, see below..." },
  "signer": "<base58 Ed25519 public key>",
  "signature": "<base58 Ed25519 signature over canonical(quote)>",
  "hash": "<hex sha256 of canonical(quote)>",
  "explain": { "...unsigned, informational..." }
}
```

Only `quote` is signed. `explain` carries floats (probabilities, hazards) and human text; it is never used for money.

## Signed body — `quote`

| Field | Type | Notes |
|---|---|---|
| `v` | int | `1` |
| `id` | string | UUID v4 |
| `cluster` | string | `devnet` \| `mainnet-beta` \| `localnet` |
| `program_id` | string | base58 |
| `hotel_id` | string | UUID (its 16 bytes seed the Hotel PDA) |
| `hotel_slug` | string | |
| `room_type_id` | string | UUID |
| `checkin_date`, `checkout_date` | string | `YYYY-MM-DD` in hotel timezone |
| `checkin_ts`, `checkout_ts` | int | unix seconds of the hotel's check-in / check-out time on those dates |
| `nights` | int | ≥ 1 |
| `adults`, `children` | int | |
| `buyer_type` | string | `guest` \| `agent` |
| `buyer_wallet` | string \| null | if present, the quote was priced with this wallet's history and **only this wallet may pay** |
| `mint` | string | base58 |
| `decimals` | int | `6` |
| `base_price_minor` | string | u64 as decimal string (sum of nightly base rates) |
| `options` | array | see below; index = position |
| `issued_at`, `expires_at` | int | unix seconds; `expires_at = issued_at + 600` (10-minute hold) |
| `nonce` | string | 16 random bytes, hex |

Option:

| Field | Type | Notes |
|---|---|---|
| `id` | string | `flexible` \| `standard` \| `nonrefundable` |
| `price_minor` | string | u64 decimal string — the amount escrowed |
| `deposit_bps` | int | `10000` in the MVP (full prepay, ADR-0002) |
| `tiers` | array of `{ secs_before: int, refund_bps: int }` | exactly as they will be written on-chain |

All u64 money values are **decimal strings**; integers that fit in 2^53 (timestamps, bps, counts) are JSON numbers. No floats in the signed body.

## Canonicalization

`canonical(value)`:
- objects: keys sorted by UTF-16 code unit order (JavaScript default sort), serialized as `{"k":v,...}` with no whitespace;
- arrays: in order, `[a,b]`;
- strings: `JSON.stringify` escaping;
- numbers: integers only (`JSON.stringify` of a safe integer);
- `null`, `true`, `false` literal.

Bytes = UTF-8 of the canonical string. `hash = sha256(bytes)`; the same 32 bytes are the on-chain `quote_hash`. `signature = Ed25519.sign(bytes, quote_signer_secret)`.

`packages/core` exports `canonicalize`, `hashQuote`, `signQuote`, `verifyQuote`. Test vector: `spec/vectors/quote.json` (produced by core's test suite and checked into the repo so any other implementation can verify).

## Lifecycle

1. `POST /api/quotes` — server checks availability, prices the menu, stores the quote, places a **hold** on one room unit until `expires_at`, returns the envelope.
2. `POST /api/quotes/{id}/pay { option_index, payer }` — server re-validates: quote `active`, `now < expires_at`, hold still owned by this quote, option exists, `payer == buyer_wallet` when `buyer_wallet` is set, and price ≤ the pilot amount cap. The `booking_id` is **deterministic per quote**: `sha256("stumari-booking-v1" ‖ quote.id as UTF-8)[0..16]`. Before building, the server reads the booking PDA: if it exists → `409 ALREADY_PAID` with the booking view. Because the booking PDA is `init`, at most one `create_booking` per quote can ever succeed on-chain, whatever the option or retry. The server builds the transaction (api.md contract), partially signs as fee payer + quote signer, caches it and returns it; it marks the quote `used` when the booking is observed on-chain.
3. The blockhash in a built transaction is short-lived (~60–90 s). Repeat `/pay` calls return the cached transaction while it is valid, then a freshly built one (same `booking_id`) while the quote is valid.
4. Expired quotes release their hold (cron + lazy expiry on read).

## Explain block (unsigned)

```json
{
  "model_version": "hazard-gbdt-2026-09-25",
  "p_cancel": 0.2174,
  "hazard": [0.05, 0.04, 0.03, 0.05, 0.04, 0.03],
  "q": [0.05, 0.038, 0.02736, 0.04423, 0.03362, 0.0242],
  "lead_time": 45,
  "buyer_type": "guest",
  "reference_template": "standard",
  "resale_bps": [9000, 8000, 6500, 4500, 2500, 1000],
  "options": [
    { "id": "flexible", "risk_cost": 0.0814, "multiplier": 1.0621, "m_bps": 10621, "expected_revenue_minor": "…", "clamped": null, "withheld": null },
    { "id": "standard", "risk_cost": 0.0244, "multiplier": 1.0, "m_bps": 10000, "expected_revenue_minor": "…", "clamped": null, "withheld": null },
    { "id": "nonrefundable", "risk_cost": 0.0, "multiplier": 0.9756, "m_bps": 9756, "expected_revenue_minor": "…", "clamped": null, "withheld": null }
  ],
  "features": { "lead_time": 34, "…": "…" }
}
```
