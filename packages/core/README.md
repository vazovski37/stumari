# @stumari/core

Pure TypeScript domain logic shared by the web app, the MCP server and scripts: refund math,
tiers, the cancellation-model evaluator, the pricing engine and the signed quote format.
No Solana SDK; runtime deps are `@noble/curves`, `@noble/hashes` and `@scure/base` only.

Specs are the contract: `docs/architecture/escrow-program.md`, `quote-protocol.md`,
`pricing-and-risk-model.md`, `data-model.md`. Conventions: money is `bigint` base units
(decimal strings in JSON), timestamps are unix seconds, percentages are bps.

```sh
pnpm --filter @stumari/core test        # vitest: vectors, examples, properties, parity
pnpm --filter @stumari/core typecheck
```

## API overview

| Module | Exports |
|---|---|
| `money` | `parseMinor` / `formatMinor` (u64 ⇄ decimal string), `toMinor("123.45")`, `formatUsdc(123450000n)` → `"123.45 USDC"`, `mulBpsFloor`, `priceFromMultiplier(B, m_bps)` (rounds up to a whole cent), `U64_MAX`, `BPS_DENOM` |
| `ids` | `uuidToBytes` (on-chain `hotel_id`), `bytesToHex` / `hexToBytes`, `deriveBookingId(quoteId)` / `bookingIdHex` (ADR-0011), `uuidV4`, `isUuid` |
| `windows` | the six cancellation windows: `WINDOW_LOWER_DAYS`, `WINDOW_LABELS`, `isReachable`, `reachableWindows`, `exposureDays` |
| `tiers` | `Tier`, `TEMPLATES` (flexible / standard / nonrefundable, with plain-language descriptions), `TEMPLATE_IDS`, `validateTiers` (same rules and error as the program), `refundBpsFor` (i64 compare, accepts `bigint`), `perWindowRefund`, `matchTemplate` |
| `payout` | `splitCancel`, `splitRelease`, `splitResolve` (exact on-chain math, typed errors), `minRefundForCancel({ booking, now })` (refund by the tier schedule at now + 90 s — the `cancel_booking(min_refund)` argument), `BOOKING_STATUS_CODES` |
| `dates` | Intl-only: `checkinTs(date, "HH:MM", tz)`, `localDate(ts, tz)`, `nightsBetween`, `weekendNights` (nights starting Fri/Sat), `weekdayMon0`, `monthOf`, `addDays`, `leadTimeDays` |
| `features` | the adapter: `ModelRequest` → `adaptRequest` → `RequestFeatures`; `walletHistoryFeatures(buyerWallet, releasedCount)`; `oneHotColumnName`; `windowFeatures` |
| `model` | `loadModel(json)` (validates `stumari-gbdt-hazard/2`), `featureVector`, `rawScore`, `hazardFromRaw` (`numpy.interp` semantics), `qVector`, `pCancel`, `logistic`, `assessRisk(model, request)` |
| `pricing` | `PricingPolicy`, `DEFAULT_POLICY`, `validatePolicy`, `riskCost`, `modelProvider(model)`, `priceMenu({ provider, request, policy, basePriceMinor })` → `{ options, explain }` |
| `quote` | `buildQuoteBody`, `canonicalize`, `hashQuote`, `signQuote(body, secretKey)` (32-byte seed or 64-byte Solana keypair), `verifyQuote(envelope, expectedSigner?)`, `publicKeyBase58`, `QUOTE_TTL_SECS` |
| `errors` | `CoreError` with `code`; on-chain names (`InvalidTiers`, `TooLateToCancel`, `InvalidBps`, `InvalidStatus`, `InvalidAmount`, `MathOverflow`) plus `InvalidInput`, `InvalidPolicy`, `InvalidModel`, `NonCanonical` |

### Quote flow (server)

```ts
import model from "@stumari/core/model/model.json";
const hazard = modelProvider(loadModel(model));            // load once per process
const history = walletHistoryFeatures(buyerWallet, releasedCount);
const request: ModelRequest = { issued_at, checkin_ts, checkin_date, checkout_date, adults, children,
  buyer_type, hotel_type: hotel.hotel_type, meal: roomType.meal, ...history };
const { options, explain } = priceMenu({ provider: hazard, request, policy: hotel.policy, basePriceMinor });
const body = buildQuoteBody({ ...fields, options, issued_at });  // expires_at = issued_at + 600
const envelope = { ...signQuote(body, quoteSignerSecret), explain };
const bookingId = bookingIdHex(body.id);                    // PDA seed bytes: deriveBookingId(body.id)
```

`priceMenu` implements pricing §5 exactly: `c_T = Σ q_k·max(0, r_T,k − s_k)`,
`m_T = (1 − c_R)/(1 − c_T)`, `m_bps` = 10000 for the reference template, otherwise round half
up; withheld when `1 − c_T ≤ 0.05` or `m_bps > max_mult_bps`; floored at `min_mult_bps`;
templates identical on every reachable window collapse to one (reference first, else menu
order). Every enabled template appears in `explain.options` with `withheld` /
`clamped` / `same_as` so the UI can say why an option is missing.

## Test vectors

- `spec/vectors/refund.json` — shared with the Rust program; every cancel / release / resolve /
  tier-validation case runs in `test/refund.test.ts`.
- `spec/vectors/quote.json` — produced by `test/quote.test.ts` from a fixed body and the seed
  `0x01 × 32`: canonical string, sha256, signature, uuid bytes and booking ids. The test fails
  if the file drifts; regenerate deliberately with `UPDATE_VECTORS=1 pnpm --filter @stumari/core test`.
- `test/fixtures/tiny-model.json` — a hand-built model with dyadic leaf values, duplicate
  calibration knots and non-preorder child indices; expected hazards are numpy's outputs.

## Parity with `ml/`

The Python side (`ml/stumari_ml/adapter.py`, `jsonmodel.py`, `parity.py`) exports
`model/model.json` and `model/parity.json` into this package (read-only here).
`test/parity.test.ts` checks, when both files exist (otherwise it reports one skipped test):

- **vectors** (≥ 500 feature rows): `rawScore` equals Python's `raw` **exactly** (trees summed
  sequentially from 0 in tree order, `x[f] <= t` goes left), hazard within `1e-12`;
- **requests** (≥ 30 requests: same day, 1–400-day leads, Fri/Sat arrivals, children, repeat
  guests, agents, unknown categories, year and leap-day boundaries): every booking-level
  feature column exactly, `raw` exactly, `hazard` / `q` / `p_cancel` within `1e-12`.

Adapter rules that parity pins down: one-hot column names are
`group + "_" + slug(value)` (lowercase, each non-alphanumeric run → `_`), unknown categories
give an all-zero group, agents are Direct/Direct/Transient (ADR-0014),
`previous_bookings_not_canceled` is capped at 3, and the dataset's `meal Undefined → SC` is a
training-data rule only (the adapter passes `meal` through). After retraining, rerun the test;
a mismatch names the request and feature that differ.
