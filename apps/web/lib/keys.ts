import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";

export type ParsedSecretKey = {
  /** 64 bytes: 32-byte seed followed by the 32-byte public key (Solana keypair layout). */
  secretKey: Uint8Array;
  /** Base58 public key. */
  publicKey: string;
};

/**
 * Parses a Solana secret key given either as base58 of the 64 bytes (as Phantom
 * exports it) or as a JSON byte array (as solana-keygen writes it).
 * Error messages never include the input.
 */
export function parseSecretKey(raw: string): ParsedSecretKey {
  const text = raw.trim();
  const bytes = text.startsWith("[") ? parseJsonBytes(text) : parseBase58(text);
  if (bytes.length !== 64) {
    throw new Error(`secret key must be 64 bytes, got ${bytes.length}`);
  }
  const derived = ed25519.getPublicKey(bytes.subarray(0, 32));
  if (!equalBytes(derived, bytes.subarray(32))) {
    throw new Error("secret key is inconsistent: its last 32 bytes are not the public key of its seed");
  }
  return { secretKey: bytes, publicKey: base58.encode(derived) };
}

/** True when the value is a base58 string that decodes to 32 bytes (a Solana address). */
export function isBase58Address(value: string): boolean {
  try {
    return base58.decode(value).length === 32;
  } catch {
    return false;
  }
}

function parseJsonBytes(text: string): Uint8Array {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("secret key JSON is malformed");
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((b) => Number.isInteger(b) && (b as number) >= 0 && (b as number) <= 255)
  ) {
    throw new Error("secret key JSON must be an array of bytes (0-255)");
  }
  return Uint8Array.from(parsed as number[]);
}

function parseBase58(text: string): Uint8Array {
  try {
    return base58.decode(text);
  } catch {
    throw new Error("secret key is neither a JSON byte array nor valid base58");
  }
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
