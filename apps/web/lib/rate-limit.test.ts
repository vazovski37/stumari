import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./db/client";
import { rateEvents } from "./db/schema";
import { enforceRateLimits } from "./api/rate";
import {
  APPLY_LIMIT,
  consumeRateLimit,
  PAY_DAILY_IP_LIMIT,
  PAY_WALLET_LIMIT,
  payLimits,
  pruneRateEvents,
  TX_WALLET_LIMIT,
  txLimits,
} from "./rate-limit";

// A file database, because libsql transactions on ":memory:" open a fresh, empty connection.
const dir = mkdtempSync(join(tmpdir(), "stumari-rate-"));
let db: Db;

beforeAll(async () => {
  db = createDb(`file:${join(dir, "test.db")}`);
  await migrate(db, { migrationsFolder: "drizzle" });
});

afterAll(() => {
  db.$client.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows can keep the SQLite file locked until the native handle is collected; it is a temp dir.
  }
});

describe("consumeRateLimit", () => {
  const t0 = 1_800_000_000;

  it("allows 5 applications per key per 10 minutes, then refuses with a retry hint", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await consumeRateLimit(db, APPLY_LIMIT, "ip-a", t0 + i * 60)).toEqual({ ok: true });
    }
    // The oldest event (t0) leaves the window at t0 + 600.
    expect(await consumeRateLimit(db, APPLY_LIMIT, "ip-a", t0 + 300)).toEqual({ ok: false, retryAfterSecs: 300 });
    // Refusals are not recorded.
    const rows = await db.select().from(rateEvents);
    expect(rows.filter((r) => r.key === "ip-a")).toHaveLength(5);
  });

  it("counts keys and buckets independently", async () => {
    expect(await consumeRateLimit(db, APPLY_LIMIT, "ip-b", t0 + 300)).toEqual({ ok: true });
    expect(await consumeRateLimit(db, { ...APPLY_LIMIT, bucket: "faucet" }, "ip-a", t0 + 300)).toEqual({ ok: true });
  });

  it("slides the window: a slot frees up once the oldest event is older than the window", async () => {
    expect((await consumeRateLimit(db, APPLY_LIMIT, "ip-a", t0 + 599)).ok).toBe(false);
    expect(await consumeRateLimit(db, APPLY_LIMIT, "ip-a", t0 + 600)).toEqual({ ok: true });
    expect((await consumeRateLimit(db, APPLY_LIMIT, "ip-a", t0 + 601)).ok).toBe(false);
  });

  it("never lets concurrent requests exceed the limit", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => consumeRateLimit(db, APPLY_LIMIT, "ip-burst", t0)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
  });
});

describe("wallet-scoped limits (security: a stranger cannot spend a victim's budget)", () => {
  const t0 = 1_810_000_000;
  const victim = "VictimWa11et111111111111111111111111111111";
  const refusal = (p: Promise<void>) => p.then(() => "OK", (e: { code?: string }) => e.code);

  it("keys /pay and /tx wallet budgets per (IP, wallet)", async () => {
    for (const [limits, walletLimit] of [
      [payLimits, PAY_WALLET_LIMIT],
      [txLimits, TX_WALLET_LIMIT],
    ] as const) {
      // An attacker (one IP) names the victim's wallet until the wallet budget refuses…
      for (let i = 0; i < walletLimit.limit; i++) {
        expect(await refusal(enforceRateLimits(db, limits("ip-attacker", victim), "x", t0 + i))).toBe("OK");
      }
      expect(await refusal(enforceRateLimits(db, limits("ip-attacker", victim), "x", t0 + 100))).toBe("RATE_LIMITED");
      // …which leaves the victim's own requests from their IP untouched.
      expect(await refusal(enforceRateLimits(db, limits("ip-victim", victim), "x", t0 + 100))).toBe("OK");
    }
  });
});

describe("daily windows", () => {
  it("counts a 24 h window and keeps its events through the cron prune", async () => {
    const t0 = 1_820_000_000;
    for (let i = 0; i < PAY_DAILY_IP_LIMIT.limit; i++) {
      expect((await consumeRateLimit(db, PAY_DAILY_IP_LIMIT, "ip:daily", t0 + i * 3600)).ok).toBe(true);
    }
    await pruneRateEvents(db, t0 + 23 * 3600);
    expect(await consumeRateLimit(db, PAY_DAILY_IP_LIMIT, "ip:daily", t0 + 23 * 3600)).toEqual({ ok: false, retryAfterSecs: 3600 });
    expect((await consumeRateLimit(db, PAY_DAILY_IP_LIMIT, "ip:daily", t0 + 86_400)).ok).toBe(true);
  });
});
