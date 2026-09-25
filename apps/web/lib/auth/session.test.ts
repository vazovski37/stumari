import { describe, expect, it } from "vitest";
import { decodeSession, encodeSession, SESSION_TTL_SECS, sessionCookie } from "./session";

const SECRET = "cd".repeat(32);
const NOW = 1_790_000_000;
const WALLET = "HUmeQqxXXNsXXZkXtXHWfJqmuWNsdDo81e92ER8Spxet";

describe("session cookie", () => {
  it("round-trips { wallet, iat, exp } for 7 days", () => {
    const token = encodeSession(WALLET, SECRET, NOW);
    expect(decodeSession(token, SECRET, NOW)).toEqual({ wallet: WALLET, iat: NOW, exp: NOW + SESSION_TTL_SECS });
    expect(decodeSession(token, SECRET, NOW + SESSION_TTL_SECS - 1)?.wallet).toBe(WALLET);
    expect(decodeSession(token, SECRET, NOW + SESSION_TTL_SECS)).toBeNull();
  });

  it("rejects a forged payload, another secret and garbage", () => {
    const token = encodeSession(WALLET, SECRET, NOW);
    const [, sig] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ wallet: "Attacker111", iat: NOW, exp: NOW + 10 })).toString("base64url")}.${sig}`;
    expect(decodeSession(forged, SECRET, NOW)).toBeNull();
    expect(decodeSession(token, "ef".repeat(32), NOW)).toBeNull();
    expect(decodeSession(`${token}.x`, SECRET, NOW)).toBeNull();
    expect(decodeSession("", SECRET, NOW)).toBeNull();
    expect(decodeSession(undefined, SECRET, NOW)).toBeNull();
  });

  it("sets httpOnly, SameSite=Lax, Secure only when asked, and clears with Max-Age=0", () => {
    expect(sessionCookie("t", false)).toBe(`stumari_session=t; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECS}`);
    expect(sessionCookie("t", true)).toContain("; Secure;");
    expect(sessionCookie(null, false)).toBe("stumari_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  });
});
