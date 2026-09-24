import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { describe, expect, it } from "vitest";
import { DEFAULT_AMOUNT_CAP_MINOR, DEFAULT_PROGRAM_ID, EnvError, parseServerEnv } from "./env-schema";
import { publicConfig } from "./public-config";

function keypair(seedByte: number) {
  const seed = new Uint8Array(32).fill(seedByte);
  const publicKey = ed25519.getPublicKey(seed);
  const secret = new Uint8Array(64);
  secret.set(seed);
  secret.set(publicKey, 32);
  return { secret, publicKey: base58.encode(publicKey) };
}

function envError(source: Record<string, string>): string {
  try {
    parseServerEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvError);
    return (error as Error).message;
  }
  throw new Error("expected parseServerEnv to throw");
}

describe("parseServerEnv", () => {
  it("has safe development defaults with an empty environment", () => {
    const env = parseServerEnv({});
    expect(env).toMatchObject({
      nodeEnv: "development",
      cluster: "devnet",
      rpcUrl: "https://api.devnet.solana.com",
      programId: DEFAULT_PROGRAM_ID,
      mint: null,
      operator: null,
      admin: null,
      adminWallets: [],
      cronSecret: null,
      libsqlUrl: "file:./.data/stumari.db",
      demoMode: false,
      siteUrl: "http://localhost:3000",
      amountCapMinor: DEFAULT_AMOUNT_CAP_MINOR,
      telegram: null,
    });
    expect(env.authSecret.length).toBeGreaterThanOrEqual(32);
  });

  it("accepts OPERATOR_SECRET_KEY as base58 of 64 bytes (Phantom export)", () => {
    const { secret, publicKey } = keypair(7);
    const env = parseServerEnv({ OPERATOR_SECRET_KEY: base58.encode(secret) });
    expect(env.operator?.publicKey).toBe(publicKey);
    expect(env.operator?.secretKey).toEqual(secret);
    expect(env.admin?.publicKey).toBe(publicKey);
  });

  it("accepts OPERATOR_SECRET_KEY as a JSON byte array (solana-keygen file)", () => {
    const { secret, publicKey } = keypair(9);
    const env = parseServerEnv({ OPERATOR_SECRET_KEY: ` ${JSON.stringify([...secret])}\n` });
    expect(env.operator?.publicKey).toBe(publicKey);
  });

  it("keeps a separate ADMIN_SECRET_KEY when given", () => {
    const operator = keypair(1);
    const admin = keypair(2);
    const env = parseServerEnv({
      OPERATOR_SECRET_KEY: base58.encode(operator.secret),
      ADMIN_SECRET_KEY: JSON.stringify([...admin.secret]),
    });
    expect(env.operator?.publicKey).toBe(operator.publicKey);
    expect(env.admin?.publicKey).toBe(admin.publicKey);
  });

  it("rejects malformed or inconsistent secret keys without echoing them", () => {
    const { secret } = keypair(3);
    const tampered = secret.slice();
    tampered[40] = (tampered[40] ?? 0) ^ 1;
    const cases = [
      base58.encode(secret.slice(0, 32)),
      JSON.stringify([...secret.slice(0, 63)]),
      JSON.stringify([...secret.slice(0, 63), 256]),
      "[1,2,",
      "0OIl-not-base58",
      base58.encode(tampered),
    ];
    for (const value of cases) {
      const message = envError({ OPERATOR_SECRET_KEY: value });
      expect(message).toContain("OPERATOR_SECRET_KEY");
      expect(message).not.toContain(value);
    }
  });

  it("validates addresses, lists and numbers", () => {
    expect(envError({ STUMARI_MINT: "not-an-address" })).toContain("STUMARI_MINT");
    expect(envError({ ADMIN_WALLETS: `${DEFAULT_PROGRAM_ID},nope` })).toContain("ADMIN_WALLETS");
    expect(envError({ AMOUNT_CAP_MINOR: "1500.5" })).toContain("AMOUNT_CAP_MINOR");
    expect(envError({ STUMARI_CLUSTER: "testnet" })).toContain("STUMARI_CLUSTER");
    expect(envError({ AUTH_SECRET: "short" })).toContain("AUTH_SECRET");
    expect(envError({ AUTH_SECRET: "z".repeat(64) })).toContain("AUTH_SECRET");
    expect(envError({ AUTH_SECRET: "ab".repeat(31) })).toContain("AUTH_SECRET");

    const env = parseServerEnv({
      ADMIN_WALLETS: ` ${DEFAULT_PROGRAM_ID} , `,
      AMOUNT_CAP_MINOR: "200000000",
      STUMARI_CLUSTER: "localnet",
    });
    expect(env.adminWallets).toEqual([DEFAULT_PROGRAM_ID]);
    expect(env.amountCapMinor).toBe(200_000_000n);
    expect(env.rpcUrl).toBe("http://127.0.0.1:8899");
  });

  it("forces demo mode off on mainnet", () => {
    expect(parseServerEnv({ STUMARI_DEMO_MODE: "true" }).demoMode).toBe(true);
    expect(parseServerEnv({ STUMARI_DEMO_MODE: "true", STUMARI_CLUSTER: "mainnet-beta" }).demoMode).toBe(false);
  });

  it("requires real secrets in production and a remote database on Vercel", () => {
    const message = envError({ NODE_ENV: "production" });
    expect(message).toContain("AUTH_SECRET");
    expect(message).toContain("NEXT_PUBLIC_SITE_URL");
    expect(envError({ VERCEL: "1", LIBSQL_URL: "file:./.data/stumari.db" })).toContain("LIBSQL_URL");
    expect(
      envError({
        NODE_ENV: "production",
        AUTH_SECRET: "a".repeat(64),
        NEXT_PUBLIC_SITE_URL: "https://stumari.example",
        LIBSQL_URL: "libsql://stumari.turso.io",
      }),
    ).toContain("LIBSQL_AUTH_TOKEN");
    expect(
      parseServerEnv({
        NODE_ENV: "production",
        AUTH_SECRET: "a".repeat(64),
        NEXT_PUBLIC_SITE_URL: "https://stumari.example/",
        VERCEL: "1",
        LIBSQL_URL: "libsql://stumari.turso.io",
        LIBSQL_AUTH_TOKEN: "token",
      }).siteUrl,
    ).toBe("https://stumari.example");
  });

  it("enables Telegram only when both token and chat id are set", () => {
    expect(parseServerEnv({ TELEGRAM_BOT_TOKEN: "t" }).telegram).toBeNull();
    expect(parseServerEnv({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "42" }).telegram).toEqual({
      botToken: "t",
      chatId: "42",
    });
  });
});

describe("publicConfig", () => {
  it("exposes the quote signer public key and pilot terms, never secrets", () => {
    const { secret, publicKey } = keypair(5);
    const config = publicConfig(
      parseServerEnv({ OPERATOR_SECRET_KEY: base58.encode(secret), STUMARI_DEMO_MODE: "1", AUTH_SECRET: "5e".repeat(32) }),
    );
    expect(config).toEqual({
      cluster: "devnet",
      program_id: DEFAULT_PROGRAM_ID,
      mint: null,
      quote_signer: publicKey,
      demo_mode: true,
      pilot_offer: { fee_bps: 0, payout_delay_hours: 24, amount_cap_minor: "1500000000", currency: "USDC" },
    });
    const text = JSON.stringify(config);
    expect(text).not.toContain(base58.encode(secret));
    expect(text).not.toContain("5e".repeat(32));
  });

  it("reports no quote signer until the operator key is configured", () => {
    expect(publicConfig(parseServerEnv({})).quote_signer).toBeNull();
  });
});

describe("publicConfig with the on-chain Config", () => {
  it("reads fee and payout delay from the Config when available", () => {
    const config = publicConfig(parseServerEnv({}), { feeBps: 150, releaseDelaySecs: 120 });
    expect(config.pilot_offer.fee_bps).toBe(150);
    expect(config.pilot_offer.payout_delay_hours).toBeCloseTo(120 / 3600, 4);
  });
});
