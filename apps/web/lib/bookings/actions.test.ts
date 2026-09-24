import {
  appendTransactionMessageInstruction,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
} from "@solana/kit";
import { generated, type BookingView as ChainBooking } from "@stumari/escrow-client";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/errors";
import { assertActionAllowed, cancelMinRefund, type BookingAction } from "./actions";

describe("cancelMinRefund", () => {
  it("reads min_refund back from a built cancel transaction (cached repeats report the same refund)", async () => {
    const [operator, guest, ...accounts] = await Promise.all(Array.from({ length: 9 }, () => generateKeyPairSigner()));
    const a = accounts.map((k) => k.address);
    const ix = generated.getCancelBookingInstruction({
      guest: createNoopSigner(guest!.address),
      booking: a[0]!,
      config: a[1]!,
      mint: a[2]!,
      vault: a[3]!,
      guestTokenAccount: a[4]!,
      hotelTokenAccount: a[5]!,
      treasury: a[6]!,
      rentPayer: operator!.address,
      minRefund: 75_000_000n,
    });
    const tx = compileTransaction(
      pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(createNoopSigner(operator!.address as Address), m),
        (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi" as Blockhash, lastValidBlockHeight: 1n }, m),
        (m) => appendTransactionMessageInstruction(ix, m),
      ),
    );
    expect(cancelMinRefund(getBase64EncodedWireTransaction(tx))).toBe(75_000_000n);
  });
});

describe("guest action windows (escrow-program.md)", () => {
  const account = (status: ChainBooking["status"]) =>
    ({ status, checkinTs: 1_000n, releaseAfterTs: 1_120n, confirmDeadlineTs: 500n }) as ChainBooking;
  const reason = (action: BookingAction, status: ChainBooking["status"], now: bigint) => {
    try {
      assertActionAllowed(action, account(status), now);
      return "OK";
    } catch (e) {
      return `${(e as ApiError).code}:${(e as ApiError).extra?.body?.reason}`;
    }
  };

  it("cancel before check-in only, while pending or confirmed", () => {
    expect(reason("cancel", "confirmed", 999n)).toBe("OK");
    expect(reason("cancel", "pending", 999n)).toBe("OK");
    expect(reason("cancel", "confirmed", 1_000n)).toBe("NOT_ALLOWED:TOO_LATE");
    expect(reason("cancel", "cancelled", 10n)).toBe("NOT_ALLOWED:STATUS");
  });

  it("dispute only while confirmed, from check-in until release", () => {
    expect(reason("dispute", "confirmed", 999n)).toBe("NOT_ALLOWED:TOO_EARLY");
    expect(reason("dispute", "confirmed", 1_000n)).toBe("OK");
    expect(reason("dispute", "confirmed", 1_120n)).toBe("NOT_ALLOWED:TOO_LATE");
    expect(reason("dispute", "pending", 1_000n)).toBe("NOT_ALLOWED:STATUS");
  });

  it("void only a pending booking past its confirm deadline", () => {
    expect(reason("void", "pending", 499n)).toBe("NOT_ALLOWED:TOO_EARLY");
    expect(reason("void", "pending", 500n)).toBe("OK");
    expect(reason("void", "confirmed", 600n)).toBe("NOT_ALLOWED:STATUS");
  });
});
