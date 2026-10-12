# Deploy the landing + forms on Azure App Service

**Live since 2026-09-28:** https://stumari.azurewebsites.net

This is a landing-only deployment: the landing page (EN/KA/RU), the pilot and demo forms, `/privacy`, `/model` and `/ads`. Guest checkout shows "Checkout is not open yet" until the devnet chain settings are added ([go-live-landing.md](go-live-landing.md) "When devnet is funded"). The Vercel path in go-live-landing.md still works; this page is the Azure alternative actually in use.

## What exists

| Resource | Value |
|---|---|
| Subscription | Azure subscription 1 (the founders' account) |
| Resource group | `stumari-rg`. Its own group, so the founders' other projects (baasi, hellohost) are untouched |
| App Service plan | `stumari-plan`, Linux, **F1 (free)**, Germany West Central. West Europe was not accepting new customers |
| Web app | `stumari`, runtime `NODE:24-lts`, startup command `cd /home/site/wwwroot/apps/web && node migrate.mjs && node server.js` |
| Database | SQLite file `/home/data/stumari.db` on the app's persistent `/home` storage. Migrations run at every start (`migrate.mjs`, idempotent) |

App settings (names only; values live in Azure): `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `NEXT_PUBLIC_SITE_URL`, `AUTH_SECRET` (32 random bytes, generated at deploy time and never printed), `LIBSQL_URL=file:/home/data/stumari.db`, `STUMARI_CLUSTER=devnet`, `STUMARI_DEMO_MODE=false`, `STUMARI_PROGRAM_ID`.

## Redeploy after a change

From the repo root in Git Bash:

```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/Users/User/Workspace/colosseum/scripts/azure/build-web.sh https://stumari.azurewebsites.net
az webapp deploy --resource-group stumari-rg --name stumari --src-path dist/azure/web.zip --type zip --restart true
```

`build-web.sh` builds in WSL, because the libsql driver needs its Linux binary. It makes a clean copy of the sources, runs `pnpm install --frozen-lockfile`, and then `next build` with `NEXT_OUTPUT=standalone` (opt-in in `next.config.ts`). It dereferences pnpm's symlinks and lifts the hoisted packages to a plain top-level `node_modules`, since zip deploys don't keep symlinks. Then it bundles the migrate script with esbuild and zips the result into `dist/azure/web.zip` (gitignored; about 100 MB, about 280 MB unpacked). `NEXT_PUBLIC_SITE_URL` is baked in at build time, so pass the real site URL: if the domain changes, rebuild.

Three quirks seen on the 2026-10-12 redeploy:
- `az webapp deploy` can end with "Kudu Status : 400" even though the deploy went through. Check with `az webapp log deployment show -g stumari-rg -n stumari`: the last entry should say "Deployment successful". Then load the site.
- SCM basic auth is off for this app, so Kudu (`https://stumari.scm.azurewebsites.net`, for example `/api/vfs/data/stumari.db` to copy the database) rejects publishing credentials with 401. Send an Entra token instead: `curl -H "Authorization: Bearer $(az account get-access-token --resource https://management.azure.com --query accessToken -o tsv)" …`.
- If `build-web.sh` stops with "Another next build process is already running" and no build is running, run it again. The second run on 2026-10-12 built cleanly.

## Turn on the remaining pieces

Run these yourself in PowerShell or Git Bash; values you type there never pass through Claude.

- **See applications in `/admin`:** `ADMIN_WALLETS` = your Phantom address (public). Sign in with that wallet at `/admin`.
  ```bash
  az webapp config appsettings set -g stumari-rg -n stumari --settings ADMIN_WALLETS=<your Phantom address> --output none
  ```
- **Telegram alert per application:** create a bot with @BotFather, then:
  ```bash
  az webapp config appsettings set -g stumari-rg -n stumari --settings TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat id> --output none
  ```
- **Meta Pixel** (first turn off "Automatic advanced matching" in Events Manager). This is a build-time variable, so rebuild and redeploy after setting it:
  ```bash
  az webapp config appsettings set -g stumari-rg -n stumari --settings NEXT_PUBLIC_META_PIXEL_ID=<digits> --output none
  ```
  Then add `NEXT_PUBLIC_META_PIXEL_ID=<digits>` in front of the build command above.

Settings changes restart the app automatically.

## Before running ads: upgrade from F1

F1 is free but limited:
- 60 CPU minutes per day;
- no "Always On", so the first visit after about 20 idle minutes starts cold and takes several seconds;
- 1 GB of storage.

For paid traffic, move to **B1** (about 13 USD/month, billed to the subscription):

```bash
az appservice plan update --name stumari-plan --resource-group stumari-rg --sku B1
az webapp config set -g stumari-rg -n stumari --always-on true --output none
```

## Custom domain (optional)

Buy the domain yourself. Then:
1. Add it under Web app → Custom domains (CNAME to `stumari.azurewebsites.net`) with a free App Service managed certificate. Managed certificates need B1 or higher.
2. Set `NEXT_PUBLIC_SITE_URL` to the new URL.
3. Rebuild with that URL and redeploy.

## Data and limits

- The SQLite file lives on `/home`, which is Azure Storage and survives restarts and redeploys. It is fine for one instance at pilot volume. Do not scale out to several instances with it; switch to Turso (`LIBSQL_URL=libsql://…` + `LIBSQL_AUTH_TOKEN`) first.
- F1 has no backups. Copy the file through Kudu (`https://stumari.scm.azurewebsites.net`) if it matters.
- A labelled test application ("DEPLOY TEST - delete me") was submitted on 2026-09-28 to prove the database write path. Reject or delete it in `/admin`.
