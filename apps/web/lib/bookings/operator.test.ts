import { describe, expect, it } from "vitest";
import { ApiError } from "../api/errors";
import { assertOperatorAllowed, type OperatorAction } from "./operator";

const booking = (status: string) => ({ status, confirmDeadlineTs: 1_000n, releaseAfterTs: 5_000n }) as Parameters<typeof assertOperatorAllowed>[1];

function reason(action: OperatorAction, status: string, now: bigint): string {
  try {
    assertOperatorAllowed(action, booking(status), now);
    return "ok";
  } catch (e) {
    if (e instanceof ApiError) return String(e.extra?.body?.reason);
    throw e;
  }
}

describe("operator actions follow the program's status machine (chain clock)", () => {
  it.each([
    ["confirm", "pending", 999n, "ok"],
    ["confirm", "pending", 1_000n, "TOO_LATE"],
    ["confirm", "confirmed", 10n, "STATUS"],
    ["void", "pending", 10n, "ok"],
    ["void", "pending", 9_999n, "ok"],
    ["void", "confirmed", 10n, "STATUS"],
    ["release", "confirmed", 4_999n, "TOO_EARLY"],
    ["release", "confirmed", 5_000n, "ok"],
    ["release", "disputed", 9_999n, "STATUS"],
    ["resolve", "disputed", 10n, "ok"],
    ["resolve", "confirmed", 10n, "STATUS"],
  ] as const)("%s a %s booking at t=%s → %s", (action, status, now, expected) => {
    expect(reason(action, status, now)).toBe(expected);
  });
});
