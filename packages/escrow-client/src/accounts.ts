import {
  fetchEncodedAccount,
  type Address,
  type Commitment,
  type GetAccountInfoApi,
  type ReadonlyUint8Array,
  type Rpc,
} from "@solana/kit";
import { BOOKING_STATUS_CODES, bytesToHex, type BookingStatus, type Tier } from "@stumari/core";
import {
  BOOKING_DISCRIMINATOR,
  CONFIG_DISCRIMINATOR,
  HOTEL_DISCRIMINATOR,
  getBookingDecoder,
  getConfigDecoder,
  getHotelDecoder,
  type Booking,
  type Config,
  type Hotel,
} from "./generated/accounts";
import { STUMARI_ESCROW_PROGRAM_ADDRESS } from "./generated/programs";
import { findBookingPda, findConfigPda, findHotelPda } from "./pdas";

export type AccountRpc = Rpc<GetAccountInfoApi>;
export interface FetchOptions {
  commitment?: Commitment;
}

export type ConfigView = Omit<Config, "discriminator"> & { address: Address };
export type HotelView = Omit<Hotel, "discriminator" | "hotelId"> & { address: Address; hotelId: Uint8Array };

/** A Booking account in domain terms: status name, bigint money, tiers in @stumari/core shape. */
export interface BookingView {
  address: Address;
  bookingId: Uint8Array;
  /** `bookings.id` / public URL form (32 lowercase hex). */
  bookingIdHex: string;
  hotel: Address;
  hotelAuthority: Address;
  guest: Address;
  rentPayer: Address;
  mint: Address;
  amount: bigint;
  feeBps: number;
  checkinTs: bigint;
  checkoutTs: bigint;
  createdTs: bigint;
  confirmDeadlineTs: bigint;
  releaseAfterTs: bigint;
  quoteHash: Uint8Array;
  optionIndex: number;
  /** Only the first `tier_count` entries. */
  tiers: Tier[];
  status: BookingStatus;
  refundAmount: bigint;
  hotelAmount: bigint;
  feeAmount: bigint;
  /** 0 while open. */
  closedTs: bigint;
}

/** Thrown when an address holds something other than the expected escrow account (RPC lies, wrong address). */
export class AccountValidationError extends Error {
  constructor(
    readonly account: Address,
    reason: string,
  ) {
    super(`${account}: ${reason}`);
    this.name = "AccountValidationError";
  }
}

const STATUS_BY_CODE = new Map<number, BookingStatus>(
  Object.entries(BOOKING_STATUS_CODES).map(([name, code]) => [code, name as BookingStatus]),
);

const copy = (bytes: ReadonlyUint8Array): Uint8Array => Uint8Array.from(bytes);

export function toBookingView(address: Address, booking: Booking): BookingView {
  const status = STATUS_BY_CODE.get(booking.status);
  if (status === undefined) throw new AccountValidationError(address, `unknown booking status ${booking.status}`);
  if (booking.tierCount < 1 || booking.tierCount > booking.tiers.length) {
    throw new AccountValidationError(address, `tier_count ${booking.tierCount} out of range`);
  }
  const bookingId = copy(booking.bookingId);
  return {
    address,
    bookingId,
    bookingIdHex: bytesToHex(bookingId),
    hotel: booking.hotel,
    hotelAuthority: booking.hotelAuthority,
    guest: booking.guest,
    rentPayer: booking.rentPayer,
    mint: booking.mint,
    amount: booking.amount,
    feeBps: booking.feeBps,
    checkinTs: booking.checkinTs,
    checkoutTs: booking.checkoutTs,
    createdTs: booking.createdTs,
    confirmDeadlineTs: booking.confirmDeadlineTs,
    releaseAfterTs: booking.releaseAfterTs,
    quoteHash: copy(booking.quoteHash),
    optionIndex: booking.optionIndex,
    tiers: booking.tiers
      .slice(0, booking.tierCount)
      .map((t) => ({ secs_before: t.secsBefore, refund_bps: t.refundBps })),
    status,
    refundAmount: booking.refundAmount,
    hotelAmount: booking.hotelAmount,
    feeAmount: booking.feeAmount,
    closedTs: booking.closedTs,
  };
}

/** Fetches raw data, or null if the account does not exist; rejects foreign owners and discriminators. */
async function fetchVerified(
  rpc: AccountRpc,
  account: Address,
  discriminator: ReadonlyUint8Array,
  options: FetchOptions,
): Promise<Uint8Array | null> {
  const encoded = await fetchEncodedAccount(rpc, account, { commitment: options.commitment ?? "confirmed" });
  if (!encoded.exists) return null;
  if (encoded.programAddress !== STUMARI_ESCROW_PROGRAM_ADDRESS) {
    throw new AccountValidationError(account, `owned by ${encoded.programAddress}, not the escrow program`);
  }
  const data = copy(encoded.data);
  if (!discriminator.every((b, i) => data[i] === b)) {
    throw new AccountValidationError(account, "account discriminator does not match");
  }
  return data;
}

function decode<T>(account: Address, decodeData: () => T): T {
  try {
    return decodeData();
  } catch (e) {
    throw new AccountValidationError(account, `malformed account data (${e instanceof Error ? e.message : String(e)})`);
  }
}

async function assertPda(account: Address, expected: Promise<Address>): Promise<void> {
  if ((await expected) !== account) throw new AccountValidationError(account, "address is not the account's PDA");
}

function required<T>(value: T | null, account: Address): T {
  if (value === null) throw new AccountValidationError(account, "account does not exist");
  return value;
}

export async function fetchMaybeConfig(rpc: AccountRpc, options: FetchOptions = {}): Promise<ConfigView | null> {
  const account = await findConfigPda();
  const data = await fetchVerified(rpc, account, CONFIG_DISCRIMINATOR, options);
  if (data === null) return null;
  const { discriminator: _, ...config } = decode(account, () => getConfigDecoder().decode(data));
  return { address: account, ...config };
}

export async function fetchConfig(rpc: AccountRpc, options: FetchOptions = {}): Promise<ConfigView> {
  return required(await fetchMaybeConfig(rpc, options), await findConfigPda());
}

export async function fetchMaybeHotel(
  rpc: AccountRpc,
  account: Address,
  options: FetchOptions = {},
): Promise<HotelView | null> {
  const data = await fetchVerified(rpc, account, HOTEL_DISCRIMINATOR, options);
  if (data === null) return null;
  const { discriminator: _, hotelId, ...hotel } = decode(account, () => getHotelDecoder().decode(data));
  await assertPda(account, findHotelPda(copy(hotelId)));
  return { address: account, hotelId: copy(hotelId), ...hotel };
}

export async function fetchHotel(rpc: AccountRpc, account: Address, options: FetchOptions = {}): Promise<HotelView> {
  return required(await fetchMaybeHotel(rpc, account, options), account);
}

export async function fetchMaybeBooking(
  rpc: AccountRpc,
  account: Address,
  options: FetchOptions = {},
): Promise<BookingView | null> {
  const data = await fetchVerified(rpc, account, BOOKING_DISCRIMINATOR, options);
  if (data === null) return null;
  const booking = decode(account, () => getBookingDecoder().decode(data));
  await assertPda(account, findBookingPda(copy(booking.bookingId)));
  return toBookingView(account, booking);
}

export async function fetchBooking(
  rpc: AccountRpc,
  account: Address,
  options: FetchOptions = {},
): Promise<BookingView> {
  return required(await fetchMaybeBooking(rpc, account, options), account);
}
