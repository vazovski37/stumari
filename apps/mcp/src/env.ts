import { getBase58Encoder } from "@solana/kit";
import { parseMinor } from "@stumari/core";

export interface McpEnv {
  /** Base URL of the Stumari web app, without a trailing slash. */
  apiUrl: string;
  /** 64-byte Solana keypair (seed ‖ public key) the server may sign with; devnet demo only. */
  agentSecretKey: Uint8Array | null;
  /** Largest amount (base units) the agent key will sign for. */
  maxAmountMinor: bigint;
}

export const DEFAULT_API_URL = "http://localhost:3000";
/** 500 USDC (configuration.md). */
export const DEFAULT_MAX_AMOUNT_MINOR = 500_000_000n;

export class EnvError extends Error {}

/**
 * Accepts base58 of the 64-byte secret (as Phantom exports) or a JSON byte array (as
 * `solana-keygen` writes). Errors never include the key material.
 */
export function parseSecretKey(raw: string): Uint8Array {
  const text = raw.trim();
  let bytes: Uint8Array;
  if (text.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new EnvError("AGENT_SECRET_KEY is not a valid JSON byte array");
    }
    if (!Array.isArray(parsed) || !parsed.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
      throw new EnvError("AGENT_SECRET_KEY JSON must be an array of bytes (0-255)");
    }
    bytes = Uint8Array.from(parsed as number[]);
  } else {
    try {
      bytes = Uint8Array.from(getBase58Encoder().encode(text));
    } catch {
      throw new EnvError("AGENT_SECRET_KEY is neither base58 nor a JSON byte array");
    }
  }
  if (bytes.length !== 64) throw new EnvError(`AGENT_SECRET_KEY must be 64 bytes, got ${bytes.length}`);
  return bytes;
}

export function loadEnv(env: NodeJS.ProcessEnv): McpEnv {
  const rawUrl = env.STUMARI_API_URL?.trim() || DEFAULT_API_URL;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new EnvError("STUMARI_API_URL is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EnvError("STUMARI_API_URL must be http(s)");
  }
  let maxAmountMinor = DEFAULT_MAX_AMOUNT_MINOR;
  const rawMax = env.AGENT_MAX_AMOUNT_MINOR?.trim();
  if (rawMax) {
    try {
      maxAmountMinor = parseMinor(rawMax);
    } catch {
      throw new EnvError("AGENT_MAX_AMOUNT_MINOR must be a decimal string of USDC base units");
    }
  }
  const rawKey = env.AGENT_SECRET_KEY?.trim();
  return {
    apiUrl: `${url.origin}${url.pathname.replace(/\/+$/, "")}`,
    agentSecretKey: rawKey ? parseSecretKey(rawKey) : null,
    maxAmountMinor,
  };
}
