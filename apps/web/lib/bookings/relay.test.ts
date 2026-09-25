import {
  appendTransactionMessageInstruction,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getTransactionEncoder,
  partiallySignTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type KeyPairSigner,
  type ReadonlyUint8Array,
  type SignatureBytes,
  type Transaction,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { decodeWireTx, generated, STUMARI_ESCROW_PROGRAM_ADDRESS } from "@stumari/escrow-client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { T0, tempDb } from "@/test/db";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { saveBuiltTx } from "./built-txs";
import { checkRelayable, fieldOfTransaction } from "./relay";

// No RPC: messages carry a fixed blockhash; only the allow-list and signature checks run.
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111" as Address;
/** SetComputeUnitPrice(5 micro-lamports): what some wallets append. */
const priorityFee = { programAddress: COMPUTE_BUDGET, data: new Uint8Array([3, 5, 0, 0, 0, 0, 0, 0, 0]) };
const lifetime = { blockhash: "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi" as Blockhash, lastValidBlockHeight: 1_000n };

let operator: KeyPairSigner;
let guest: KeyPairSigner;
let stranger: KeyPairSigner;
let db: Db;
let close: () => void;

beforeAll(async () => {
  [operator, guest, stranger] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner(), generateKeyPairSigner()]);
});
beforeEach(async () => {
  ({ db, close } = await tempDb());
});
afterEach(() => close());

/** A server-built transaction: operator = fee payer (signed), the guest's signature still missing. */
async function serverBuilt(feePayer: KeyPairSigner = operator) {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) =>
      appendTransactionMessageInstruction(
        getTransferSolInstruction({ source: createNoopSigner(guest.address), destination: stranger.address, amount: 1n }),
        m,
      ),
  );
  return partiallySignTransactionMessageWithSigners(message);
}

async function allowList(tx: Transaction) {
  const decoded = await decodeWireTx(getBase64EncodedWireTransaction(tx));
  await saveBuiltTx(db, {
    bookingId: "ab".repeat(16),
    quoteId: null,
    action: "create",
    built: {
      txBase64: getBase64EncodedWireTransaction(tx),
      messageBytes: decoded.messageBytes,
      messageHashHex: decoded.messageHashHex,
      lastValidBlockHeight: lifetime.lastValidBlockHeight,
      requiredSigner: guest.address,
    },
    now: T0,
  });
}

const wire = (tx: Transaction) => getBase64EncodedWireTransaction(tx);

async function rejection(tx: string, now = T0 + 10): Promise<string> {
  try {
    await checkRelayable(db, operator.address, tx, now);
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return (e as ApiError).code;
  }
  throw new Error("expected a rejection");
}

describe("POST /api/tx/send allow-list", () => {
  it("relays a transaction we built once the wallet signed it", async () => {
    const built = await serverBuilt();
    await allowList(built);
    const signed = await partiallySignTransaction([guest.keyPair], built);
    const { row, decoded } = await checkRelayable(db, operator.address, wire(signed), T0 + 10);
    expect(row.action).toBe("create");
    expect(decoded.feePayer).toBe(operator.address);
  });

  it("rejects a transaction whose fee payer is not the operator", async () => {
    const foreign = await partiallySignTransaction([guest.keyPair], await serverBuilt(stranger));
    expect(await rejection(wire(foreign))).toBe("FOREIGN_TX");
  });

  it("rejects an operator-paid message that we never built (or that expired)", async () => {
    const unknown = await partiallySignTransaction([guest.keyPair], await serverBuilt());
    expect(await rejection(wire(unknown))).toBe("FOREIGN_TX");
    const built = await serverBuilt();
    await allowList(built);
    const signed = await partiallySignTransaction([guest.keyPair], built);
    expect(await rejection(wire(signed), T0 + 10_000)).toBe("FOREIGN_TX");
  });

  it("flags a wallet that changed the message after we signed it (e.g. added a priority fee)", async () => {
    const built = await serverBuilt();
    await allowList(built);
    // What such a wallet returns: its own message, our old operator signature, its fresh signature.
    const modified = compileTransaction(
      pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(createNoopSigner(operator.address as Address), m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
        (m) =>
          appendTransactionMessageInstruction(
            getTransferSolInstruction({ source: createNoopSigner(guest.address), destination: stranger.address, amount: 1n }),
            m,
          ),
        (m) => appendTransactionMessageInstruction(priorityFee, m),
      ),
    );
    const guestSigned = await partiallySignTransaction([guest.keyPair], modified);
    const tampered: Transaction = {
      ...guestSigned,
      signatures: { ...guestSigned.signatures, [operator.address]: built.signatures[operator.address] as SignatureBytes },
    };
    expect(await rejection(Buffer.from(getTransactionEncoder().encode(tampered)).toString("base64"))).toBe("WALLET_MODIFIED_TX");
  });

  it("rejects a known message with a missing or forged signature", async () => {
    const built = await serverBuilt();
    await allowList(built);
    expect(await rejection(wire(built))).toBe("WALLET_MODIFIED_TX");
    // The guest's real signature, but over a different message.
    const other = await partiallySignTransaction([guest.keyPair], await serverBuilt(stranger));
    const wrongGuest: Transaction = {
      ...built,
      signatures: { ...built.signatures, [guest.address]: other.signatures[guest.address] as SignatureBytes },
    };
    expect(await rejection(Buffer.from(getTransactionEncoder().encode(wrongGuest)).toString("base64"))).toBe("WALLET_MODIFIED_TX");
  });

  it("rejects bytes that are not a transaction", async () => {
    expect(await rejection("aGVsbG8=")).toBe("INVALID_TX");
  });
});

describe("POST /api/bookings/{id}/submitted: which column a landed transaction fills", () => {
  const PROGRAM = STUMARI_ESCROW_PROGRAM_ADDRESS as string;
  const PDA = "Bk1ngPda111111111111111111111111111111111111";
  const b58 = (bytes: ReadonlyUint8Array) => getBase58Decoder().decode(bytes);
  const cancelData = b58(generated.getCancelBookingInstructionDataEncoder().encode({ minRefund: 0n }));
  const flagData = b58(generated.getFlagDisputeInstructionDataEncoder().encode({}));
  const releaseData = b58(generated.getReleaseInstructionDataEncoder().encode({}));
  /** Account keys: 0 = program, 1 = the PDA, 2… = filler accounts. */
  const keys = [PROGRAM, PDA, ...Array.from({ length: 12 }, (_, i) => `Fi11er${i}`)];
  /** An escrow instruction whose account list puts key `at[k]` at position k. */
  const ix = (data: string, at: number[]) => ({ programIdIndex: 0, accounts: at, data });
  /** Filler accounts everywhere, with the PDA (key 1) at `position`. */
  const withPdaAt = (count: number, position: number) => Array.from({ length: count }, (_, k) => (k === position ? 1 : k + 2));

  it("maps an escrow instruction whose IDL booking account is the PDA", () => {
    expect(fieldOfTransaction(keys, [ix(cancelData, withPdaAt(10, 1))], PDA)).toBe("final_sig");
    expect(fieldOfTransaction(keys, [ix(releaseData, withPdaAt(8, 0))], PDA)).toBe("final_sig");
    expect(fieldOfTransaction(keys, [ix(flagData, withPdaAt(2, 1))], PDA)).toBeNull(); // a dispute is no exit
  });

  it("ignores the PDA anywhere else in the account list (Anchor ignores extra accounts)", () => {
    // cancel_booking with the PDA as, e.g., its guest token account, or appended past the IDL accounts.
    expect(fieldOfTransaction(keys, [ix(cancelData, withPdaAt(10, 5))], PDA)).toBeUndefined();
    expect(fieldOfTransaction(keys, [ix(cancelData, [...withPdaAt(10, 99), 1])], PDA)).toBeUndefined();
    // release names its booking first; the PDA second is some other booking's account.
    expect(fieldOfTransaction(keys, [ix(releaseData, withPdaAt(8, 1))], PDA)).toBeUndefined();
    // Too few accounts for the instruction, or another program with the same data.
    expect(fieldOfTransaction(keys, [ix(flagData, [2])], PDA)).toBeUndefined();
    expect(fieldOfTransaction(keys, [{ ...ix(cancelData, withPdaAt(10, 1)), programIdIndex: 2 }], PDA)).toBeUndefined();
  });

  it("finds the matching instruction among others", () => {
    const decoy = ix(cancelData, withPdaAt(10, 4));
    expect(fieldOfTransaction(keys, [decoy, ix(releaseData, withPdaAt(8, 0))], PDA)).toBe("final_sig");
  });
});
