# Colosseum submission — status tracker

Project draft: https://colosseum.com/arena/projects/stumari. Category **Stablecoins**, chain **Solana**. Positioning follows [vision-and-positioning.md](../product/vision-and-positioning.md).

| Milestone | PDT | Tbilisi (UTC+4) |
|---|---|---|
| Final submission opens | 2026-10-06 4:00 AM | 2026-10-06 3:00 PM |
| **Final submission closes** | **2026-10-12 11:59 PM** | **2026-10-13 10:59 AM** |

Aim to submit on **2026-10-11** so there is a day of slack. Last updated: 2026-09-25.

## Filled (2026-09-25)

| Field | Status |
|---|---|
| Project name | ✅ Stumari |
| Brief description | ✅ |
| Category | ✅ Stablecoins |
| What it is / who it's for | ✅ |
| Why now | ✅ |
| Technologies | ✅ |
| Chains | ✅ Solana |
| How the chain is used | ✅ |
| Notes for judges | ✅ Re-check before submitting that it names the stubs (arbiter key, no hotel bond, model trained on the Portugal dataset), per [mvp-scope.md](../product/mvp-scope.md#stubbed-and-disclosed-on-screen) |

## Missing

| # | Field | Owner | Target date | Depends on / notes |
|---|---|---|---|---|
| 1 | Team country | Vazovski, luka | 2026-09-30 | Georgia |
| 2 | Team Telegram | Vazovski, luka | 2026-09-30 | |
| 3 | Logo | founders | 2026-10-03 | Square PNG. Use the same mark on the landing page. |
| 4 | GitHub link + repo context | founders (Claude drafts the README) | 2026-10-09 | Repo must be public or shared with judges. README: what it is, how to run ([runbook.md](../plan/runbook.md)), program id `6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf`, what is stubbed. No secrets in history. |
| 5 | Demo video (≤ 3 min, **live product**) | founders (script: [demo-video-script.md](demo-video-script.md)) | record 2026-10-09, upload 2026-10-10 | Needs the devnet demo end to end (roadmap M4), the calibration plot in `ml/reports/`, and the MCP clip |
| 6 | Live product link + access instructions | founders | 2026-10-06 | Vercel URL (custom domain if ready, M5). Access text: "Devnet. Open `/h/{demo-slug}`, choose **Test wallet**, click **Get 500 test USDC**, book, then cancel on the booking page. No install needed. Phantom users: switch to Testnet Mode → Solana Devnet." |
| 7 | Pitch video (≤ 2 min) | founders (script: [pitch-video-script.md](pitch-video-script.md)) | record 2026-10-10 | Traction numbers are filled from [leads.csv](../sales/leads.csv) on recording day. Nothing invented. |
| 8 | X (Twitter) profile | founders | 2026-10-03 | Project account. Pin a post with the demo video. |
| 9 | Teammate submission profile: **Vazovski** | Vazovski | 2026-10-06 | Name, country, Telegram |
| 10 | Teammate submission profile: **luka** | luka | 2026-10-06 | Name, country, Telegram |
| 11 | Accelerator decision | founders | 2026-10-08 | Currently **"Hackathon only"**. Decide whether to opt in to the accelerator before submitting. |

## Final check (on submission day)

- [ ] Live link opens in a private window and the demo wallet flow works on devnet.
- [ ] Both videos are public or unlisted and play without login; lengths ≤ 3:00 and ≤ 2:00.
- [ ] Every claim in the form and videos matches [offer.md](../sales/offer.md) and the "What we explicitly do NOT claim" list in [vision-and-positioning.md](../product/vision-and-positioning.md#what-we-explicitly-do-not-claim).
- [ ] No keys or `.env` files in the repo (`git log -p | grep -i secret` is clean).
- [ ] Both teammates are on the submission.
