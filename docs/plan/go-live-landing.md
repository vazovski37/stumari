# Go live today: landing + apply form (before devnet)

The landing page (EN/KA/RU), `/apply`, `/privacy` and `/model` can go live on a public URL **now**, before the devnet operator wallet is funded. Applications land in a Turso database and ping a Telegram chat. The chain comes later without a new project: you add the chain variables and redeploy (step 9).

Written 2026-09-27 against Next.js 16.3.6 and the Vercel and Turso docs as of that date. The full-deploy reference is [runbook section 6](runbook.md#6-deploy-the-web-app-vercel--turso), and every variable is described in [configuration.md](../architecture/configuration.md).

**Rules:** the founders create every account and type every password themselves. Never paste a token into chat or commit it. Paste it into the Vercel or Turso dashboard, or into your own terminal. Stay on devnet: the landing deploy touches no chain at all.

## What works without the chain

Verified locally on 2026-09-27 with exactly the variables in step 4 (no `OPERATOR_SECRET_KEY`, no `STUMARI_MINT`, `STUMARI_DEMO_MODE=false`). The production build passed and `next start` answered as follows:

| Route | Result |
|---|---|
| `/`, `/ka`, `/ru`, `/apply`, `/ka/apply`, `/ru/apply`, `/privacy`, `/model`, `/sitemap.xml`, `/robots.txt` | 200 |
| `/en` → `/`, `/en/apply` → `/apply` | 308 redirect |
| `POST /api/applications` | 201 `{ id }`, row stored; 400 `VALIDATION_FAILED` on bad input |
| `/api/config/public` | 200, `mint: null`, `quote_signer: null` |
| `/h/*`, `/b/*`, `/my` | a "Checkout is not open yet" page with links to `/apply` and `/`. The guest header drops "My bookings" and the wallet button. |
| `/admin` | the Sign-In With Solana (SIWS) screen. `GET /api/auth/nonce` answered 200. |
| Anything that pays, quotes or cranks (`/api/quotes`, `/api/tx/send`, the faucet, cron, "register on-chain") | `503 CHAIN_NOT_CONFIGURED`, as designed |

The landing pages link only to `/apply`, `/model`, `/privacy` and the language switcher, so no visitor can click into a chain feature.

**Does `/admin` work without the chain? Yes.** SIWS only checks an ed25519 signature over a text message against `NEXT_PUBLIC_SITE_URL`'s host. It sends no transaction, needs no SOL and does not care which network your wallet is on. You need `ADMIN_WALLETS` set to your wallet address, and you must open the site on the exact host in `NEXT_PUBLIC_SITE_URL`. The Applications tab reads only the database. The Hotels tab can create drafts, but "register on-chain" answers 503 until step 9.

## Before you start: the Vercel plan

Vercel's fair-use rules limit **Hobby to non-commercial personal use**. They list "advertising the sale of a product or service" as commercial. A landing page that runs Facebook/Instagram ads for a business is commercial, so **use Vercel Pro before the ads start** (see vercel.com/pricing). Hobby is fine for building and checking the deploy today.

## Steps

### 1. Create the accounts (founders, about 5 min)

1. **Vercel:** https://vercel.com/signup. Sign up with GitHub or email. Pick Pro before running ads (see above).
2. **Turso:** https://app.turso.tech. Sign up with GitHub.
3. **Telegram:** you already have it (step 6).

The repository now has a GitHub remote (`vazovski37/stumari`, `main` pushed), so the GitHub import in step 5b is the easiest path. The CLI path in step 5 still works.

### 2. Create the Turso database and token (about 3 min)

1. In app.turso.tech, **Create Database**, name `stumari`, in a European region (Frankfurt `aws-eu-central-1` or Ireland `aws-eu-west-1`, whichever is offered).
2. Copy the database URL. It looks like `libsql://stumari-<org>.aws-eu-central-1.turso.io`.
3. On the database page, **Create Token** (read and write, no expiry or a long one). Copy it once and keep it in your password manager.

### 3. Run the migrations against Turso (your terminal, repo root, Git Bash)

```bash
cd /c/Users/User/Workspace/colosseum
LIBSQL_URL='libsql://stumari-<org>.<region>.turso.io' LIBSQL_AUTH_TOKEN='<paste token>' pnpm --filter web db:migrate
```

Expect `migrations applied to libsql://…`. Re-run it after every pull that adds a file under `apps/web/drizzle/`. It is idempotent.

**Before go-live, Turso must have every migration** in `apps/web/drizzle/` (six as of 2026-10-18). The command applies whatever is missing, so run it again whenever a pull adds a file there:

| File | Change |
|---|---|
| `0000_init.sql` | all tables |
| `0001_boring_princess_powerful.sql` | `hotels.confirm_mode` (`auto` / `manual`, for manual confirm mode) |
| `0002_application_intent.sql` | `applications.intent` (`pilot` / `demo`, set by the "Book a 15-minute demo" form) |
| `0003_mews_inventory.sql` | Mews inventory provider columns on hotels, room types and bookings |
| `0004_mews_customer_at.sql` | `bookings.mews_customer_at` |
| `0005_hotel_attributes.sql` | `hotels.description`, `neighborhood`, `amenities` |

Without `0002`, every submit on `/apply` answers 500.

Tip: start the line with a space so Git Bash does not save the token in history (needs `HISTCONTROL=ignorespace`). Or clear it afterwards with `history -c`.

### 4. The environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (step 5, item 4). Tick **Production** and **Preview**. Mark the secrets **Sensitive**.

| Variable | Example value | Where it comes from |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://stumari.vercel.app` | The production domain Vercel shows for the project (Settings → Domains). No trailing slash. It is baked in at build time, so **redeploy after changing it**. SIWS only works on this exact host. |
| `LIBSQL_URL` | `libsql://stumari-<org>.aws-eu-central-1.turso.io` | Turso, step 2. Never `file:` on Vercel: the env check refuses it. |
| `LIBSQL_AUTH_TOKEN` | `eyJhbGciOi…` (Sensitive) | Turso, step 2 |
| `AUTH_SECRET` | 64 hex characters (Sensitive) | `openssl rand -hex 32` in Git Bash. Signs session cookies and salts IP hashes. Keep it stable. |
| `ADMIN_WALLETS` | `7xKX…your Phantom address` | Your wallet's public address, comma-separated for both founders. Needed to open `/admin`. |
| `TELEGRAM_BOT_TOKEN` | `123456789:AA…` (Sensitive) | BotFather, step 6. Optional but recommended. |
| `TELEGRAM_CHAT_ID` | `-1001234567890` or `123456789` | Step 6 |
| `STUMARI_CLUSTER` | `devnet` | fixed |
| `STUMARI_PROGRAM_ID` | `6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf` | fixed ([ADR-0008](../decisions/README.md)) |
| `STUMARI_DEMO_MODE` | `false` | `true` only after step 9 |
| `NEXT_PUBLIC_META_PIXEL_ID` | `123456789012345` | Optional. The Meta Pixel (dataset) id from Events Manager, **digits only**; a malformed value fails the build. Unset means no cookie banner and no pixel. Set, the landing shows a consent banner and loads the pixel only after "Accept". It is inlined at build time, so **redeploy after setting or changing it**. First do step 6b. |

Leave these **unset** for now: `OPERATOR_SECRET_KEY`, `ADMIN_SECRET_KEY`, `STUMARI_MINT`, `SOLANA_RPC_URL`, `CRON_SECRET`, `AMOUNT_CAP_MINOR`. Other optional analytics variables are listed in `apps/web/.env.example`; none is needed for going live.

The build checks the environment. A missing `NEXT_PUBLIC_SITE_URL` stops `next.config.ts` on Vercel. A missing `AUTH_SECRET`, a missing `LIBSQL_AUTH_TOKEN`, or a `file:` database fails the build with `Invalid server environment: …`, naming the variable but never its value.

### 5. Create the Vercel project and deploy (CLI, from the repo root)

Run these in **your own terminal**. You log in; Claude never types credentials.

1. `npx vercel@latest login`: pick GitHub or email and confirm in the browser.
2. From the **repo root** (`C:\Users\User\Workspace\colosseum`), not `apps/web`: `npx vercel@latest link`
   - "Set up and link?" yes, pick your scope, "Link to existing project?" **no**, project name `stumari`.
   - "In which directory is your code located?" **`./apps/web`** (this becomes the project's Root Directory).
   - Next.js is detected. Do not modify the settings. If the CLI does not ask for the directory, set Root Directory in the dashboard (item 3).
   - This writes a `.vercel/` folder at the root. It is local only, and Vercel never uploads it.
3. In the dashboard, open **Project → Settings → Build and Deployment** and check:
   - **Root Directory** `apps/web`, with **"Include source files outside of the Root Directory in the Build Step"** enabled (the default for new projects). The build needs `packages/*` and `onchain/artifacts/program-id.txt`.
   - **Framework** Next.js. Build Command, Output Directory and Install Command stay on their defaults. Vercel runs `pnpm install` and `pnpm run build` (`next build`). pnpm finds the workspace root from `apps/web`, installs `@stumari/core` and `@stumari/escrow-client` from `packages/`, and Next transpiles them (`transpilePackages`). No separate package build is needed.
   - **Node.js Version** `24.x` (the current default).
   - Optional: **Settings → Functions → Function Region** `fra1` (Frankfurt), next to the Turso database.
4. Add the variables from step 4 (**Settings → Environment Variables**). Set `NEXT_PUBLIC_SITE_URL` to `https://<project-name>.vercel.app`. If step 7 shows a different production domain, fix the variable and redeploy.
5. Deploy from the repo root: `npx vercel@latest deploy --prod`.
   - The root `.vercelignore` limits the upload (and Git-connected builds too) to `apps/`, `packages/`, `scripts/`, the lockfile, the workspace files, `onchain/artifacts` (program id + IDL) and `ml/reports` (the `/model` page imports its JSON). A build that imports from a new top-level folder needs that folder re-included there. It never uploads `onchain/keys/`, `.env*`, local `*.db` files or `ml/`.
   - The build log should show pnpm 9 or 10 and Node 24. If install fails because of a pnpm version, add the variable `ENABLE_EXPERIMENTAL_COREPACK=1`, so Vercel uses `pnpm@9.12.0` from `packageManager`. Then redeploy.

**5b. Later, GitHub import instead of the CLI.** Create a GitHub repo and push `main` (your call: public or private). Then Vercel → Project → Settings → Git → connect it. Git deploys build from committed files only (and `.vercelignore` still applies), and every push to `main` deploys to production. Nothing else changes, and `vercel.json` is not needed. Every setting above lives in the dashboard.

### 6. Telegram alerts for new applications (about 3 min)

1. In Telegram, open **@BotFather**, send `/newbot`, pick a name ("Stumari leads") and a username ending in `bot`. BotFather replies with the token, which is `TELEGRAM_BOT_TOKEN`.
2. Choose where the alerts go:
   - Just you: open your bot and press **Start**.
   - Both founders: create a group, add the bot, and send any message in the group.
3. Get the chat id: open `https://api.telegram.org/bot<TOKEN>/getUpdates` in your browser and find `"chat":{"id":…}`. A group id is negative (e.g. `-1001234567890`). That number is `TELEGRAM_CHAT_ID`.
4. Put both into Vercel (step 4) and redeploy (`npx vercel@latest deploy --prod` or **Redeploy** in the dashboard).

### 6b. Meta Pixel (optional, only if you run Facebook/Instagram ads)

1. In Meta **Events Manager**, create the dataset/Pixel (the founders do this in their own Business portfolio; see [facebook-kit.md](../sales/facebook-kit.md#0-order-of-work)).
2. **Before** you set the variable: open the pixel's **Settings** and turn **OFF "Automatic advanced matching"**. The privacy page says the pixel never reads what visitors type into forms, and that is only true with automatic advanced matching off.
3. Put the id in `NEXT_PUBLIC_META_PIXEL_ID` (step 4) and **redeploy**.
4. Check: `/` shows the consent banner, the pixel loads only after "Accept", `/privacy` now describes the Meta Pixel, and a test application appears as **Lead** in Events Manager → **Test events**.

### 7. Verify (about 5 min)

1. Open `https://<your-domain>/`, `/ka`, `/ru`, `/apply`, `/privacy` and `/model`. All should load, with the language switcher working.
2. `https://<your-domain>/api/config/public` should show `"cluster":"devnet"` and `"mint":null`.
3. `https://<your-domain>/my` should show "Checkout is not open yet".
4. Submit a test application on `/apply` with the hotel name `TEST — delete me`. The success screen should appear, and Telegram should ping within seconds.
5. Open `/admin` **on the same host as `NEXT_PUBLIC_SITE_URL`** and connect the wallet listed in `ADMIN_WALLETS`. Phantom asks you to sign a message; this is not a transaction and costs nothing. The test application appears under **Applications**. Set its status to `rejected`, or delete the row in the Turso dashboard's SQL shell:
   `DELETE FROM applications WHERE hotel_name = 'TEST — delete me';`
6. Share only the **production domain**. The per-deployment URLs (`stumari-abc123-….vercel.app`) sit behind Vercel's login by default.

### 8. Custom domain (optional, founder buys it)

1. Buy the domain yourself (e.g. a `.ge` or `.com`). Buying it is your action.
2. Vercel → Settings → Domains → **Add** it, then set the DNS records Vercel shows at your registrar.
3. Change `NEXT_PUBLIC_SITE_URL` to `https://<domain>` and **redeploy**. Canonicals, the sitemap, og:url and the SIWS host all move with it.
4. A domain you own is also what Meta's domain verification in Business Manager expects before ads optimise for conversions. Buy one before you spend real money on ads.

### 9. Later: when the devnet operator is funded

1. Fund the operator and run the bootstrap against **Turso** ([runbook section 5](runbook.md#5-devnet-bootstrap)). Set `LIBSQL_URL`/`LIBSQL_AUTH_TOKEN` to the Turso values so the demo hotel `stumari-demo` is seeded into the production DB.
2. Add to Vercel: `STUMARI_MINT` (printed by the bootstrap), `OPERATOR_SECRET_KEY` (paste from `onchain/keys/operator-devnet.json` into the dashboard; never print it in a terminal), `SOLANA_RPC_URL` (Helius devnet URL), `CRON_SECRET` (`openssl rand -hex 32`), and `STUMARI_DEMO_MODE=true`.
3. **Redeploy.** Vercel applies variable changes only to new deployments, and `/my` is prerendered at build time. Guest pages switch from "coming soon" to checkout on that deploy.
4. Set up the external cron ([runbook section 7](runbook.md#7-external-cron-scheduler)) and run the full smoke test in [runbook section 6](runbook.md#6-deploy-the-web-app-vercel--turso), step 4.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Build: `NEXT_PUBLIC_SITE_URL is not set` | variable missing for this environment (Production vs Preview) | add it for both, redeploy |
| Build: `Invalid server environment: - AUTH_SECRET: …` (or `LIBSQL_URL`, `LIBSQL_AUTH_TOKEN`) | the build validates the env while prerendering | fix the named variable, redeploy |
| Build: `ERR_PNPM_OUTDATED_LOCKFILE` | a `package.json` changed without the lockfile | run `pnpm install` locally, commit `pnpm-lock.yaml`, redeploy |
| `/apply` answers 500 on submit | migrations not applied to Turso (often `0002_application_intent.sql`, the `applications.intent` column) | step 3, then retry (no redeploy needed) |
| No consent banner although the pixel id is set | the variable was added without a redeploy, or it is not digits only | fix it, redeploy |
| Sign-in on `/admin` fails | host in the browser ≠ `NEXT_PUBLIC_SITE_URL` (preview URL, `www.` vs bare) | open the configured host, or fix the variable and redeploy |
| "Admins only" after signing in | wallet not in `ADMIN_WALLETS` | add the address, redeploy |
| No Telegram message | bot never started in that chat, wrong chat id, or the variables were added without a redeploy | step 6 again, redeploy |
