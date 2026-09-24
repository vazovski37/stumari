# Demo video script (≤ 3:00, live product)

Show the **live product on devnet**: real screens and real transactions, no slides. Record each beat as its own clip, cut out waiting time, and keep the final cut **≤ 3:00** (target 2:50). Narration runs at about 2.5 words per second, so each line fits its slot. Wording follows [vision-and-positioning.md](../product/vision-and-positioning.md): say "stablecoin checkout for merchants". Never call it a "travel app" or an "escrow app", and claim no "firsts".

## Prep (day before)

- [ ] Web app deployed on devnet with `STUMARI_DEMO_MODE=true` ([runbook](../plan/runbook.md)). The demo hotel is seeded by bootstrap.
- [ ] Two browser profiles, each with its own funded **Test wallet**:
  - **Guest A**: a new wallet with no history.
  - **Guest B**: a **repeat guest** whose wallet has 1–3 `released` stays at the demo hotel. The model's wallet-history features are `is_repeated_guest` and `previous_bookings_not_canceled` ([pricing-and-risk-model.md](../architecture/pricing-and-risk-model.md#features--only-what-stumari-knows-at-quote-time)). Create these stays the day before with same-day bookings and the 2-minute demo release delay (see the release beat below).
  - Connect each wallet **before** clicking "See prices", so the quote is priced with that wallet's history (`buyer_wallet`). Cancellations are *not* a model input, so don't narrate "this guest cancelled before".
  - Rehearse the pair and check that the flexible prices really differ. If the difference is too small to see, use a longer lead time, since risk grows with lead time. Never fake a number.
- [ ] **Cancel beat**: use check-in dates 4–6 days out for the pay and cancel beats. Standard then refunds 50%, and Explorer shows both the guest's refund and the hotel's share. Before cancelling, wait until the booking shows **Confirmed**; a *pending* booking always refunds 100%.
- [ ] **Release beat**: set the demo hotel's check-in time a few minutes ahead, make a same-day booking, and let `release_delay_secs = 120` pass. The payout is then due on camera ([escrow-program.md](../architecture/escrow-program.md#constants)).
- [ ] Calibration plot open in a tab. The web app renders `ml/reports/reliability.json`; a PNG is optional. Copy the AUC numbers from `ml/reports/` into the narration below.
- [ ] Claude Desktop with the Stumari MCP server configured and a funded devnet agent key ([runbook](../plan/runbook.md#8-mcp-server-for-claude-desktop)).
- [ ] Solana Explorer on `?cluster=devnet`. Browser zoom 125%. Close notifications.

## Script

| Time | Beat | On screen (action) | Narration |
|---|---|---|---|
| 0:00–0:15 | **Problem** | Landing page `/`, scroll slowly past the pilot offer | "Independent hotels pay OTAs 15 to 25 percent. More than a third of bookings cancel, and every guest gets one blanket policy. In Georgia, guests with Russian-issued cards can't pay by card, so they send USDT to the owner's personal wallet. Stumari is a stablecoin checkout for merchants with cancellable inventory." |
| 0:15–0:35 | **Hotel onboarding with iCal** | `/admin` → the demo hotel → a unit with a Booking.com iCal import URL → **Sync** → blocked dates appear → copy the unit's **export URL** | "A hotel connects its inventory in minutes over iCal. We import its Booking.com and Airbnb calendars, and it pastes our export feed back, so a room sold here is blocked there too." |
| 0:35–1:15 | **Two guests, same three contracts, different prices** | Split screen: Guest A and Guest B on `/h/{demo-slug}`, same room and dates → **See prices**. Flexible / Standard / Non-refundable, priced differently for each guest. Open the **explain panel**: P(cancel), per-window cancellation probability, risk cost per contract, multiplier (price ÷ base rate), resale assumptions. Cut to the **calibration plot** (reliability curve from `ml/reports/reliability.json`). | "Each request gets one signed quote with three contracts, each priced by a calibrated time-to-cancel model. Guest B has stayed here before, so flexibility costs them less than it costs Guest A. The hotel's current policy always costs its normal rate. The others are priced so the hotel expects the same revenue from this guest, within its bounds. The model was trained on public hotel booking data. Its AUC is [AUC from ml/reports], against [baseline AUC] for lead time alone, and it is calibrated on held-out data. Others price cancellation risk for the buyer. Here the seller's model prices the seller's risk, and the hotel keeps the premium." |
| 1:15–1:45 | **Pay → escrow on Solana** | Guest A picks **Standard** → pays with the Test wallet (one signature, no SOL) → booking page `/b/{id}` shows **Confirmed** and the terms timeline → click the Explorer link → the booking account and its USDC vault | "The guest pays USDC into an escrow for this booking only. The exact refund schedule is written into it. The guest needs no SOL; Stumari pays the fees. Our quote signer co-signs the transaction, so the guest can't change the terms. After a fresh calendar check, the booking is confirmed." |
| 1:45–2:15 | **Cancel → refund by schedule** | On `/b/{id}`: "Refund if you cancel now" shows the amount → **Cancel** → sign → Explorer: one transaction paying the guest's refund and the hotel's share | "The guest cancels. The refund depends only on when they cancel and when check-in is, so there's no claims desk and no oracle. The program pays the refund by the schedule, and the hotel's share goes out in the same transaction." |
| 2:15–2:30 | **Release / payout** | The prepared same-day booking: page shows it is past check-in + release delay → refresh → **Released** → Explorer: USDC transfer to the hotel's wallet | "If the guest stays, the escrow pays the hotel's own wallet after check-in plus the dispute window. That is 24 hours in production and 2 minutes in this demo. Anyone can trigger the release." |
| 2:30–2:50 | **An AI agent books through MCP** | Claude Desktop: "Find a double room at the demo hotel for Nov 5–8, 2 adults, show the contracts and book the flexible one." Tool calls `search_availability` → `get_quote` (reports "signature verified") → `book` → returns `booking_url` → open it | "AI agents book through our MCP server under the same terms. The agent checks the quote signature and signs with its own devnet wallet. It gets the same code-enforced contract, which a machine can verify instead of clicking 'I accept'." |
| 2:50–3:00 | **Trust property + what is stubbed** | Text overlay on the Explorer view: "Escrow can only pay: guest · hotel · capped fee. Stub: arbiter = single admin key." | "Funds can only go to the guest, the hotel, or a capped fee. No Stumari key can redirect them. The stub: one admin key decides disputes today. A multisig is on the roadmap." |

## Don't

- Don't show slides or mockups. Every screen is the deployed app, Explorer, Claude Desktop, or the plot file.
- Don't say "first", "no one else", or that independents cannot get cancellation pricing (Hopper reaches them through Cloudbeds).
- Don't show traction you do not have. Don't show private keys, `.env` files or a seed phrase on screen.
