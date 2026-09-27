#!/usr/bin/env bash
# Builds apps/web as a self-contained Linux bundle for Azure App Service (docs/plan/deploy-azure.md).
# Run inside WSL (the database driver ships Linux binaries):
#   MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/Users/User/Workspace/colosseum/scripts/azure/build-web.sh https://stumari.azurewebsites.net
# Output: dist/azure/web.zip in the repo (gitignored), ready for `az webapp deploy --type zip`.
set -euo pipefail

SITE_URL="${1:?usage: build-web.sh <site url, e.g. https://stumari.azurewebsites.net>}"
REPO="/mnt/c/Users/User/Workspace/colosseum"
WORK="$HOME/stumari-web-build"
OUT="$REPO/dist/azure"

# Node 24 from nvm when present (non-interactive shells skip .bashrc).
NVM_NODE="$(ls -d "$HOME"/.nvm/versions/node/v24* 2>/dev/null | tail -1 || true)"
[ -n "$NVM_NODE" ] && export PATH="$NVM_NODE/bin:$PATH"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

echo "== copy sources to $WORK"
mkdir -p "$WORK"
(cd "$REPO" && tar cf - \
  --exclude=./node_modules --exclude='*/node_modules' --exclude='*/.next' --exclude=./dist \
  --exclude=./onchain/target --exclude=./onchain/keys --exclude='*/.data' \
  --exclude=./.localnet --exclude=./.git --exclude='*.db' --exclude='.env*' \
  package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json apps/web packages onchain/artifacts ml/reports) \
  | (cd "$WORK" && tar xmf -)

cd "$WORK"
echo "== install (web, its workspace packages, and mews-client, which web imports by path)"
corepack pnpm install --frozen-lockfile --filter "web..." --filter "@stumari/mews-client" > "$WORK/install.log" 2>&1 || { tail -30 "$WORK/install.log"; exit 1; }

echo "== build (standalone)"
# Build-time values only: pages are prerendered with the public site URL; the real secrets are app settings.
NEXT_OUTPUT=standalone NODE_ENV=production NEXT_PUBLIC_SITE_URL="$SITE_URL" \
  AUTH_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  LIBSQL_URL="file:/tmp/stumari-build.db" STUMARI_CLUSTER=devnet STUMARI_DEMO_MODE=false \
  corepack pnpm --filter web build > "$WORK/build.log" 2>&1 || { tail -40 "$WORK/build.log"; exit 1; }

echo "== assemble bundle"
BUNDLE="$WORK/bundle"
rm -rf "$BUNDLE" && mkdir -p "$BUNDLE"
# -L: dereference pnpm symlinks; zip deploys do not reliably keep symlinks.
cp -rL apps/web/.next/standalone/. "$BUNDLE/"
# Next links external packages (e.g. .next/node_modules/@libsql/client-<hash>) into pnpm's store; once
# dereferenced, their dependencies only resolve if every package also sits in a plain top-level
# node_modules. pnpm keeps a hoisted copy of all of them in .pnpm/node_modules: lift it up.
cp -r --update=none "$BUNDLE/node_modules/.pnpm/node_modules/." "$BUNDLE/node_modules/"
mkdir -p "$BUNDLE/apps/web/.next"
cp -r apps/web/.next/static "$BUNDLE/apps/web/.next/static"
[ -d apps/web/public ] && cp -r apps/web/public "$BUNDLE/apps/web/public"
cp -r apps/web/drizzle "$BUNDLE/apps/web/drizzle"
# Migrations run at startup: bundle the repo's migrate script (drizzle inlined; the libsql driver comes from the bundle).
ESBUILD="$(ls -d node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild | tail -1)"
"$ESBUILD" apps/web/lib/db/migrate.ts --bundle --platform=node --format=esm --target=node24 \
  --external:@libsql/client --external:libsql --outfile="$BUNDLE/apps/web/migrate.mjs" --log-level=warning

echo "== zip"
mkdir -p "$OUT"
rm -f "$OUT/web.zip"
python3 -c "import shutil,sys; shutil.make_archive(sys.argv[1], 'zip', sys.argv[2])" "$OUT/web" "$BUNDLE"
du -sh "$BUNDLE" "$OUT/web.zip"
echo "done: $OUT/web.zip"
