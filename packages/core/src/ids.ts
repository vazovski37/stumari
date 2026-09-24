import { sha256 } from "@noble/hashes/sha2";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils";
import { CoreError } from "./errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX = /^(?:[0-9a-f]{2})*$/;
const BOOKING_DOMAIN = utf8ToBytes("stumari-booking-v1");

export function isUuid(s: string): boolean {
  return UUID.test(s.toLowerCase());
}

/** UUID string → 16 bytes: lowercase, dashes removed, parsed left to right (RFC 4122 order). */
export function uuidToBytes(uuid: string): Uint8Array {
  const lower = uuid.toLowerCase();
  if (!UUID.test(lower)) throw new CoreError("InvalidInput", `not a UUID: ${JSON.stringify(uuid)}`);
  return hexToBytes(lower.replaceAll("-", ""));
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Lowercase or uppercase hex, even length, no prefix. */
export function hexToBytes(hex: string): Uint8Array {
  const lower = hex.toLowerCase();
  if (!HEX.test(lower)) throw new CoreError("InvalidInput", `not a hex string: ${JSON.stringify(hex)}`);
  const out = new Uint8Array(lower.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(lower.slice(2 * i, 2 * i + 2), 16);
  return out;
}

/** ADR-0011: booking_id = sha256("stumari-booking-v1" ‖ utf8(quote.id))[0..16]. */
export function deriveBookingId(quoteId: string): Uint8Array {
  return sha256(concatBytes(BOOKING_DOMAIN, utf8ToBytes(quoteId))).slice(0, 16);
}

/** `bookings.id` / public URL form: 32 lowercase hex chars. */
export function bookingIdHex(quoteId: string): string {
  return bytesToHex(deriveBookingId(quoteId));
}

/** Random UUID v4 from 16 bytes (injectable for deterministic tests). */
export function uuidV4(random: Uint8Array = crypto.getRandomValues(new Uint8Array(16))): string {
  if (random.length !== 16) throw new CoreError("InvalidInput", "uuidV4 needs 16 random bytes");
  const b = Uint8Array.from(random);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = bytesToHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
