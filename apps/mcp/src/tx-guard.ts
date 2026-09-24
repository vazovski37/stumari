import {
  type Address,
  type Transaction,
  address,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getInstructionsFromCompiledTransactionMessage,
  getProgramDerivedAddress,
  getTransactionDecoder,
} from "@solana/kit";

/** Fixed across clusters (ADR-0008, onchain/artifacts/program-id.txt). */
export const STUMARI_ESCROW_PROGRAM_ID = address("6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf");
const COMPUTE_BUDGET_PROGRAM = address("ComputeBudget111111111111111111111111111111");
const ATA_PROGRAM = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
/** Associated Token Account program `CreateIdempotent`. */
const ATA_CREATE_IDEMPOTENT = 1;

/** Anchor discriminators from onchain/artifacts/idl/stumari_escrow.json. */
const DISCRIMINATORS = {
  create_booking: [19, 223, 181, 90, 124, 206, 73, 169],
  cancel_booking: [139, 162, 116, 202, 78, 140, 139, 90],
} as const;

/** Account positions in the IDL instruction definitions. */
const LAYOUT = {
  create_booking: { guest: 1, booking: 6 },
  cancel_booking: { guest: 0, booking: 1 },
} as const;
const CREATE_ACCOUNTS = { quoteSigner: 0, hotel: 3, mint: 4 } as const;

export type GuardCode =
  | "TX_DECODE_FAILED"
  | "UNSUPPORTED_TX_VERSION"
  | "ADDRESS_LOOKUP_TABLES"
  | "FEE_PAYER_MISMATCH"
  | "NOT_A_SIGNER"
  | "ESCROW_INSTRUCTION_COUNT"
  | "FOREIGN_INSTRUCTION"
  | "WRONG_INSTRUCTION"
  | "ACCOUNT_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "QUOTE_HASH_MISMATCH"
  | "TERMS_MISMATCH"
  | "REFUND_MISMATCH";

/** The transaction is not what the agent agreed to sign. */
export class GuardError extends Error {
  constructor(
    readonly code: GuardCode,
    message: string,
  ) {
    super(message);
    this.name = "GuardError";
  }
}

export interface ExpectedTier {
  secs_before: number;
  refund_bps: number;
}

/** Everything the agent agreed to, taken from the verified quote and the chosen option. */
export interface ExpectedCreate {
  kind: "create_booking";
  bookingId: Uint8Array;
  amount: bigint;
  checkinTs: bigint;
  checkoutTs: bigint;
  quoteHash: Uint8Array;
  optionIndex: number;
  tiers: readonly ExpectedTier[];
  quoteExpiresTs: bigint;
  /** `["hotel", uuidToBytes(quote.hotel_id)]`. */
  hotel: Address;
  mint: Address;
}

export type ExpectedAction =
  | ExpectedCreate
  | { kind: "cancel_booking"; bookingId: Uint8Array; minRefund: bigint };

export interface TxExpectations {
  /** `config.quote_signer` (= operator, the fee payer of every guest-facing tx). */
  feePayer: Address;
  /** The agent wallet that is about to sign. */
  signer: Address;
  action: ExpectedAction;
}

export interface InspectedTx {
  transaction: Transaction;
  /** `cancel_booking(min_refund)` argument, for cancels. */
  minRefund: bigint | null;
}

const equalBytes = (a: ArrayLike<number>, b: ArrayLike<number>) =>
  a.length === b.length && Array.prototype.every.call(a, (x: number, i: number) => x === b[i]);

const view = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);
const readU64 = (data: Uint8Array, offset: number) => view(data).getBigUint64(offset, true);
const readI64 = (data: Uint8Array, offset: number) => view(data).getBigInt64(offset, true);

/**
 * `CreateBookingArgs` (borsh, after the 8-byte discriminator): booking_id [u8;16] @8, amount u64 @24,
 * checkin_ts i64 @32, checkout_ts i64 @40, quote_hash [u8;32] @48, option_index u8 @80,
 * tiers Vec<{secs_before u32, refund_bps u16}> (u32 length @81), quote_expires_ts i64.
 */
function decodeCreateArgs(data: Uint8Array) {
  if (data.length < 85) throw new GuardError("WRONG_INSTRUCTION", "create_booking data is truncated.");
  const tierCount = view(data).getUint32(81, true);
  const end = 85 + tierCount * 6 + 8;
  if (tierCount > 8 || data.length !== end) {
    throw new GuardError("WRONG_INSTRUCTION", "create_booking data has an unexpected layout.");
  }
  const tiers = Array.from({ length: tierCount }, (_, i) => ({
    secs_before: view(data).getUint32(85 + i * 6, true),
    refund_bps: view(data).getUint16(85 + i * 6 + 4, true),
  }));
  return {
    bookingId: data.subarray(8, 24),
    amount: readU64(data, 24),
    checkinTs: readI64(data, 32),
    checkoutTs: readI64(data, 40),
    quoteHash: data.subarray(48, 80),
    optionIndex: data[80]!,
    tiers,
    quoteExpiresTs: readI64(data, end - 8),
  };
}

function checkCreate(
  data: Uint8Array,
  accounts: readonly { address: Address }[],
  feePayer: Address,
  want: ExpectedCreate,
): void {
  const got = decodeCreateArgs(data);
  if (!equalBytes(got.bookingId, want.bookingId)) {
    throw new GuardError("ACCOUNT_MISMATCH", "create_booking carries a different booking id than the quote.");
  }
  if (got.amount !== want.amount) {
    throw new GuardError("AMOUNT_MISMATCH", `create_booking would escrow ${got.amount} base units, but the chosen option costs ${want.amount}.`);
  }
  if (!equalBytes(got.quoteHash, want.quoteHash)) {
    throw new GuardError("QUOTE_HASH_MISMATCH", "create_booking references a different quote than the one verified.");
  }
  const sameTiers =
    got.tiers.length === want.tiers.length &&
    got.tiers.every((t, i) => t.secs_before === want.tiers[i]!.secs_before && t.refund_bps === want.tiers[i]!.refund_bps);
  if (
    !sameTiers ||
    got.optionIndex !== want.optionIndex ||
    got.checkinTs !== want.checkinTs ||
    got.checkoutTs !== want.checkoutTs ||
    got.quoteExpiresTs !== want.quoteExpiresTs
  ) {
    throw new GuardError("TERMS_MISMATCH", "create_booking would record different refund terms, option or dates than the verified quote.");
  }
  if (
    accounts[CREATE_ACCOUNTS.quoteSigner]?.address !== feePayer ||
    accounts[CREATE_ACCOUNTS.hotel]?.address !== want.hotel ||
    accounts[CREATE_ACCOUNTS.mint]?.address !== want.mint
  ) {
    throw new GuardError("ACCOUNT_MISMATCH", "create_booking uses a different quote signer, hotel or mint than the verified quote.");
  }
}

/** `["hotel", hotel_id]` for a quote's `hotel_id` UUID. */
export async function hotelPda(hotelIdBytes: Uint8Array): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: STUMARI_ESCROW_PROGRAM_ID,
    seeds: [new TextEncoder().encode("hotel"), hotelIdBytes],
  });
  return pda;
}

async function bookingPda(bookingId: Uint8Array): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: STUMARI_ESCROW_PROGRAM_ID,
    seeds: [new TextEncoder().encode("booking"), bookingId],
  });
  return pda;
}

/**
 * Decodes a server-built transaction and proves it is the one escrow action the agent asked
 * for before any signature is added: a v0 message without lookup tables, fee payer =
 * the configured quote signer, the agent among the required signers, exactly one
 * `stumari_escrow` instruction of the expected kind acting on the expected booking with the
 * expected arguments, and nothing else except compute-budget and operator-paid idempotent
 * ATA creation.
 */
export async function inspectEscrowTx(txBase64: string, expect: TxExpectations): Promise<InspectedTx> {
  let transaction: Transaction;
  let message: ReturnType<ReturnType<typeof getCompiledTransactionMessageDecoder>["decode"]>;
  try {
    transaction = getTransactionDecoder().decode(getBase64Encoder().encode(txBase64));
    message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  } catch {
    throw new GuardError("TX_DECODE_FAILED", "The API returned bytes that are not a Solana transaction.");
  }
  if (message.version !== 0) {
    throw new GuardError("UNSUPPORTED_TX_VERSION", `Expected a v0 transaction, got version ${String(message.version)}.`);
  }
  if ((message.addressTableLookups?.length ?? 0) > 0) {
    throw new GuardError("ADDRESS_LOOKUP_TABLES", "The transaction loads accounts from lookup tables; refusing to sign accounts that cannot be inspected.");
  }
  const feePayer = message.staticAccounts[0];
  if (feePayer !== expect.feePayer) {
    throw new GuardError("FEE_PAYER_MISMATCH", `Fee payer ${String(feePayer)} is not the Stumari quote signer ${expect.feePayer}.`);
  }
  if (!(expect.signer in transaction.signatures)) {
    throw new GuardError("NOT_A_SIGNER", `The transaction does not ask ${expect.signer} to sign.`);
  }

  const instructions = getInstructionsFromCompiledTransactionMessage(message);
  const escrow = instructions.filter((ix) => ix.programAddress === STUMARI_ESCROW_PROGRAM_ID);
  if (escrow.length !== 1) {
    throw new GuardError("ESCROW_INSTRUCTION_COUNT", `Expected exactly one stumari_escrow instruction, found ${escrow.length}.`);
  }
  for (const ix of instructions) {
    if (ix.programAddress === STUMARI_ESCROW_PROGRAM_ID || ix.programAddress === COMPUTE_BUDGET_PROGRAM) continue;
    const ataCreateByOperator =
      ix.programAddress === ATA_PROGRAM &&
      ix.data?.length === 1 &&
      ix.data[0] === ATA_CREATE_IDEMPOTENT &&
      ix.accounts?.[0]?.address === expect.feePayer;
    if (!ataCreateByOperator) {
      throw new GuardError("FOREIGN_INSTRUCTION", `The transaction contains an unexpected instruction for program ${ix.programAddress}.`);
    }
  }

  const ix = escrow[0]!;
  const data = Uint8Array.from(ix.data ?? []);
  const { kind } = expect.action;
  if (!equalBytes(data.subarray(0, 8), DISCRIMINATORS[kind])) {
    throw new GuardError("WRONG_INSTRUCTION", `The escrow instruction is not ${kind}.`);
  }
  const accounts = ix.accounts ?? [];
  const layout = LAYOUT[kind];
  if (accounts[layout.guest]?.address !== expect.signer) {
    throw new GuardError("ACCOUNT_MISMATCH", `The ${kind} instruction does not act for wallet ${expect.signer}.`);
  }
  if (accounts[layout.booking]?.address !== (await bookingPda(expect.action.bookingId))) {
    throw new GuardError("ACCOUNT_MISMATCH", `The ${kind} instruction targets a different booking account.`);
  }

  if (expect.action.kind === "create_booking") {
    checkCreate(data, accounts, expect.feePayer, expect.action);
    return { transaction, minRefund: null };
  }

  // cancel_booking(min_refund: u64) @8.
  if (data.length !== 16) throw new GuardError("WRONG_INSTRUCTION", "cancel_booking data has the wrong length.");
  const minRefund = readU64(data, 8);
  if (minRefund !== expect.action.minRefund) {
    throw new GuardError("REFUND_MISMATCH", `cancel_booking guarantees ${minRefund} base units, but the API quoted ${expect.action.minRefund}.`);
  }
  return { transaction, minRefund };
}
