# Weekly update video — "What changed this week?" (due 2026-09-28, 8:00 AM PDT)

Deadline: **Monday 2026-09-28, 8:00 AM PDT = 19:00 Tbilisi.** Record by 17:00 Tbilisi to leave time for upload. Target length **0:55–1:00**; narration runs at about 2.5 words per second, so the script below (about 150 words) fills the minute. One founder on camera plus screen cut-ins.

Rules: only true facts ([e2e-report.md](../plan/e2e-report.md), [roadmap.md](../plan/roadmap.md), git history). Current truth: the MVP loop runs on a **local chain** only; devnet is not funded, so guest checkout on the public site is **not open** and there is no public demo link; real-money bookings start only after the security review and mainnet decision. The landing page and the demo/apply form are ready to go live but are **next**, not done, unless they are actually live on recording day. No hotel counts unless they come from [leads.csv](../sales/leads.csv) on recording day; if zero, don't mention a number. Say "stablecoin checkout for merchants", never "travel app" or "escrow app". Show "local chain / test money" on screen whenever a transaction is visible.

## Script (≈150 words)

> "Hi, I'm [NAME] from Stumari: a stablecoin checkout for merchants with cancellable inventory, starting with independent hotels in Tbilisi.
>
> This week we went from specs to the full MVP loop on a local Solana chain. A guest gets a quote with three cancellation contracts priced by our model, pays USDC into a per-booking escrow, then cancels and is refunded by the schedule, or the hotel gets paid after check-in. Our end-to-end test passes all 20 steps.
>
> An adversarial review of the whole stack led to 21 fixes. We researched which calendar systems Georgian hotels use, and added a manual confirm mode for hotels on a PMS like Mews: if the room isn't free, the guest gets a full automatic refund.
>
> And this week we start calling Tbilisi hotel owners.
>
> Next: the landing page and demo form go live; then devnet with a public demo link, first pilot hotels, and our videos. Thanks!"

Optional, only if true on recording day (replace the "this week we start calling" line): "Today we called [N] Tbilisi hotels, and [N] booked a setup call." Numbers from `leads.csv`, never estimated.

## Shot list

| Time | Beat | On screen | Source |
|---|---|---|---|
| 0:00–0:08 | Who we are | Founder on camera; lower third "Stumari — stablecoin checkout for merchants" | — |
| 0:08–0:28 | MVP loop | Screen: demo checkout with the three contracts → pay with test wallet → booking page **Confirmed** → Cancel → Explorer transaction. Caption: "Local chain · test money" | `/h/stumari-demo` on the local chain (founder's laptop), or the screenshots in [e2e-report.md](../plan/e2e-report.md). Never the public site: checkout there is not open yet. |
| 0:28–0:32 | 20/20 | Terminal: the E2E run ending in 20 of 20 steps passed | `scripts/e2e.ts` output / e2e report |
| 0:32–0:38 | Review, 21 fixes | Scroll of the review fixes commit or the backlog checklist | `git log` (commit "Wave 3 review fixes"), [backlog.md](../plan/backlog.md) |
| 0:38–0:48 | PMS hotels | `/admin` hotel Details with **Booking confirmation = Manual**, then the Telegram alert for a pending booking; quick cut of the research table (OtelMS, Exely) | admin console; [channel-managers.md](../research/channel-managers.md) |
| 0:48–0:52 | First calls | Phone next to the printed [call sheet](../sales/call-sheet.md); blur any real names or numbers | — |
| 0:52–1:00 | Next | Founder on camera; text: "Next: landing + demo form live · devnet + public link · pilot hotels · videos" | — |

## Before uploading

- [ ] Length ≤ 1:00; audio clear; captions on if the upload form allows.
- [ ] No private data in frame: lead names, phone numbers, wallet seed phrases, `.env` files, admin keys.
- [ ] Every sentence still true on the day (for example, don't say "devnet is live" unless it is). Don't say hotels can take bookings or that checkout is open; it is not.
