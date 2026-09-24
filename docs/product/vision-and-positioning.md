# Stumari — Vision and Positioning

Stumari (სტუმარი) is Georgian for "guest".

## One sentence

**Stumari is a stablecoin checkout for merchants with cancellable inventory, starting with independent hotels: the hotel's own model writes each booking's cancellation contract, and a Solana USDC escrow enforces it.**

## The problem

Independent hotels lose three ways:

1. **Distribution is expensive and slow.** OTAs take 15–25% base commission (effective rates reach 25–30% with visibility boosters) and pay out weeks later.
2. **One blanket cancellation policy covers every guest.** More than a third of bookings cancel — 37% in the public 119,390-booking Hotel Booking Demand dataset (Antonio, Almeida & Nunes, *Data in Brief* 22, 2019). A careful family booking six months out and a speculative booking two days out get identical terms.
3. **In markets like Georgia, modern payment rails are missing.** Stripe has never supported Georgia. Russia sent 1,579,764 of Georgia's 5.5M visitors in 2025, and Russian-issued Visa/Mastercard cards do not work abroad, so many of those guests already pay small hotels in stablecoins (mostly USDT) — straight into an owner's personal wallet, with no receipt and no refund rule. Stumari accepts USDC on Solana; a guest holding USDT swaps to USDC inside Phantom in one step.

## What Stumari does

- Each hotel gets a **seller agent** (runs in our cloud; nothing to install). Inventory connects in ~15 minutes via iCal.
- For every request, the seller agent returns **one signed quote** containing a *menu of contracts* (Flexible / Standard / Non-refundable). Each contract is a refund schedule; each price is set by a calibrated time-to-cancel model for *that* request so the hotel's expected revenue per booking stays at today's level.
- The guest (or an AI agent) picks a contract and pays USDC into a **per-booking Solana escrow** that encodes the exact refund schedule.
- Cancellations refund by the schedule automatically — no claims desk, no oracle, because the refund depends only on the cancellation time and the check-in time.
- Funds release to the hotel **24 hours after check-in** unless the guest flags a problem in that window (decided by Stumari's disclosed arbiter).

## Why the seller side is the insight

Models already price cancellation risk — Hopper/HTS "Cancel For Any Reason for Hotels" (reaching independents via Cloudbeds since Nov 2025), Booking.com Smart Flex, Cover Genius. In every one, **the model sits on the buyer's side**: it sells the guest an option and a third party underwrites it and keeps the spread. The hotel's own exposure is still one blanket policy it wrote by hand.

Stumari inverts the direction: **the seller's model prices the seller's risk, and the hotel keeps the premium.** Code-enforced terms are what make a model-written contract trustworthy to the buyer — including buyers that are machines and cannot click "I accept".

## What we explicitly do NOT claim

- Not the first to price cancellation risk (Hopper, Smart Flex, Cover Genius do — buyer-side).
- Not the first agent-payable hotel booking (Travala Travel MCP shipped June 2026; Google AI Mode Aug 2026).
- Not a novel escrow — we use commodity rails on purpose. The novelty is what is written into them.
- Not an OTA. The hotel owns the guest, the price bounds and the terms. We bring no demand in the MVP.

## Positioning for Colosseum (from research — see docs/research/landscape.md)

| Decision | Choice | Evidence |
|---|---|---|
| Category | **Stablecoins** | Stablecoin Payment Rails cluster wins at 9.9% vs 5.4% baseline; checkout products SP3ND/LocalPay won in the Stablecoins track |
| Label | "stablecoin checkout for merchants", never "travel" or "escrow" | 0/19 travel projects ever won; "smart contract escrow" lift −0.68 |
| Target user | **merchants** | Merchants appear among winners; travelers/hotel operators never do |
| Problem frame | high payment processing fees (OTA commission is a processing fee) | +0.54 lift vs −0.60 for "cross-border payment friction" |
| Chain | Solana (Solana ecosystem track: 10 × $10k) | — |

## Why now

- AI agents already pay over MCP and x402; a hotel selling to them needs terms a machine can verify, not a policy page.
- Russian-card guests in Georgia already pay in stablecoins — informally.
- Solana settles USDC for fractions of a cent in under a second.

## Honest risks

- **Viability:** Dtravel shipped nearly identical supply-side positioning (host as merchant of record, escrow with cancellation rules), got 200k listings in 30 days, and pivoted. Answer: two things it lacked — a model writing a different contract per request, and a concrete day-one demand segment (card-blocked guests) that does not depend on agent adoption.
- **Enforceability:** no-show and "room not as described" cannot be observed on-chain. The MVP handles them with a 24h dispute window and an admin arbiter key (disclosed stub; multisig on the roadmap).
- **Model transfer:** the prior is trained on Portuguese hotels 2015–2017; it must be recalibrated on each hotel's own outcomes.
