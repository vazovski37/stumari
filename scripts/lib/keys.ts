/**
 * Keypairs from onchain/keys/*.json (solana-keygen format) or secret-key env vars.
 * Secret bytes never reach a log line: errors name the source, never the value.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  getAddressEncoder,
  getBase58Decoder,
  getBase58Encoder,
  type KeyPairSigner,
} from "@solana/kit";
import type { Env } from "./env";
import { keyPath, REPO } from "./paths";

export interface LoadedKey {
  signer: KeyPairSigner;
  /** 64 bytes: seed ‖ public key. */
  secretKey: Uint8Array;
}

/** Base58 of the 64-byte secret (Phantom export) or a JSON byte array (solana-keygen). */
export function parseSecretKey(raw: string, source: string): Uint8Array {
  const text = raw.trim();
  let bytes: Uint8Array;
  try {
    bytes = text.startsWith("[")
      ? Uint8Array.from(JSON.parse(text) as number[])
      : Uint8Array.from(getBase58Encoder().encode(text));
  } catch {
    throw new Error(`${source}: not a JSON byte array or base58 secret key`);
  }
  if (bytes.length !== 64) throw new Error(`${source}: secret key must be 64 bytes, got ${bytes.length}`);
  return bytes;
}

async function toLoaded(secretKey: Uint8Array, source: string): Promise<LoadedKey> {
  try {
    return { signer: await createKeyPairSignerFromBytes(secretKey), secretKey };
  } catch {
    throw new Error(`${source}: secret key is inconsistent (public half does not match the seed)`);
  }
}

export async function loadKeyFile(path: string): Promise<LoadedKey> {
  if (!existsSync(path)) throw new Error(`key file missing: ${path}`);
  return toLoaded(parseSecretKey(readFileSync(path, "utf8"), path), path);
}

/** OPERATOR_SECRET_KEY, else OPERATOR_KEYPAIR_PATH, else onchain/keys/operator-devnet.json. */
export async function loadOperator(env: Env): Promise<LoadedKey> {
  const secret = env["OPERATOR_SECRET_KEY"];
  if (secret) return toLoaded(parseSecretKey(secret, "OPERATOR_SECRET_KEY"), "OPERATOR_SECRET_KEY");
  const path = env["OPERATOR_KEYPAIR_PATH"];
  return loadKeyFile(path ? (isAbsolute(path) ? path : resolve(REPO, path)) : keyPath("operator-devnet"));
}

/** Loads onchain/keys/<name>.json, generating it (0600) when missing. */
export async function loadOrCreateKey(name: string): Promise<LoadedKey & { created: boolean }> {
  const path = keyPath(name);
  if (existsSync(path)) return { ...(await loadKeyFile(path)), created: false };
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
  const secretKey = new Uint8Array(64);
  secretKey.set(seed);
  secretKey.set(getAddressEncoder().encode(signer.address), 32);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(Array.from(secretKey)), { mode: 0o600 });
  return { signer, secretKey, created: true };
}

export const secretKeyBase58 = (secretKey: Uint8Array) => getBase58Decoder().decode(secretKey);
