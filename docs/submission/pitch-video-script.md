# Pitch video script (≤ 2:00)

Two founders on camera, one short product cut-in. Target **1:50**; narration runs at about 2.5 words per second, so each beat's word budget is its length in seconds × 2.5. The full-length numbers take longer to say than to read, so rehearse the problem beat. Everything in `[BRACKETS]` (`[NAME]`, `[N]`, `[MILESTONE]`, `[ASK]`) is filled on recording day from real records ([leads.csv](../sales/leads.csv), the admin console, Explorer). **If a number is zero, say zero or cut the line. Never estimate or round up.** Claims follow [vision-and-positioning.md](../product/vision-and-positioning.md#what-we-explicitly-do-not-claim).

| Time | Beat | On screen | Narration |
|---|---|---|---|
| 0:00–0:15 | **Team and founder-market fit** | Both founders, Tbilisi backdrop | **[FOUNDER 1]:** "I'm [NAME], from Georgia, an ML and full-stack engineer." **[FOUNDER 2]:** "I'm [NAME], a computer science student in Tbilisi. Tbilisi has 710 independent hotels and 27 chain hotels; we can talk to their owners in their own language." |
| 0:15–0:47 | **Problem** | Founder on camera; cut-in: landing page | "Independent hotels pay OTAs 15 to 25 percent and give every guest one blanket policy, though 27% of ordinary bookings cancel, 37% overall including no-shows and group blocks. Stripe has never supported Georgia. Russia sent 1,579,764 of Georgia's 5.5 million visitors in 2025. Russian-issued cards don't work abroad, so many of those guests pay small hotels in USDT, with no receipt or refund rule." |
| 0:47–1:10 | **Seller-side insight** | Cut-in: quote menu with three prices and the explain panel | "Hopper, Booking.com Smart Flex and Cover Genius already price cancellation risk, but for the buyer: a third party sells the guest an option and keeps the spread. We turn it around. A model tuned by the hotel's own policy writes each booking's contract, the hotel keeps the premium, and a Solana USDC escrow enforces it." |
| 1:10–1:22 | **Traction** | Founder on camera; cut-in: admin applications list (blur contact data) | "In [N] days we called [N] Tbilisi hotels; [N] applied and [N] signed the pilot. [MILESTONE, with its date]." |
| 1:22–1:34 | **Why Solana** | Cut-in: Explorer, escrow account + refund transaction | "Solana settles USDC for a fraction of a cent in under a second, so we pay every guest's network fees and give even a one-night booking its own escrow." |
| 1:34–1:50 | **The ask** | Both founders | "We're starting with the first 10 Tbilisi hotels, with no Stumari fee until the end of 2026. We're asking for [ASK], to take the pilot to mainnet safely. Stumari: stablecoin checkout for merchants with cancellable inventory." |

`[MILESTONE]` is the strongest true one: the first real booking, or the first devnet booking on a real hotel's inventory. `[ASK]` is one specific request, e.g. an accelerator place, intros to Solana wallets and stablecoin off-ramps in Georgia, or mentors on escrow audits; keep it to about five words so the beat stays within 40.

## Rules

- Say "stablecoin checkout for merchants". Never "travel app", "escrow app", or "the first …".
- Use only these statistics, exactly as written:
  - OTA commission 15–25%;
  - 27% of ordinary bookings (37% overall incl. no-shows and group blocks), in the 119,390-booking Hotel Booking Demand dataset;
  - Stripe has never supported Georgia;
  - Russia sent 1,579,764 of Georgia's 5.5M visitors in 2025. Say the full number, never "1.58 million";
  - 710 independent vs 27 chain hotels in Tbilisi;
  - if the model comes up in Q&A: AUC 0.713 vs 0.634 for lead time alone, Brier score 0.1917 vs 0.2136 for the base rate, expected calibration error 0.038, all on held-out 2017 arrivals ([ml/reports/metrics.md](../../ml/reports/metrics.md)).

  Anything else must come from [landscape.md](../research/landscape.md).
- Don't say "cards don't work in Georgia". The accurate claim is that Russian-issued cards don't work abroad.
- The accelerator ask must match the accelerator decision in [status.md](status.md).
