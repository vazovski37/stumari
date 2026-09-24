import { bytesToHex } from "@stumari/core";

/** sha256 via WebCrypto (Node ≥ 20 and browsers), lowercase hex. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))));
}
