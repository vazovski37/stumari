import { randomBytes } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { and, eq, gte, lt } from "drizzle-orm";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { authNonces } from "../db/schema";

/** Sign-In With Solana (api.md "Auth"): a nonce is single-use and valid for 5 minutes. */
export const NONCE_TTL_SECS = 300;
/** Unused nonces older than this are deleted by the sync cron. */
export const NONCE_RETENTION_SECS = 86_400;

export function siwsMessage(host: string, wallet: string, nonce: string, issuedAt: number): string {
  const iso = new Date(issuedAt * 1000).toISOString();
  return `${host} wants you to sign in to Stumari\nWallet: ${wallet}\nNonce: ${nonce}\nIssued: ${iso}`;
}

const MESSAGE = /^(\S+) wants you to sign in to Stumari\nWallet: (\S+)\nNonce: ([0-9a-f]{32})\nIssued: (\S+)$/;

/** Host, wallet and nonce of a message in the exact SIWS format, or null. */
export function parseSiwsMessage(message: string): { host: string; wallet: string; nonce: string } | null {
  const m = MESSAGE.exec(message);
  return m ? { host: m[1]!, wallet: m[2]!, nonce: m[3]! } : null;
}

/** Stores a fresh nonce with the exact message the wallet must sign. */
export async function issueNonce(db: Db, input: { host: string; wallet: string; now: number }): Promise<{ nonce: string; message: string }> {
  const nonce = randomBytes(16).toString("hex");
  const message = siwsMessage(input.host, input.wallet, nonce, input.now);
  await db.insert(authNonces).values({ nonce, wallet: input.wallet, message, created_at: input.now, used: false });
  return { nonce, message };
}

const denied = (code: string, message: string) => new ApiError(401, code, message);

function signatureValid(wallet: string, message: string, signature: string): boolean {
  try {
    return ed25519.verify(base58.decode(signature), new TextEncoder().encode(message), base58.decode(wallet));
  } catch {
    return false;
  }
}

/**
 * Checks a signed sign-in message: exact SIWS format for this wallet, host == the site's host,
 * the message stored with its nonce, a valid Ed25519 signature, and the nonce unused and at most
 * 5 minutes old. Marks the nonce used in the same conditional write, so it cannot be replayed.
 */
export async function verifySignIn(
  db: Db,
  input: { wallet: string; message: string; signature: string; expectedHost: string; now: number },
): Promise<string> {
  const parsed = parseSiwsMessage(input.message);
  if (!parsed || parsed.wallet !== input.wallet) throw denied("INVALID_MESSAGE", "The sign-in message is malformed");
  if (parsed.host !== input.expectedHost) throw denied("HOST_MISMATCH", "The sign-in message is for another site");

  const row = await db.query.authNonces.findFirst({ where: eq(authNonces.nonce, parsed.nonce) });
  if (!row || row.message !== input.message || row.wallet !== input.wallet) {
    throw denied("INVALID_NONCE", "Unknown sign-in request; start again");
  }
  if (row.used) throw denied("NONCE_USED", "This sign-in request was already used; start again");
  if (input.now - row.created_at > NONCE_TTL_SECS) throw denied("NONCE_EXPIRED", "The sign-in request expired; start again");
  if (!signatureValid(input.wallet, input.message, input.signature)) {
    throw denied("INVALID_SIGNATURE", "The wallet signature does not match");
  }

  const consumed = await db
    .update(authNonces)
    .set({ used: true })
    .where(
      and(
        eq(authNonces.nonce, parsed.nonce),
        eq(authNonces.used, false),
        gte(authNonces.created_at, input.now - NONCE_TTL_SECS),
      ),
    );
  if (consumed.rowsAffected !== 1) throw denied("NONCE_USED", "This sign-in request was already used; start again");
  return input.wallet;
}

export async function pruneNonces(db: Db, now: number): Promise<number> {
  const result = await db.delete(authNonces).where(lt(authNonces.created_at, now - NONCE_RETENTION_SECS));
  return result.rowsAffected;
}
