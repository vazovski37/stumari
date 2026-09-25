import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { T0, tempDb } from "@/test/db";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { authNonces } from "../db/schema";
import { issueNonce, NONCE_TTL_SECS, parseSiwsMessage, pruneNonces, siwsMessage, verifySignIn } from "./siws";

const HOST = "localhost:3000";

function keypair() {
  const secret = ed25519.utils.randomPrivateKey();
  return { secret, wallet: base58.encode(ed25519.getPublicKey(secret)) };
}
const sign = (secret: Uint8Array, message: string) => base58.encode(ed25519.sign(new TextEncoder().encode(message), secret));

async function failure(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return `${e.status} ${e.code}`;
    throw e;
  }
  return "ok";
}

let db: Db;
let close: () => void;
beforeEach(async () => ({ db, close } = await tempDb()));
afterEach(() => close());

describe("SIWS message", () => {
  it("has the exact api.md format and parses back", () => {
    const m = siwsMessage(HOST, "Wa11et", "0123456789abcdef0123456789abcdef", T0);
    expect(m).toBe(
      `localhost:3000 wants you to sign in to Stumari\nWallet: Wa11et\nNonce: 0123456789abcdef0123456789abcdef\nIssued: ${new Date(T0 * 1000).toISOString()}`,
    );
    expect(parseSiwsMessage(m)).toEqual({ host: HOST, wallet: "Wa11et", nonce: "0123456789abcdef0123456789abcdef" });
    expect(parseSiwsMessage(`${m}\nextra`)).toBeNull();
  });
});

describe("verifySignIn", () => {
  it("accepts a fresh signed nonce once, then refuses the replay", async () => {
    const k = keypair();
    const { message, nonce } = await issueNonce(db, { host: HOST, wallet: k.wallet, now: T0 });
    const input = { wallet: k.wallet, message, signature: sign(k.secret, message), expectedHost: HOST, now: T0 + 10 };
    await expect(verifySignIn(db, input)).resolves.toBe(k.wallet);
    expect((await db.query.authNonces.findFirst({ where: eq(authNonces.nonce, nonce) }))?.used).toBe(true);
    expect(await failure(verifySignIn(db, input))).toBe("401 NONCE_USED");
  });

  it("lets only one of two concurrent verifications of the same nonce win", async () => {
    const k = keypair();
    const { message } = await issueNonce(db, { host: HOST, wallet: k.wallet, now: T0 });
    const input = { wallet: k.wallet, message, signature: sign(k.secret, message), expectedHost: HOST, now: T0 + 1 };
    const results = await Promise.all([failure(verifySignIn(db, input)), failure(verifySignIn(db, input))]);
    expect(results.sort()).toEqual(["401 NONCE_USED", "ok"]);
  });

  it("binds the message to the site's host", async () => {
    const k = keypair();
    // A nonce issued for another host (e.g. a phishing site proxying our API under its own name).
    const { message } = await issueNonce(db, { host: "evil.example", wallet: k.wallet, now: T0 });
    expect(await failure(verifySignIn(db, { wallet: k.wallet, message, signature: sign(k.secret, message), expectedHost: HOST, now: T0 }))).toBe(
      "401 HOST_MISMATCH",
    );
    // Rewriting the host in a stored message does not match the stored text.
    const forged = message.replace("evil.example", HOST);
    expect(await failure(verifySignIn(db, { wallet: k.wallet, message: forged, signature: sign(k.secret, forged), expectedHost: HOST, now: T0 }))).toBe(
      "401 INVALID_NONCE",
    );
  });

  it("expires nonces after 300 s", async () => {
    const k = keypair();
    const a = await issueNonce(db, { host: HOST, wallet: k.wallet, now: T0 });
    const atLimit = { wallet: k.wallet, message: a.message, signature: sign(k.secret, a.message), expectedHost: HOST, now: T0 + NONCE_TTL_SECS };
    await expect(verifySignIn(db, atLimit)).resolves.toBe(k.wallet);
    const b = await issueNonce(db, { host: HOST, wallet: k.wallet, now: T0 });
    const late = { wallet: k.wallet, message: b.message, signature: sign(k.secret, b.message), expectedHost: HOST, now: T0 + NONCE_TTL_SECS + 1 };
    expect(await failure(verifySignIn(db, late))).toBe("401 NONCE_EXPIRED");
  });

  it("refuses a signature by another key, an edited message and a wallet swap", async () => {
    const k = keypair();
    const other = keypair();
    const { message } = await issueNonce(db, { host: HOST, wallet: k.wallet, now: T0 });
    const base = { wallet: k.wallet, message, expectedHost: HOST, now: T0 };
    expect(await failure(verifySignIn(db, { ...base, signature: sign(other.secret, message) }))).toBe("401 INVALID_SIGNATURE");
    expect(await failure(verifySignIn(db, { ...base, signature: "not-base58!" }))).toBe("401 INVALID_SIGNATURE");
    const edited = message.replace(/Issued: .*/, "Issued: 2030-01-01T00:00:00.000Z");
    expect(await failure(verifySignIn(db, { ...base, message: edited, signature: sign(k.secret, edited) }))).toBe("401 INVALID_NONCE");
    expect(await failure(verifySignIn(db, { ...base, wallet: other.wallet, signature: sign(other.secret, message) }))).toBe("401 INVALID_MESSAGE");
    // None of the failures consumed the nonce.
    await expect(verifySignIn(db, { ...base, signature: sign(k.secret, message) })).resolves.toBe(k.wallet);
  });

  it("prunes nonces older than a day", async () => {
    const k = keypair();
    await issueNonce(db, { host: HOST, wallet: k.wallet, now: T0 });
    await issueNonce(db, { host: HOST, wallet: k.wallet, now: T0 + 86_400 });
    expect(await pruneNonces(db, T0 + 86_401)).toBe(1);
    expect(await db.$count(authNonces)).toBe(1);
  });
});
