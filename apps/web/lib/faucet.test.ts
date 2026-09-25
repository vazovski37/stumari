import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tempDb } from "@/test/db";
import { ApiError } from "./api/errors";
import type { Db } from "./db/client";
import { consumeFaucetBudget } from "./faucet";
import { FAUCET_DAILY_GLOBAL_LIMIT } from "./rate-limit";

let db: Db;
let close: () => void;
beforeEach(async () => {
  ({ db, close } = await tempDb());
});
afterEach(() => close());

const chainWith = (lamports: bigint) => ({
  rpc: { getBalance: vi.fn(() => ({ send: async () => ({ value: lamports }) })) } as never,
  operator: { address: `Operator${lamports}` } as never,
});
const code = (p: Promise<void>) => p.then(() => "OK", (e: unknown) => (e instanceof ApiError ? `${e.status} ${e.code}` : String(e)));

describe("demo faucet budget", () => {
  const t0 = 1_800_000_000;

  it("allows 200 mints per day across all wallets and IPs", async () => {
    const c = chainWith(1_000_000_000n);
    expect(FAUCET_DAILY_GLOBAL_LIMIT).toMatchObject({ limit: 200, windowSecs: 86_400 });
    for (let i = 0; i < 200; i++) expect(await code(consumeFaucetBudget(c, db, t0 + i))).toBe("OK");
    expect(await code(consumeFaucetBudget(c, db, t0 + 3600))).toBe("429 RATE_LIMITED");
    expect(await code(consumeFaucetBudget(c, db, t0 + 86_400))).toBe("OK");
  });

  it("refuses with 503 OPERATOR_LOW_BALANCE under 0.05 SOL, without spending the budget", async () => {
    expect(await code(consumeFaucetBudget(chainWith(49_999_999n), db, t0))).toBe("503 OPERATOR_LOW_BALANCE");
    const rows = await db.$client.execute("SELECT COUNT(*) AS n FROM rate_events");
    expect(Number(rows.rows[0]?.n)).toBe(0);
  });
});
