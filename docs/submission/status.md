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
| Notes for judges | ✅ Re-check before submitting that it names the stubs (arbiter key, no hotel bond, model trained on the Portugal dataset), per [mvp-scope.md](../product/mvp-scope.md#stubbed-and-disclosed-on-screen), and the honest limits of the trust property (program upgradeable by Stumari during the pilot; disputed funds depend on the arbiter key), per [security.md](../architecture/security.md#honest-limits-of-the-trust-property-say-these-out-loud) |

## Missing

| # | Field | Owner | Target date | Depends on / notes |
|---|---|---|---|---|
| 1 | Team country | Vazovski, luka | 2026-09-30 | Georgia |
| 2 | Team Telegram | Vazovski, luka | 2026-09-30 | |
| 3 | Logo | founders | 2026-10-03 | Square PNG. Use the same mark on the landing page. |
| 4 | GitHub link + repo context | founders (Claude drafts the README) | 2026-10-09 | Repo must be public or shared with judges. README: what it is, how to run ([runbook.md](../plan/runbook.md)), program id `6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf`, what is stubbed. No secrets in history. |
| 5 | Demo video (≤ 3 min, **live product**) | founders (script: [demo-video-script.md](demo-video-script.md)) | record 2026-10-09, upload 2026-10-10 | Needs the devnet demo end to end (roadmap M4), the calibration plot in `ml/reports/`, and the MCP clip |
| 6 | Live product link + access instructions | founders | 2026-10-06 | Vercel URL (custom domain if ready, M5). Access text: "Devnet. Open `/h/stumari-demo`, choose **Test wallet**, click **Get 500 test USDC**, book, then cancel on the booking page. No install needed. Phantom users: switch to Testnet Mode → Solana Devnet." |
| 7 | Pitch video (≤ 2 min) | founders (script: [pitch-video-script.md](pitch-video-script.md)) | record 2026-10-10 | Traction numbers are filled from [leads.csv](../sales/leads.csv) on recording day. Nothing invented. |
| 8 | X (Twitter) profile | founders | 2026-10-03 | Project account. Pin a post with the demo video. |
| 9 | Teammate submission profile: **Vazovski** | Vazovski | 2026-10-06 | Name, country, Telegram |
| 10 | Teammate submission profile: **luka** | luka | 2026-10-06 | Name, country, Telegram |
| 11 | Accelerator decision | founders | 2026-10-08 | Currently **"Hackathon only"**. Decide whether to opt in to the accelerator before submitting. |

## Final check (on submission day)

- [ ] Live link opens in a private window and the demo wallet flow works on devnet.
- [ ] Both videos are public or unlisted and play without login; lengths ≤ 3:00 and ≤ 2:00.
- [ ] Every claim in the form and videos matches [offer.md](../sales/offer.md) and the "What we explicitly do NOT claim" list in [vision-and-positioning.md](../product/vision-and-positioning.md#what-we-explicitly-do-not-claim).
- [ ] No key material in the repo or its history. From the repo root in Git Bash (each command prints file paths, as `commit:path` for history, never the matched value):
  ```bash
  git ls-files | grep -E '(^|/)\.env' | grep -v '\.env\.example$'   # committed .env files: must print nothing
  git ls-files onchain/keys                                          # committed keypairs: must print nothing
  git log --all --name-only --format= | grep -E '(^|/)\.env|onchain/keys/' | grep -v '\.env\.example$' | sort -u   # same, anywhere in history
  git rev-list --all | xargs git grep -lE '^(LIBSQL_AUTH_TOKEN|TELEGRAM_BOT_TOKEN|AUTH_SECRET|CRON_SECRET|OPERATOR_SECRET_KEY|ADMIN_SECRET_KEY|AGENT_SECRET_KEY)=.+'   # filled secret env lines
  git rev-list --all | xargs git grep -liE 'helius-rpc\.com/\?api-key=[0-9a-f-]{8,}'   # RPC URLs with an API key
  git rev-list --all | xargs git grep -lE '\[ *([0-9]{1,3} *, *){63}[0-9]{1,3} *\]'   # 64-byte JSON keypair arrays: must print nothing
  git rev-list --all | xargs git grep -lE '(^|[^1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{86,88}([^1-9A-HJ-NP-Za-km-z]|$)'   # base58 64-byte strings
  ```
  Keypair arrays pretty-printed over several lines are not caught by the array regex, which is one more reason keypairs live only in gitignored `onchain/keys/`. The base58 command also matches signatures, which are 64 bytes too. On 2026-09-25 its only hits were `spec/vectors/quote.json` (a test quote signature). Open any other hit and confirm it is a signature, not a secret key. If a real key was ever committed, rotate it: rewriting history does not un-leak it.
- [ ] Both teammates are on the submission.
