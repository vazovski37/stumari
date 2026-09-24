import { resolve } from "node:path";

export const REPO = resolve(import.meta.dirname, "../..");
export const WEB_DIR = resolve(REPO, "apps/web");
export const WEB_ENV = resolve(WEB_DIR, ".env.local");
export const WEB_ENV_EXAMPLE = resolve(WEB_DIR, ".env.example");
export const SCRIPTS_ENV = resolve(REPO, "scripts/.env");
export const KEYS_DIR = resolve(REPO, "onchain/keys");
export const PROGRAM_SO = resolve(REPO, "onchain/artifacts/stumari_escrow.so");
export const PROGRAM_ID_FILE = resolve(REPO, "onchain/artifacts/program-id.txt");
export const MODEL_JSON = resolve(REPO, "packages/core/model/model.json");
export const LOCALNET_SH = resolve(REPO, "scripts/localnet.sh");

/** A key file under onchain/keys (gitignored secrets). */
export const keyPath = (name: string) => resolve(KEYS_DIR, `${name}.json`);
