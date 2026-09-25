import { describe, expect, it } from "vitest";
import { refundDroppedTo } from "./cancel-guard";

describe("cancel refund guard", () => {
  it("stops the cancel when the built min_refund is below what the guest confirmed", () => {
    expect(refundDroppedTo("150000000", "75000000")).toBe("75000000");
    expect(refundDroppedTo("75000000", "0")).toBe("0");
  });

  it("lets the cancel through when the transaction guarantees at least the shown refund", () => {
    expect(refundDroppedTo("75000000", "75000000")).toBeNull();
    expect(refundDroppedTo("75000000", "150000000")).toBeNull();
    expect(refundDroppedTo(null, "0")).toBeNull();
    expect(refundDroppedTo("75000000", undefined)).toBeNull();
  });
});
