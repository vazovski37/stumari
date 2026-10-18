# MVP Scope

**Goal:** a live product good enough to (1) call Tbilisi hotels and sign a pilot, (2) record the Colosseum demo video showing the *live product*, (3) take a first real booking.

Deadline: Colosseum final submission 2026-10-12 11:59 PM PDT (submission opens 2026-10-06).

## The loop (must work end to end, for real)

| # | Step | Component |
|---|---|---|
| 1 | Hotel connects inventory over **iCal** (import URL per room unit) and gets an **iCal export feed** to paste into Booking.com/Airbnb | web app + DB |
| 2 | Seller agent returns a **signed quote**: menu of contracts (price + refund schedule each), Ed25519-signed, **10-minute hold** on a room unit | `packages/core` + web API |
| 3 | Prices come from **one real model**: calibrated discrete-time time-to-cancel model trained on the Hotel Booking Demand dataset; calibration plot shown in demo | `ml/` → `packages/core` evaluator |
| 4 | Guest pays with **Phantom**: USDC lands in a per-booking escrow encoding the schedule | on-chain program + checkout UI |
| 5 | Guest **cancels** → refund executes on-chain by the schedule (the demo's key moment) | program + booking page |
| 6 | **Release** to the hotel 24h after check-in (permissionless crank) | program + cron |

## Also in scope

- **Landing page for hotels** (EN / KA / RU) with the pilot offer and an **Apply** form → stored in DB, visible in admin.
- **Hotel dashboard** (Sign-In With Solana): bookings, payouts, iCal settings, policy bounds.
- **Admin console**: applications pipeline, hotel creation + on-chain registration, dispute resolution, manual sync/release.
- **Guest booking page**: status, terms timeline, "refund if you cancel now", cancel button, explorer links.
- **Unconfirmed void** (`void_booking`): booking is `Pending` until the operator confirms inventory write-back; confirming is impossible after the 2 h deadline and anyone can then void for a full refund.
- **Dispute window**: guest can flag between check-in and release (24 h); admin arbiter resolves with a split.
- **MCP server** with five tools (`search_availability`, `get_quote`, `book`, `cancel`, `booking_status`) wrapping the public API — one short demo clip of an agent booking.
- **Sales kit**: pilot offer, call script, objection handling, onboarding checklist, lead tracker.
- **Submission kit**: demo video script, pitch video script, status tracker.

## Stubbed, and disclosed on screen

- **Arbiter** = a single admin key (roadmap: Squads multisig with bonded arbiters).
- **Hotel bond** — not implemented.
- **Model transfer** — prior trained on Portugal 2015–17 data; per-hotel recalibration is roadmap.

## Cut until after 2026-10-12

- Bandit / RL pricing policy (menu pricing is deterministic and explainable instead — ADR-0003).
- Pooled learning across hotels (outcomes are already recorded on-chain as events; retraining is roadmap).
- Tour-operator RFQ negotiation, group bookings.
- x402 pay-per-call (MCP `book` returns a transaction to sign instead). The remote concierge MCP (ADR-0020) goes further: its `book` returns a website payment link and signs nothing.
- Channex / PMS adapters (iCal only).
- Partial deposits (full prepay into escrow; `deposit_bps` stays in the quote format for later — ADR-0002).
- Card payments, fiat off-ramp, multi-currency.

## Definition of done

- [ ] Program deployed on devnet; all state transitions covered by tests (incl. time-travel for tiers and release).
- [ ] Model trained; metrics + calibration plot committed; TS evaluator matches Python on test vectors.
- [ ] A demo hotel on devnet: quote → pay with Phantom → confirm → cancel with scheduled refund, visible on explorer.
- [ ] Release crank works (demonstrated on local validator with time travel, and on devnet with a short release delay).
- [ ] Landing page + apply form live locally and deployable (Vercel + Turso instructions).
- [ ] Hotel dashboard shows bookings and the iCal export feed; import sync blocks dates.
- [ ] MCP server books a room end to end (returns a transaction the agent's wallet signs).
- [ ] Sales kit + demo/pitch scripts written.
