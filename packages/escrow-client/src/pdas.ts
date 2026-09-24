import { address, getAddressEncoder, getProgramDerivedAddress, type Address } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  findConfigPda as findGeneratedConfigPda,
  findHotelPda as findGeneratedHotelPda,
  findVaultPda as findGeneratedVaultPda,
} from "./generated/pdas";
import { BOOKING_SEED } from "./generated/constants";
import { STUMARI_ESCROW_PROGRAM_ADDRESS } from "./generated/programs";

const BPF_LOADER_UPGRADEABLE = address("BPFLoaderUpgradeab1e11111111111111111111111");
const ID_LENGTH = 16;

function assertId(bytes: Uint8Array, what: string): void {
  if (bytes.length !== ID_LENGTH) throw new Error(`${what} must be ${ID_LENGTH} bytes, got ${bytes.length}`);
}

/** `["config"]` — the singleton Config account. */
export async function findConfigPda(): Promise<Address> {
  const [pda] = await findGeneratedConfigPda();
  return pda;
}

/** `["hotel", hotel_id]`; `hotelId` = `uuidToBytes(hotels.id)` from @stumari/core. */
export async function findHotelPda(hotelId: Uint8Array): Promise<Address> {
  assertId(hotelId, "hotel_id");
  const [pda] = await findGeneratedHotelPda({ hotelId });
  return pda;
}

/** `["booking", booking_id]`; `bookingId` = `deriveBookingId(quote.id)` from @stumari/core. */
export async function findBookingPda(bookingId: Uint8Array): Promise<Address> {
  assertId(bookingId, "booking_id");
  const [pda] = await getProgramDerivedAddress({
    programAddress: STUMARI_ESCROW_PROGRAM_ADDRESS,
    seeds: [BOOKING_SEED, bookingId],
  });
  return pda;
}

/** `["vault", booking]` — the booking's token account. */
export async function findVaultPda(booking: Address): Promise<Address> {
  const [pda] = await findGeneratedVaultPda({ booking });
  return pda;
}

/** Associated token account of `owner` for `mint` under classic SPL Token (the only token program accepted). */
export async function findAta(owner: Address, mint: Address): Promise<Address> {
  const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  return ata;
}

/** The program's ProgramData account (upgradeable loader), required by `initialize_config`. */
export async function findProgramDataAddress(): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: BPF_LOADER_UPGRADEABLE,
    seeds: [getAddressEncoder().encode(STUMARI_ESCROW_PROGRAM_ADDRESS)],
  });
  return pda;
}
