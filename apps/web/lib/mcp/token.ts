import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Personal connector token for the remote MCP endpoint (ADR-0020): `v1.{wallet}.{exp}.{mac}`.
 * It is minted only for a signed-in wallet (Sign In With Solana) and lives in the connector URL the
 * guest pastes into their own AI app. It names the wallet the AI shops for; it never signs or
 * pays anything (money moves only on the website, with the wallet's own signature). Stateless:
 * revoke everything by rotating AUTH_SECRET; a token also expires by itself.
 */
export const CONNECTOR_TTL_SECS = 30 * 86_400;

const VERSION = "v1";
const WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const mac = (body: string, secret: string) =>
  createHmac("sha256", `${secret}:mcp-connector`).update(body).digest("base64url");

export function mintConnectorToken(wallet: string, secret: string, now: number, ttl = CONNECTOR_TTL_SECS): string {
  const body = `${VERSION}.${wallet}.${now + ttl}`;
  return `${body}.${mac(body, secret)}`;
}

/** The wallet a valid, unexpired token was minted for, or null. */
export function readConnectorToken(token: string, secret: string, now: number): string | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, wallet, exp, given] = parts as [string, string, string, string];
  if (version !== VERSION || !WALLET.test(wallet) || !/^\d{1,12}$/.test(exp)) return null;
  const expected = Buffer.from(mac(`${version}.${wallet}.${exp}`, secret));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return now < Number(exp) ? wallet : null;
}
