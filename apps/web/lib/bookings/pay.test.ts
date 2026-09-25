import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tempDb } from "@/test/db";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { PAY_DAILY_GLOBAL_LIMIT, PAY_DAILY_IP_LIMIT } from "../rate-limit";
import { consumeDemoPayBudget } from "./pay";

let db: Db;
let close: () => void;
beforeEach(async () => {
  ({ db, close } = await tempDb());
});
afterEach(() => close());

const chainWith = (demoMode: boolean, lamports = 1_000_000_000n) => {
  const getBalance = vi.fn(() => ({ send: async () => ({ value: lamports }) }));
  return {
    c: { env: { demoMode } as never, rpc: { getBalance } as never, operator: { address: `Operator${demoMode}${lamports}` } as never },
    getBalance,
  };
};
const code = (p: Promise<void>) => p.then(() => "OK", (e: unknown) => (e instanceof ApiError ? `${e.status} ${e.code}` : String(e)));
const events = async () => Number((await db.$client.execute("SELECT COUNT(*) AS n FROM rate_events")).rows[0]?.n);

describe("demo /pay build caps (operator SOL drain)", () => {
  const t0 = 1_800_000_000;

  it("allows 20 new builds per IP per day", async () => {
    const { c } = chainWith(true);
    expect(PAY_DAILY_IP_LIMIT).toMatchObject({ limit: 20, windowSecs: 86_400 });
    for (let i = 0; i < 20; i++) expect(await code(consumeDemoPayBudget(c, db, "ip-1", t0 + i))).toBe("OK");
    expect(await code(consumeDemoPayBudget(c, db, "ip-1", t0 + 3600))).toBe("429 RATE_LIMITED");
    expect(await code(consumeDemoPayBudget(c, db, "ip-2", t0 + 3600))).toBe("OK");
    expect(await code(consumeDemoPayBudget(c, db, "ip-1", t0 + 86_400))).toBe("OK");
  });

  it("allows 300 builds per day in all; a capped IP does not spend the global budget", async () => {
    const { c } = chainWith(true);
    expect(PAY_DAILY_GLOBAL_LIMIT).toMatchObject({ limit: 300, windowSecs: 86_400 });
    for (let i = 0; i < 20; i++) await consumeDemoPayBudget(c, db, "ip-heavy", t0);
    for (let i = 0; i < 50; i++) expect(await code(consumeDemoPayBudget(c, db, "ip-heavy", t0))).toBe("429 RATE_LIMITED");
    for (let i = 0; i < 280; i++) expect(await code(consumeDemoPayBudget(c, db, `ip-${i}`, t0))).toBe("OK");
    expect(await code(consumeDemoPayBudget(c, db, "ip-fresh", t0))).toBe("429 RATE_LIMITED");
  });

  it("refuses with 503 OPERATOR_LOW_BALANCE under 0.05 SOL, before spending any budget", async () => {
    const { c } = chainWith(true, 49_999_999n);
    expect(await code(consumeDemoPayBudget(c, db, "ip-1", t0))).toBe("503 OPERATOR_LOW_BALANCE");
    expect(await events()).toBe(0);
  });

  it("does nothing outside demo mode", async () => {
    const { c, getBalance } = chainWith(false, 0n);
    for (let i = 0; i < 25; i++) expect(await code(consumeDemoPayBudget(c, db, "ip-1", t0))).toBe("OK");
    expect(getBalance).not.toHaveBeenCalled();
    expect(await events()).toBe(0);
  });
});
