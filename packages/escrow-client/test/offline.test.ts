/** Builders, relay decoding, views and error parsing that need no chain. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createKeyPairSignerFromPrivateKeyBytes,
  generateKeyPairSigner,
  type Address,
  type Blockhash,
} from "@solana/kit";
import { isCoreError, TEMPLATES } from "@stumari/core";
import {
  buildCreateBookingTx,
  buildUpdateConfigTx,
  decodeWireTx,
  escrowErrorFromCode,
  findBookingPda,
  findHotelPda,
  generated,
  parseTransactionError,
  STUMARI_ESCROW_PROGRAM_ADDRESS,
  toBookingView,
  verifySignatures,
  type BuilderRpc,
} from "../src";

const IDL_PATH = resolve(import.meta.dirname, "../../../onchain/artifacts/idl/stumari_escrow.json");
const idl = JSON.parse(readFileSync(IDL_PATH, "utf8")) as { errors: { code: number; name: string; msg: string }[] };

/** Builders with `simulate: false` and a given lifetime never touch the RPC. */
const noRpc = new Proxy(
  {},
  {
    get: () => {
      throw new Error("unexpected RPC call");
    },
  },
) as BuilderRpc;
const lifetime = { blockhash: "11111111111111111111111111111111" as Blockhash, lastValidBlockHeight: 100n };

describe("errors", () => {
  it("maps every IDL error code to its name and message", () => {
    for (const { code, name, msg } of idl.errors) {
      expect(escrowErrorFromCode(code)).toEqual({ code, name, message: msg });
    }
    expect(escrowErrorFromCode(42)).toBeNull();
  });

  it("parses a custom escrow error from a raw TransactionError (RPC bigints included)", () => {
    const failure = parseTransactionError({ InstructionError: [2n, { Custom: 6008n }] });
    expect(failure).toMatchObject({ code: 6008, name: "RefundBelowMinimum", instructionIndex: 2 });
  });

  it("prefers Anchor's log line, which also names framework errors", () => {
    const logs = [
      "Program 6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf invoke [1]",
      "Program log: AnchorError caused by account: vault. Error Code: ConstraintSeeds. Error Number: 2006. Error Message: A seeds constraint was violated.",
    ];
    expect(parseTransactionError({ InstructionError: [1, { Custom: 2006 }] }, { logs })).toMatchObject({
      code: 2006,
      name: "ConstraintSeeds",
      message: "A seeds constraint was violated",
      instructionIndex: 1,
    });
  });

  it("does not attribute another program's custom code to the escrow", () => {
    const programIds = ["ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address, STUMARI_ESCROW_PROGRAM_ADDRESS];
    expect(parseTransactionError({ InstructionError: [0, { Custom: 6000 }] }, { programIds }).name).toBe(
      "Custom(6000)",
    );
    expect(parseTransactionError({ InstructionError: [1, { Custom: 6000 }] }, { programIds }).name).toBe("Paused");
  });

  it("names a create on an existing address AccountAlreadyInUse", () => {
    const logs = ["Allocate: account Address { address: 9xQ..., base: None } already in use"];
    expect(parseTransactionError({ InstructionError: [1, { Custom: 0 }] }, { logs })).toMatchObject({
      code: 0,
      name: "AccountAlreadyInUse",
    });
  });

  it("names runtime errors", () => {
    expect(parseTransactionError("BlockhashNotFound").name).toBe("BlockhashNotFound");
    expect(parseTransactionError({ InsufficientFundsForRent: { account_index: 2 } }).name).toBe(
      "InsufficientFundsForRent",
    );
    expect(parseTransactionError({ InstructionError: [0, "MissingRequiredSignature"] })).toMatchObject({
      name: "MissingRequiredSignature",
      instructionIndex: 0,
      code: null,
    });
  });
});

describe("pdas", () => {
  it("rejects ids that are not 16 bytes", async () => {
    await expect(findHotelPda(new Uint8Array(15))).rejects.toThrow(/16 bytes/);
    await expect(findBookingPda(new Uint8Array(32))).rejects.toThrow(/16 bytes/);
  });
});

describe("toBookingView", () => {
  const raw = {
    discriminator: generated.BOOKING_DISCRIMINATOR,
    bookingId: new Uint8Array(16).fill(0xab),
    hotel: STUMARI_ESCROW_PROGRAM_ADDRESS,
    hotelAuthority: STUMARI_ESCROW_PROGRAM_ADDRESS,
    guest: STUMARI_ESCROW_PROGRAM_ADDRESS,
    rentPayer: STUMARI_ESCROW_PROGRAM_ADDRESS,
    mint: STUMARI_ESCROW_PROGRAM_ADDRESS,
    amount: 5n,
    feeBps: 150,
    checkinTs: 10n,
    checkoutTs: 20n,
    createdTs: 1n,
    confirmDeadlineTs: 2n,
    releaseAfterTs: 30n,
    quoteHash: new Uint8Array(32),
    optionIndex: 0,
    tierCount: 2,
    tiers: [
      { secsBefore: 86_400, refundBps: 10_000 },
      { secsBefore: 0, refundBps: 5_000 },
      ...Array.from({ length: 6 }, () => ({ secsBefore: 0, refundBps: 0 })),
    ],
    status: 4,
    refundAmount: 0n,
    hotelAmount: 0n,
    feeAmount: 0n,
    closedTs: 0n,
    bump: 255,
    vaultBump: 254,
  };

  it("names the status, trims tiers to tier_count and uses the core tier shape", () => {
    const view = toBookingView(STUMARI_ESCROW_PROGRAM_ADDRESS, raw);
    expect(view.status).toBe("disputed");
    expect(view.tiers).toEqual(TEMPLATES.flexible.tiers);
    expect(view.bookingIdHex).toBe("ab".repeat(16));
  });

  it("rejects an unknown status", () => {
    expect(() => toBookingView(STUMARI_ESCROW_PROGRAM_ADDRESS, { ...raw, status: 9 })).toThrow(
      /unknown booking status/,
    );
  });

  it("rejects a tier_count outside 1..8", () => {
    for (const tierCount of [0, 9]) {
      expect(() => toBookingView(STUMARI_ESCROW_PROGRAM_ADDRESS, { ...raw, tierCount })).toThrow(/tier_count/);
    }
  });
});

describe("builders without a chain", () => {
  const createParams = async () => {
    const operator = await generateKeyPairSigner();
    const guest = (await generateKeyPairSigner()).address;
    return {
      rpc: noRpc,
      operator,
      lifetime,
      simulate: false,
      guest,
      hotelId: new Uint8Array(16),
      mint: operator.address,
      bookingId: new Uint8Array(16),
      amount: 1n,
      checkinTs: 10n,
      checkoutTs: 20n,
      quoteHash: new Uint8Array(32),
      optionIndex: 0,
      tiers: TEMPLATES.flexible.tiers,
      quoteExpiresTs: 5n,
    };
  };

  it("validates tiers with @stumari/core before touching the RPC", async () => {
    const params = { ...(await createParams()), tiers: [{ secs_before: 100, refund_bps: 10_000 }] };
    const error = await buildCreateBookingTx(params).catch((e: unknown) => e);
    expect(isCoreError(error, "InvalidTiers")).toBe(true);
  });

  it("builds a create that only the guest still has to sign", async () => {
    const params = await createParams();
    const built = await buildCreateBookingTx(params);
    expect(built.requiredSigner).toBe(params.guest);
  });

  it("refuses a guest wallet equal to the operator, so our key never signs the guest's transfer", async () => {
    const params = await createParams();
    await expect(buildCreateBookingTx({ ...params, guest: params.operator.address })).rejects.toThrow(
      /must not be the operator/,
    );
  });

  it("refuses a quote hash that is not 32 bytes (the codec would pad or truncate it)", async () => {
    const params = await createParams();
    for (const length of [16, 40]) {
      await expect(buildCreateBookingTx({ ...params, quoteHash: new Uint8Array(length) })).rejects.toThrow(
        /quoteHash must be 32 bytes/,
      );
    }
  });

  it("uses the operator when the admin key is the operator key (devnet), leaving nothing to sign", async () => {
    const seed = crypto.getRandomValues(new Uint8Array(32));
    const operator = await createKeyPairSignerFromPrivateKeyBytes(seed);
    const admin = await createKeyPairSignerFromPrivateKeyBytes(seed); // same key, different object
    const built = await buildUpdateConfigTx({
      rpc: noRpc,
      operator,
      lifetime,
      simulate: false,
      admin,
      changes: { paused: true },
    });
    expect(built.requiredSigner).toBeNull();
    expect(built.lastValidBlockHeight).toBe(100n);

    const decoded = await decodeWireTx(built.txBase64);
    expect(decoded.feePayer).toBe(operator.address);
    expect(decoded.signers.map((s) => s.address)).toEqual([operator.address]);
    expect(decoded.messageHashHex).toBe(built.messageHashHex);
    expect(decoded.lifetimeToken).toBe(lifetime.blockhash);
    expect(await verifySignatures(built.txBase64)).toEqual({ valid: true, missing: [], invalid: [] });
  });
});
