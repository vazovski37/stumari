# Pilot offer — founding hotels

> **DRAFT — founders confirm before sending.** This file is the single source of truth for what we offer hotels ([ADR-0013](../decisions/README.md)). The landing page, [one-pager](one-pager.md), [call script](call-script.md) and [objection answers](objections.md) must not contradict it. The pilot terms below are copied word for word. Change the offer here first, then everywhere else.

## Who it is for

- Independent hotels and guesthouses in Tbilisi (roughly 5–40 rooms), owner- or manager-run.
- They already sell on Booking.com and/or Airbnb, or take direct bookings over WhatsApp/Telegram/Instagram.
- Best fit: they already get guests who cannot pay by card and ask to pay in crypto. Many of these guests have Russian-issued cards, which do not work abroad.
- Not a fit (for now): chain hotels, or properties that need a PMS or channel-manager integration. We connect over iCal only. Multi-unit room types need a check of their extranet first (see below).

## The offer (copy exactly)

- Founding-hotel pilot for the first 10 independent hotels in Tbilisi.
- 0% Stumari fee on every booking until 31 December 2026. After that, a flat 1.5% of what the hotel receives, written into each booking on-chain before the guest pays.
- Paid in USDC on Solana to a wallet you control, automatically 24 hours after the guest checks in — unless the guest opens a dispute in that window, which Stumari's arbiter decides.
- Guest refunds follow the contract the guest chose, automatically.
- Guests need only USDC — no SOL, no network fees. Guests holding USDT swap to USDC inside Phantom.
- Free 20-minute setup call: we connect your Booking.com/Airbnb calendars (iCal) where available and set your room rates and the contracts you want to offer.
- You keep all your existing channels. Stumari adds a direct booking link for guests who pay in stablecoins, and a channel AI agents can book through. We don't bring you guests.
- You choose which contracts to offer and your price bounds; the model prices each request to target your current expected revenue.
- Per-booking limit of 1,500 USDC during the pilot.
- No exclusivity, no minimums, leave anytime.
- We help you set up a wallet and point you to licensed providers for converting USDC to lari. We don't give legal, tax or financial advice.

## What the hotel gets

| Feature | What it means |
|---|---|
| A booking page | `/h/{your-hotel}`. Guests see your rooms, pick dates and choose a contract (Flexible / Standard / Non-refundable). |
| Enforceable terms | Every booking's refund schedule is written into its own Solana escrow before the guest pays. It is the same for both sides and neither side can change it. |
| Automatic payouts | USDC reaches your wallet 24 h after check-in unless the guest opens a dispute, with no invoice and no chasing. |
| Automatic refunds | If a guest cancels, the escrow refunds them by the schedule and pays you the rest in the same transaction. |
| Calendar sync | Stumari reads your Booking.com/Airbnb calendars (iCal) and gives you a feed to paste back, so a room sold on Stumari is blocked there too. |
| A dashboard | Sign in with your wallet. See bookings, payouts, calendars and contract settings. |
| An AI-agent channel | AI agents can find your rooms and book them through Stumari's MCP server under the same terms. |

## What we ask from the hotel

1. **A payout wallet you control.** A self-custody wallet such as Phantom. We help you install it on the setup call. It cannot be an exchange deposit address, because the same wallet signs you in to the dashboard. We never ask for your seed phrase.
2. **iCal export links**, if you have them: one per room you sell on Booking.com/Airbnb.
3. **A 20-minute setup call**: room types, nightly rates in USD, check-in/out times, which contracts to offer.
4. **Feedback**: a short call after your first bookings about what worked and what did not.
5. **Permission to call you a pilot hotel**: your name on our site and in our hackathon submission. Ask for this explicitly and record the answer in [leads.csv](leads.csv).

## We promise / We do not promise

From [ADR-0013](../decisions/README.md). Never say or imply anything in the right column.

| We promise | We do not promise |
|---|---|
| USDC on Solana, paid to a wallet the hotel controls | Payouts in lari (GEL), or converting USDC for you. We point you to licensed providers. |
| Automatic release 24 h after check-in, unless the guest opens a dispute. Our disclosed arbiter decides disputes (today a single Stumari admin key). | Any token or chain other than USDC on Solana (guests with USDT swap in their own wallet) |
| Guest refunds follow the schedule the guest chose, automatically | New guests or demand. We are not an OTA. |
| Guests need no SOL. Stumari pays network fees. | Legal, tax or regulatory compliance, or advice on it. Ask your accountant. |
| 0% fee until 2026-12-31, then 1.5%, written into each booking before the guest pays | Guaranteed revenue. Prices are set to *target* your current expected revenue. |
| Per-booking cap of 1,500 USDC during the pilot | Payouts to exchange deposit addresses |
| | iCal onboarding for multi-unit room types before we have checked your extranet together |
