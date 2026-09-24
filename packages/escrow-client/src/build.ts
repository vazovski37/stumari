/**
 * Server-side transaction builders (api.md "Transaction building contract"): version 0,
 * operator = fee payer, idempotent ATA creation for recipients, simulation, partial signing.
 * The wallet that still has to sign is returned as `requiredSigner`.
 */
import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithinSizeLimit,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Base64EncodedWireTransaction,
  type Blockhash,
  type GetAccountInfoApi,
  type GetLatestBlockhashApi,
  type Instruction,
  type Rpc,
  type SimulateTransactionApi,
  type TransactionSigner,
} from "@solana/kit";
import { getCreateAssociatedTokenIdempotentInstruction } from "@solana-program/token";
import { validateTiers, type Tier } from "@stumari/core";
import { fetchConfig, type BookingView, type ConfigView } from "./accounts";
import { EscrowTxError, parseTransactionError } from "./errors";
import {
  getCancelBookingInstructionAsync,
  getConfirmBookingInstructionAsync,
  getCreateBookingInstructionAsync,
  getFlagDisputeInstruction,
  getInitializeConfigInstructionAsync,
  getRegisterHotelInstructionAsync,
  getReleaseInstructionAsync,
  getResolveDisputeInstructionAsync,
  getUpdateConfigInstructionAsync,
  getUpdateHotelInstructionAsync,
  getVoidBookingInstructionAsync,
} from "./generated/instructions";
import { findAta, findBookingPda, findHotelPda, findProgramDataAddress } from "./pdas";
import { sha256Hex } from "./hash";

export type BuilderRpc = Rpc<GetAccountInfoApi & GetLatestBlockhashApi & SimulateTransactionApi>;

export interface TxLifetime {
  blockhash: Blockhash;
  lastValidBlockHeight: bigint;
}

export interface BuildOptions {
  rpc: BuilderRpc;
  /** Fee payer for every transaction; also quote signer / rent payer for `create_booking`. */
  operator: TransactionSigner;
  /** Reuse a blockhash (e.g. one fetched per request); fetched at `confirmed` otherwise. */
  lifetime?: TxLifetime;
  /** Simulate before signing off (default true); a failure throws `EscrowTxError` with stage `simulate`. */
  simulate?: boolean;
}

/** Options for builders that need the Config account (treasury or mint); pass it to skip the read. */
export interface ConfigOptions {
  config?: ConfigView;
}

export interface BuiltTx {
  /** Wire transaction, partially signed by our keys. */
  txBase64: Base64EncodedWireTransaction;
  messageBytes: Uint8Array;
  /** sha256(messageBytes) — the `built_txs` key checked by `/api/tx/send`. */
  messageHashHex: string;
  lastValidBlockHeight: bigint;
  /** The wallet that still has to sign, or null when the transaction is fully signed. */
  requiredSigner: Address | null;
}

async function finalize(options: BuildOptions, instructions: readonly Instruction[]): Promise<BuiltTx> {
  const { rpc, operator } = options;
  const lifetime = options.lifetime ?? (await rpc.getLatestBlockhash({ commitment: "confirmed" }).send()).value;
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(operator, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const tx = await partiallySignTransactionMessageWithSigners(message);
  assertIsTransactionWithinSizeLimit(tx);
  const txBase64 = getBase64EncodedWireTransaction(tx);

  if (options.simulate ?? true) {
    const { value } = await rpc
      .simulateTransaction(txBase64, { encoding: "base64", sigVerify: false, commitment: "confirmed" })
      .send();
    if (value.err) {
      throw new EscrowTxError(
        "simulate",
        parseTransactionError(value.err, { logs: value.logs, programIds: instructions.map((ix) => ix.programAddress) }),
      );
    }
  }

  const unsigned = Object.entries(tx.signatures)
    .filter(([, signature]) => signature === null)
    .map(([signer]) => signer as Address);
  if (unsigned.length > 1) throw new Error(`more than one wallet must sign: ${unsigned.join(", ")}`);
  const messageBytes = Uint8Array.from(tx.messageBytes);
  return {
    txBase64,
    messageBytes,
    messageHashHex: await sha256Hex(messageBytes),
    lastValidBlockHeight: lifetime.lastValidBlockHeight,
    requiredSigner: unsigned[0] ?? null,
  };
}

/**
 * Our signer for an address: the operator itself when they coincide (devnet admin == operator —
 * Kit rejects two signer objects for one address), a no-op signer for wallets we do not hold.
 */
function signerFor(who: Address | TransactionSigner, operator: TransactionSigner): TransactionSigner {
  const addr = typeof who === "string" ? who : who.address;
  if (addr === operator.address) return operator;
  return typeof who === "string" ? createNoopSigner(who) : who;
}

/**
 * The guest's signer: always a wallet we do not hold. A guest address equal to the operator would
 * otherwise make our key sign the guest's token transfer (e.g. out of an operator-owned treasury).
 */
function guestSigner(guest: Address, operator: TransactionSigner): TransactionSigner {
  if (guest === operator.address) throw new Error("the guest wallet must not be the operator");
  return createNoopSigner(guest);
}

/** Idempotent `CreateAssociatedToken` for each distinct recipient, paid by the operator. */
async function recipientAtas(
  operator: TransactionSigner,
  owners: readonly Address[],
  mint: Address,
): Promise<Instruction[]> {
  return Promise.all(
    [...new Set(owners)].map(async (owner) =>
      getCreateAssociatedTokenIdempotentInstruction({ payer: operator, ata: await findAta(owner, mint), owner, mint }),
    ),
  );
}

const configOf = (o: BuildOptions & ConfigOptions) => o.config ?? fetchConfig(o.rpc);

/** Accounts every exit instruction shares (all fixed by the booking's snapshots). */
async function exitAccounts(o: BuildOptions & ConfigOptions, booking: BookingView) {
  const [config, guestTokenAccount, hotelTokenAccount] = await Promise.all([
    configOf(o),
    findAta(booking.guest, booking.mint),
    findAta(booking.hotelAuthority, booking.mint),
  ]);
  return {
    booking: booking.address,
    mint: booking.mint,
    guestTokenAccount,
    hotelTokenAccount,
    treasury: config.treasury,
    rentPayer: booking.rentPayer,
  };
}

// ---------------------------------------------------------------- guest-signed

export interface CreateBookingParams extends BuildOptions {
  guest: Address;
  /** `uuidToBytes(hotels.id)`. */
  hotelId: Uint8Array;
  mint: Address;
  /** `deriveBookingId(quote.id)`. */
  bookingId: Uint8Array;
  amount: bigint;
  checkinTs: bigint;
  checkoutTs: bigint;
  /** sha256 of the canonical quote bytes. */
  quoteHash: Uint8Array;
  optionIndex: number;
  tiers: readonly Tier[];
  quoteExpiresTs: bigint;
}

/** `create_booking`: operator = fee payer + quote signer + rent payer; the guest signs as token authority. */
export async function buildCreateBookingTx(p: CreateBookingParams): Promise<BuiltTx & { booking: Address }> {
  validateTiers(p.tiers);
  if (p.quoteHash.length !== 32) throw new Error(`quoteHash must be 32 bytes, got ${p.quoteHash.length}`);
  const [hotel, booking, guestTokenAccount] = await Promise.all([
    findHotelPda(p.hotelId),
    findBookingPda(p.bookingId),
    findAta(p.guest, p.mint),
  ]);
  const ix = await getCreateBookingInstructionAsync({
    quoteSigner: p.operator,
    guest: guestSigner(p.guest, p.operator),
    hotel,
    mint: p.mint,
    guestTokenAccount,
    booking,
    bookingId: p.bookingId,
    amount: p.amount,
    checkinTs: p.checkinTs,
    checkoutTs: p.checkoutTs,
    quoteHash: p.quoteHash,
    optionIndex: p.optionIndex,
    tiers: p.tiers.map((t) => ({ secsBefore: t.secs_before, refundBps: t.refund_bps })),
    quoteExpiresTs: p.quoteExpiresTs,
  });
  return { ...(await finalize(p, [ix])), booking };
}

export interface CancelParams extends BuildOptions, ConfigOptions {
  booking: BookingView;
  /** The refund the guest was shown (`minRefundForCancel` from @stumari/core). */
  minRefund: bigint;
}

/** `cancel_booking(min_refund)`, signed by the guest; creates the guest and hotel ATAs if needed. */
export async function buildCancelTx(p: CancelParams): Promise<BuiltTx> {
  const accounts = await exitAccounts(p, p.booking);
  const ix = await getCancelBookingInstructionAsync({
    ...accounts,
    guest: guestSigner(p.booking.guest, p.operator),
    minRefund: p.minRefund,
  });
  const atas = await recipientAtas(p.operator, [p.booking.guest, p.booking.hotelAuthority], p.booking.mint);
  return finalize(p, [...atas, ix]);
}

export interface DisputeParams extends BuildOptions {
  booking: BookingView;
}

/** `flag_dispute`, signed by the guest. */
export async function buildDisputeTx(p: DisputeParams): Promise<BuiltTx> {
  const ix = getFlagDisputeInstruction({
    guest: guestSigner(p.booking.guest, p.operator),
    booking: p.booking.address,
  });
  return finalize(p, [ix]);
}

export interface VoidParams extends BuildOptions, ConfigOptions {
  booking: BookingView;
  /**
   * Who voids: the operator by default (permissionless after the confirm deadline), the admin
   * signer before it, or a wallet address that will sign itself (e.g. the guest).
   */
  authority?: TransactionSigner | Address;
}

/** `void_booking`: full refund of a Pending booking; creates the guest ATA if needed. */
export async function buildVoidTx(p: VoidParams): Promise<BuiltTx> {
  const { hotelTokenAccount: _, ...accounts } = await exitAccounts(p, p.booking);
  const ix = await getVoidBookingInstructionAsync({
    ...accounts,
    authority: signerFor(p.authority ?? p.operator, p.operator),
  });
  const atas = await recipientAtas(p.operator, [p.booking.guest], p.booking.mint);
  return finalize(p, [...atas, ix]);
}

// ---------------------------------------------------------------- operator / admin

export interface ConfirmParams extends BuildOptions {
  booking: BookingView;
}

/** `confirm_booking` by the operator (= quote signer). Fully signed. */
export async function buildConfirmTx(p: ConfirmParams): Promise<BuiltTx> {
  const ix = await getConfirmBookingInstructionAsync({
    authority: p.operator,
    hotel: p.booking.hotel,
    booking: p.booking.address,
  });
  return finalize(p, [ix]);
}

export interface ReleaseParams extends BuildOptions, ConfigOptions {
  booking: BookingView;
}

/** `release` (permissionless crank; the operator only pays the fee). Fully signed. */
export async function buildReleaseTx(p: ReleaseParams): Promise<BuiltTx> {
  const { guestTokenAccount: _, ...accounts } = await exitAccounts(p, p.booking);
  const ix = await getReleaseInstructionAsync(accounts);
  const atas = await recipientAtas(p.operator, [p.booking.hotelAuthority], p.booking.mint);
  return finalize(p, [...atas, ix]);
}

export interface ResolveParams extends BuildOptions, ConfigOptions {
  booking: BookingView;
  admin: TransactionSigner;
  /** Guest's share in bps; the rest goes to the hotel minus the booking's fee. */
  guestBps: number;
}

/** `resolve_dispute(guest_bps)` by the admin (arbiter stub). Fully signed. */
export async function buildResolveTx(p: ResolveParams): Promise<BuiltTx> {
  const accounts = await exitAccounts(p, p.booking);
  const ix = await getResolveDisputeInstructionAsync({
    ...accounts,
    admin: signerFor(p.admin, p.operator),
    guestBps: p.guestBps,
  });
  const atas = await recipientAtas(p.operator, [p.booking.guest, p.booking.hotelAuthority], p.booking.mint);
  return finalize(p, [...atas, ix]);
}

export interface RegisterHotelParams extends BuildOptions, ConfigOptions {
  admin: TransactionSigner;
  hotelId: Uint8Array;
  /** The hotel's payout wallet. */
  authority: Address;
}

/** Idempotent ATA for the payout wallet + `register_hotel`. Fully signed. */
export async function buildRegisterHotelTx(p: RegisterHotelParams): Promise<BuiltTx & { hotel: Address }> {
  const [config, hotel] = await Promise.all([configOf(p), findHotelPda(p.hotelId)]);
  const ix = await getRegisterHotelInstructionAsync({
    admin: signerFor(p.admin, p.operator),
    hotel,
    hotelId: p.hotelId,
    authority: p.authority,
  });
  const atas = await recipientAtas(p.operator, [p.authority], config.mint);
  return { ...(await finalize(p, [...atas, ix])), hotel };
}

export interface UpdateHotelParams extends BuildOptions, ConfigOptions {
  admin: TransactionSigner;
  hotelId: Uint8Array;
  /** New payout wallet (affects bookings created afterwards only); its ATA is created too. */
  authority?: Address;
  active?: boolean;
}

/** `update_hotel(authority?, active?)`. Fully signed. */
export async function buildUpdateHotelTx(p: UpdateHotelParams): Promise<BuiltTx> {
  const hotel = await findHotelPda(p.hotelId);
  const ix = await getUpdateHotelInstructionAsync({
    admin: signerFor(p.admin, p.operator),
    hotel,
    authority: p.authority ?? null,
    active: p.active ?? null,
  });
  const atas = p.authority ? await recipientAtas(p.operator, [p.authority], (await configOf(p)).mint) : [];
  return finalize(p, [...atas, ix]);
}

export interface InitializeConfigParams extends BuildOptions {
  /** Must be the program's upgrade authority; becomes `config.admin` and pays the Config rent. */
  admin: TransactionSigner;
  /** Defaults to the operator. */
  quoteSigner?: Address;
  mint: Address;
  /** Existing token account of `mint`. */
  treasury: Address;
  feeBps: number;
  confirmWindowSecs: number;
  releaseDelaySecs: number;
}

/** `initialize_config` (once per deployment). Fully signed. */
export async function buildInitializeConfigTx(p: InitializeConfigParams): Promise<BuiltTx> {
  const ix = await getInitializeConfigInstructionAsync({
    admin: signerFor(p.admin, p.operator),
    mint: p.mint,
    treasury: p.treasury,
    programData: await findProgramDataAddress(),
    quoteSigner: p.quoteSigner ?? p.operator.address,
    feeBps: p.feeBps,
    confirmWindowSecs: p.confirmWindowSecs,
    releaseDelaySecs: p.releaseDelaySecs,
  });
  return finalize(p, [ix]);
}

export interface ConfigChanges {
  admin?: Address;
  quoteSigner?: Address;
  /** Applies to bookings created afterwards only. */
  feeBps?: number;
  confirmWindowSecs?: number;
  releaseDelaySecs?: number;
  paused?: boolean;
  /** New treasury token account (mint must equal `config.mint`). */
  treasury?: Address;
}

export interface UpdateConfigParams extends BuildOptions {
  admin: TransactionSigner;
  changes: ConfigChanges;
}

/** `update_config` — only the fields present in `changes` are written. Fully signed. */
export async function buildUpdateConfigTx(p: UpdateConfigParams): Promise<BuiltTx> {
  const c = p.changes;
  const ix = await getUpdateConfigInstructionAsync({
    admin: signerFor(p.admin, p.operator),
    ...(c.treasury ? { treasury: c.treasury } : {}),
    adminArg: c.admin ?? null,
    quoteSigner: c.quoteSigner ?? null,
    feeBps: c.feeBps ?? null,
    confirmWindowSecs: c.confirmWindowSecs ?? null,
    releaseDelaySecs: c.releaseDelaySecs ?? null,
    paused: c.paused ?? null,
  });
  return finalize(p, [ix]);
}
