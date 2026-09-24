/**
 * Full booking lifecycle on a fresh Surfpool chain, driven only through this package's builders,
 * the wallet-style signing a browser does, and the relay. Tests run in order and share state.
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import {
  generateKeyPairSigner,
  getBase64Decoder,
  getBase64Encoder,
  getTransactionCodec,
  partiallySignTransaction,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import {
  deriveBookingId,
  minRefundForCancel,
  splitCancel,
  splitRelease,
  splitResolve,
  TEMPLATES,
  uuidToBytes,
  uuidV4,
  type Split,
  type Tier,
} from "@stumari/core";
import {
  AccountValidationError,
  buildCancelTx,
  buildConfirmTx,
  buildCreateBookingTx,
  buildDisputeTx,
  buildInitializeConfigTx,
  buildRegisterHotelTx,
  buildReleaseTx,
  buildResolveTx,
  buildUpdateConfigTx,
  buildVoidTx,
  decodeWireTx,
  EscrowTxError,
  fetchBooking,
  fetchConfig,
  fetchHotel,
  fetchMaybeBooking,
  findAta,
  findConfigPda,
  findHotelPda,
  findProgramDataAddress,
  findVaultPda,
  sendAndConfirm,
  sendBuiltTx,
  STUMARI_ESCROW_PROGRAM_ADDRESS,
  verifySignatures,
  type BookingView,
  type BuiltTx,
} from "../src";
import { Surfnet } from "./surfnet";

const DAY = 86_400n;
const FEE_BPS = 150;
const AMOUNT = 123_456_789n; // odd on purpose: exercises floor rounding
const STANDARD: readonly Tier[] = TEMPLATES.standard.tiers; // 100% ≥ 7 d, 50% ≥ 3 d, then 0

let chain: Surfnet;
let admin: KeyPairSigner;
let operator: KeyPairSigner;
let guest: KeyPairSigner;
let hotelAuthority: Address;
let mint: Address;
let treasury: Address;
let hotelId: Uint8Array;
let t0: bigint;

const bookings: Record<"a" | "b" | "c" | "d" | "e", BookingView> = {} as never;

/** What a browser wallet does with the server's bytes: decode, sign, re-encode. */
async function walletSign(txBase64: string, wallet: KeyPairSigner): Promise<string> {
  const codec = getTransactionCodec();
  const tx = codec.decode(getBase64Encoder().encode(txBase64));
  return getBase64Decoder().decode(codec.encode(await partiallySignTransaction([wallet.keyPair], tx)));
}

/** `POST /api/tx/send`: fee payer must be the operator, every signature must verify. */
async function relay(signedBase64: string, built: BuiltTx) {
  const decoded = await decodeWireTx(signedBase64);
  expect(decoded.feePayer).toBe(operator.address);
  expect(decoded.messageHashHex).toBe(built.messageHashHex);
  expect(await verifySignatures(decoded)).toEqual({ valid: true, missing: [], invalid: [] });
  return sendAndConfirm(chain.rpc, signedBase64, { lastValidBlockHeight: built.lastValidBlockHeight });
}

async function expectTxError(promise: Promise<unknown>, stage: EscrowTxError["stage"], name: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(EscrowTxError);
  expect((error as EscrowTxError).stage).toBe(stage);
  expect((error as EscrowTxError).errorName).toBe(name);
}

const ctx = () => ({ rpc: chain.rpc, operator });

async function balances() {
  const [guestAta, hotelAta] = await Promise.all([findAta(guest.address, mint), findAta(hotelAuthority, mint)]);
  const [g, h, t] = await Promise.all([
    chain.tokenBalance(guestAta),
    chain.tokenBalance(hotelAta),
    chain.tokenBalance(treasury),
  ]);
  return { guest: g, hotel: h, treasury: t };
}

/** Balance deltas and the booking's stored amounts must both equal the @stumari/core split. */
async function expectSettled(before: Awaited<ReturnType<typeof balances>>, booking: BookingView, full: Split) {
  const split = { refund: full.refund, hotelNet: full.hotelNet, fee: full.fee };
  const after = await balances();
  expect({
    refund: after.guest - before.guest,
    hotelNet: after.hotel - before.hotel,
    fee: after.treasury - before.treasury,
  }).toEqual(split);
  const stored = await fetchBooking(chain.rpc, booking.address);
  expect({ refund: stored.refundAmount, hotelNet: stored.hotelAmount, fee: stored.feeAmount }).toEqual(split);
  expect(split.refund + split.hotelNet + split.fee).toBe(booking.amount);
  expect(await chain.exists(await findVaultPda(booking.address))).toBe(false);
  return stored;
}

async function createBooking(bookingId: Uint8Array, checkinTs: bigint): Promise<BuiltTx & { booking: Address }> {
  return buildCreateBookingTx({
    ...ctx(),
    guest: guest.address,
    hotelId,
    mint,
    bookingId,
    amount: AMOUNT,
    checkinTs,
    checkoutTs: checkinTs + 2n * DAY,
    quoteHash: crypto.getRandomValues(new Uint8Array(32)),
    optionIndex: 1,
    tiers: STANDARD,
    quoteExpiresTs: (await chain.now()) + 600n,
  });
}

beforeAll(async () => {
  chain = new Surfnet(inject("rpcUrl"));
  [admin, operator, guest] = await Promise.all([
    generateKeyPairSigner(),
    generateKeyPairSigner(),
    generateKeyPairSigner(),
  ]);
  const [hotelWallet, treasuryOwner, mintKey] = await Promise.all([
    generateKeyPairSigner(),
    generateKeyPairSigner(),
    generateKeyPairSigner(),
  ]);
  hotelAuthority = hotelWallet.address;
  mint = mintKey.address;
  hotelId = uuidToBytes(uuidV4());
  await chain.setLamports(admin.address, 10_000_000_000n);
  await chain.setLamports(operator.address, 10_000_000_000n);
  await chain.createMint(mint, admin.address);
  await chain.setTokenBalance(guest.address, mint, 6n * AMOUNT); // five bookings + one only built
  await chain.setTokenBalance(treasuryOwner.address, mint, 0n);
  treasury = await findAta(treasuryOwner.address, mint);
});

describe("escrow lifecycle through the builders", () => {
  it("deploys the program with the admin as upgrade authority", async () => {
    await chain.deployEscrow(admin.address);
    expect(await chain.upgradeAuthority(await findProgramDataAddress())).toBe(admin.address);
  });

  it("initialize_config is reserved to the upgrade authority", async () => {
    const params = { mint, treasury, feeBps: FEE_BPS, confirmWindowSecs: 7_200, releaseDelaySecs: 86_400 };
    await expectTxError(buildInitializeConfigTx({ ...ctx(), admin: operator, ...params }), "simulate", "Unauthorized");

    const built = await buildInitializeConfigTx({ ...ctx(), admin, ...params });
    expect(built.requiredSigner).toBeNull();
    await sendBuiltTx(chain.rpc, built);

    const config = await fetchConfig(chain.rpc);
    expect(config).toMatchObject({
      admin: admin.address,
      quoteSigner: operator.address,
      mint,
      treasury,
      feeBps: FEE_BPS,
      confirmWindowSecs: 7_200,
      releaseDelaySecs: 86_400,
      paused: false,
    });
  });

  it("update_config rejects a fee above the maximum", async () => {
    await expectTxError(buildUpdateConfigTx({ ...ctx(), admin, changes: { feeBps: 1_001 } }), "simulate", "FeeTooHigh");
  });

  it("registers a hotel and creates its payout ATA", async () => {
    const built = await buildRegisterHotelTx({ ...ctx(), admin, hotelId, authority: hotelAuthority });
    await sendBuiltTx(chain.rpc, built);
    expect(built.hotel).toBe(await findHotelPda(hotelId));
    const hotel = await fetchHotel(chain.rpc, built.hotel);
    expect(hotel).toMatchObject({ authority: hotelAuthority, active: true, hotelId });
    expect(await chain.exists(await findAta(hotelAuthority, mint))).toBe(true);
  });

  it("creates bookings gaslessly: the guest holds no SOL and signs only as token authority", async () => {
    t0 = await chain.now();
    const guestBefore = (await balances()).guest;
    const plan = { a: t0 + 10n * DAY, b: t0 + 10n * DAY, c: t0 + DAY, d: t0 + DAY, e: t0 + 5n * DAY } as const;
    for (const [key, checkinTs] of Object.entries(plan) as [keyof typeof plan, bigint][]) {
      const built = await createBooking(deriveBookingId(uuidV4()), checkinTs);
      expect(built.requiredSigner).toBe(guest.address);
      await relay(await walletSign(built.txBase64, guest), built);
      bookings[key] = await fetchBooking(chain.rpc, built.booking);
    }
    expect(await chain.lamports(guest.address)).toBe(0n);
    expect((await balances()).guest).toBe(guestBefore - 5n * AMOUNT);
    expect(bookings.a).toMatchObject({
      status: "pending",
      guest: guest.address,
      hotelAuthority,
      rentPayer: operator.address,
      mint,
      amount: AMOUNT,
      feeBps: FEE_BPS,
      checkinTs: plan.a,
      tiers: STANDARD,
      optionIndex: 1,
      closedTs: 0n,
    });
    expect(bookings.a.confirmDeadlineTs).toBe(bookings.a.createdTs + 7_200n);
    expect(bookings.a.releaseAfterTs).toBe(plan.a + DAY);
  });

  it("a second create for the same booking id fails", async () => {
    const built = createBooking(bookings.a.bookingId, bookings.a.checkinTs);
    const error = await built.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EscrowTxError);
    expect((error as EscrowTxError).stage).toBe("simulate");
    expect((error as EscrowTxError).failure.logs.join("\n")).toMatch(/already in use/);
    expect((error as EscrowTxError).errorName).toBe("AccountAlreadyInUse");
  });

  it("relay: decodes the fee payer and rejects unsigned or modified transactions", async () => {
    const built = await createBooking(deriveBookingId(uuidV4()), t0 + 10n * DAY);
    const unsigned = await decodeWireTx(built.txBase64);
    expect(unsigned.feePayer).toBe(operator.address);
    expect(unsigned.version).toBe(0);
    expect(unsigned.programIds).toEqual([STUMARI_ESCROW_PROGRAM_ADDRESS]);
    expect(unsigned.signers.map((s) => s.address)).toEqual([operator.address, guest.address]);
    expect(await verifySignatures(unsigned)).toEqual({ valid: false, missing: [guest.address], invalid: [] });

    const signed = await decodeWireTx(await walletSign(built.txBase64, guest));
    expect((await verifySignatures(signed)).valid).toBe(true);

    // A wallet that rewrites the message (e.g. adds a priority fee) invalidates every signature.
    const tampered = { ...signed, messageBytes: Uint8Array.from(signed.messageBytes) };
    tampered.messageBytes[tampered.messageBytes.length - 1]! ^= 0xff;
    expect(await verifySignatures(tampered)).toEqual({
      valid: false,
      missing: [],
      invalid: [operator.address, guest.address],
    });
  });

  it("confirms bookings a–d (operator-only, fully signed)", async () => {
    for (const key of ["a", "b", "c", "d"] as const) {
      const built = await buildConfirmTx({ ...ctx(), booking: bookings[key] });
      expect(built.requiredSigner).toBeNull();
      await sendBuiltTx(chain.rpc, built);
      bookings[key] = await fetchBooking(chain.rpc, bookings[key].address);
      expect(bookings[key].status).toBe("confirmed");
    }
  });

  it("void before the confirm deadline needs the admin", async () => {
    await expectTxError(buildVoidTx({ ...ctx(), booking: bookings.e }), "simulate", "VoidTooEarly");
  });

  it("void after the confirm deadline refunds the guest in full (anyone may crank)", async () => {
    await chain.timeTravel(bookings.e.confirmDeadlineTs + 5n);
    const before = await balances();
    await sendBuiltTx(chain.rpc, await buildVoidTx({ ...ctx(), booking: bookings.e }));
    const stored = await expectSettled(before, bookings.e, { refund: AMOUNT, hotelNet: 0n, fee: 0n });
    expect(stored.status).toBe("voided");
  });

  it("dispute opens at check-in; release is not yet possible", async () => {
    await chain.timeTravel(bookings.d.checkinTs + 5n);
    await expectTxError(buildReleaseTx({ ...ctx(), booking: bookings.c }), "simulate", "NotReleasable");

    const built = await buildDisputeTx({ ...ctx(), booking: bookings.d });
    expect(built.requiredSigner).toBe(guest.address);
    await relay(await walletSign(built.txBase64, guest), built);
    bookings.d = await fetchBooking(chain.rpc, bookings.d.address);
    expect(bookings.d.status).toBe("disputed");
  });

  it("resolve splits by guest_bps exactly like splitResolve", async () => {
    const guestBps = 3_333;
    const before = await balances();
    await sendBuiltTx(chain.rpc, await buildResolveTx({ ...ctx(), booking: bookings.d, admin, guestBps }));
    const split = splitResolve({ amount: AMOUNT, feeBps: FEE_BPS, guestBps });
    expect(split.fee).toBeGreaterThan(0n);
    expect((await expectSettled(before, bookings.d, split)).status).toBe("resolved");
  });

  it("release after a clock warp pays hotel net + fee exactly like splitRelease", async () => {
    await chain.timeTravel(bookings.c.releaseAfterTs + 5n);
    const operatorBefore = await chain.lamports(operator.address);
    const before = await balances();
    await sendBuiltTx(chain.rpc, await buildReleaseTx({ ...ctx(), booking: bookings.c }));
    const stored = await expectSettled(before, bookings.c, splitRelease({ amount: AMOUNT, feeBps: FEE_BPS }));
    expect(stored.status).toBe("released");
    // The vault's rent came back to the rent payer (more than the fee it paid).
    expect(await chain.lamports(operator.address)).toBeGreaterThan(operatorBefore);
  });

  it("cancel just before a tier boundary: min_refund from core is met, too high a minimum is refused", async () => {
    const boundary = bookings.a.checkinTs - 604_800n; // 100% at or above, 50% below
    await chain.timeTravel(boundary - 30n);
    const minRefund = minRefundForCancel({ booking: bookings.a, now: await chain.now() });
    expect(minRefund).toBe(AMOUNT / 2n); // evaluated at now + 90 s, already past the boundary

    await expectTxError(
      buildCancelTx({ ...ctx(), booking: bookings.a, minRefund: AMOUNT + 1n }),
      "simulate",
      "RefundBelowMinimum",
    );

    const built = await buildCancelTx({ ...ctx(), booking: bookings.a, minRefund });
    expect(built.requiredSigner).toBe(guest.address);
    const before = await balances();
    await relay(await walletSign(built.txBase64, guest), built);
    const closed = await fetchBooking(chain.rpc, bookings.a.address);
    const split = splitCancel({ ...bookings.a, status: "confirmed", now: closed.closedTs });
    expect(split.refund).toBe(AMOUNT);
    expect((await expectSettled(before, bookings.a, split)).status).toBe("cancelled");
  });

  it("a tier boundary between showing and sending fails with RefundBelowMinimum, not a smaller refund", async () => {
    const shown = AMOUNT; // what the guest saw before the boundary
    await chain.timeTravel(bookings.b.checkinTs - 604_800n + 30n);
    await expectTxError(
      buildCancelTx({ ...ctx(), booking: bookings.b, minRefund: shown }),
      "simulate",
      "RefundBelowMinimum",
    );
    // Sent without the builder's simulation, the same transaction fails at the relay's preflight.
    const unsimulated = await buildCancelTx({ ...ctx(), booking: bookings.b, minRefund: shown, simulate: false });
    await expectTxError(
      sendAndConfirm(chain.rpc, await walletSign(unsimulated.txBase64, guest)),
      "send",
      "RefundBelowMinimum",
    );

    const minRefund = minRefundForCancel({ booking: bookings.b, now: await chain.now() });
    const built = await buildCancelTx({ ...ctx(), booking: bookings.b, minRefund });
    const before = await balances();
    await relay(await walletSign(built.txBase64, guest), built);
    const closed = await fetchBooking(chain.rpc, bookings.b.address);
    const split = splitCancel({ ...bookings.b, status: "confirmed", now: closed.closedTs });
    expect(split.refund).toBe(AMOUNT / 2n);
    expect(await expectSettled(before, bookings.b, split)).toMatchObject({ status: "cancelled" });
  });

  it("the guest never needed SOL and every booking account persists", async () => {
    expect(await chain.lamports(guest.address)).toBe(0n);
    for (const booking of Object.values(bookings)) {
      expect(await fetchMaybeBooking(chain.rpc, booking.address)).not.toBeNull();
    }
  });

  it("account reads reject foreign owners and wrong account types", async () => {
    const guestAta = await findAta(guest.address, mint);
    await expect(fetchBooking(chain.rpc, guestAta)).rejects.toThrow(AccountValidationError);
    await expect(fetchBooking(chain.rpc, guestAta)).rejects.toThrow(/not the escrow program/);
    await expect(fetchBooking(chain.rpc, await findConfigPda())).rejects.toThrow(/discriminator/);
    expect(await fetchMaybeBooking(chain.rpc, guest.address)).toBeNull();
  });
});
