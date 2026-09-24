# Pitch video script (≤ 2:00)

Two founders on camera, one short product cut-in. Target **1:50**; narration runs at about 2.5 words per second. Everything in `[PLACEHOLDER]` brackets is filled on recording day from real records ([leads.csv](../sales/leads.csv), the admin console, Explorer). **If a number is zero, say zero or cut the line. Never estimate or round up.** Claims follow [vision-and-positioning.md](../product/vision-and-positioning.md#what-we-explicitly-do-not-claim).

| Time | Beat | On screen | Narration |
|---|---|---|---|
| 0:00–0:20 | **Team and founder-market fit** | Both founders, Tbilisi backdrop | **[FOUNDER 1]:** "I'm [NAME]. I'm from Georgia and I'm an ML and full-stack engineer." **[FOUNDER 2]:** "I'm [NAME], a computer science student in Tbilisi. Tbilisi has 710 independent hotels and 27 chain hotels, and we can walk into these hotels and talk to the owners in their own language." |
| 0:20–0:45 | **Problem** | Founder on camera; cut-in: landing page | "Independent hotels pay OTAs 15 to 25 percent commission, and more than a third of bookings get cancelled, yet every guest gets one blanket policy. Stripe has never supported Georgia. Russia sent 1.58 million of Georgia's 5.5 million visitors last year, and their Russian-issued cards don't work abroad. So those guests pay small hotels in USDT, straight to the owner's personal wallet, with no receipt and no refund rule." |
| 0:45–1:10 | **Seller-side insight** | Cut-in: quote menu with three prices and the explain panel | "Models already price cancellation risk. Hopper, Booking.com Smart Flex and Cover Genius all do it, but on the buyer's side: they sell the guest an option and a third party keeps the spread. Stumari turns this around. The hotel's own model writes each booking's contract, priced for this guest, and the hotel keeps the premium. A Solana USDC escrow enforces it, so even an AI agent can trust the terms." |
| 1:10–1:25 | **Traction** | Founder on camera; cut-in: admin applications list (blur contact data) | "In [PLACEHOLDER: N] days we called [PLACEHOLDER: N] Tbilisi hotels. [PLACEHOLDER: N] applied and [PLACEHOLDER: N] signed the pilot. [PLACEHOLDER: first real booking / first devnet booking on a real hotel's inventory, with its date]." |
| 1:25–1:40 | **Why Solana** | Cut-in: Explorer, escrow account + refund transaction | "Solana settles USDC for a fraction of a cent in under a second. That's what lets us pay every guest's network fees, so guests need only USDC, and give even a one-night booking its own escrow. Phantom lets a guest holding USDT swap to USDC in one step." |
| 1:40–1:55 | **The ask** | Both founders | "We're starting in Tbilisi with the first 10 hotels, with no Stumari fee until the end of 2026. We're asking for [PLACEHOLDER: the specific ask — e.g. accelerator place / intros to Solana wallets and stablecoin off-ramps in Georgia / mentors on escrow audits], so we can take the pilot to mainnet safely. Stumari: stablecoin checkout for merchants with cancellable inventory." |

## Rules

- Say "stablecoin checkout for merchants". Never "travel app", "escrow app", or "the first …".
- Use only these statistics, exactly as written: OTA commission 15–25%; 37% of 119,390 bookings cancelled (Hotel Booking Demand dataset; "more than a third"); Stripe has never supported Georgia; Russia sent 1,579,764 of Georgia's 5.5M visitors in 2025; 710 independent vs 27 chain hotels in Tbilisi. Anything else must come from [landscape.md](../research/landscape.md).
- Don't say "cards don't work in Georgia". The accurate claim is that Russian-issued cards don't work abroad.
- The accelerator ask must match the accelerator decision in [status.md](status.md).
