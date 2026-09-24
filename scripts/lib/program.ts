/**
 * Upgradeable-loader account checks for `initialize_config`'s gate (escrow-program.md): the
 * Program account must point at ProgramData, whose upgrade authority must be the admin.
 */
import { getAddressDecoder, getAddressEncoder, fetchEncodedAccount, type Address } from "@solana/kit";
import { findProgramDataAddress, STUMARI_ESCROW_PROGRAM_ADDRESS } from "@stumari/escrow-client";
import type { SolanaRpc } from "./rpc";
import type { Surfnet } from "./surfnet";

export const BPF_LOADER_UPGRADEABLE = "BPFLoaderUpgradeab1e11111111111111111111111" as Address;
const PROGRAM_TAG = 2;
const PROGRAM_DATA_TAG = 3;
/** u32 tag + u64 slot + Option<Pubkey> (1 + 32): ELF bytes start here. */
const PROGRAM_DATA_HEADER = 45;

export interface ProgramState {
  programData: Address;
  /** Program account exists, is executable, owned by the loader and points at `programData`. */
  deployed: boolean;
  upgradeAuthority: Address | null;
  /** ProgramData holds exactly `so` (trailing zero padding allowed). */
  matches: boolean;
}

export async function readProgramState(rpc: SolanaRpc, so: Uint8Array): Promise<ProgramState> {
  const programData = await findProgramDataAddress();
  const program = await fetchEncodedAccount(rpc, STUMARI_ESCROW_PROGRAM_ADDRESS, { commitment: "confirmed" });
  const deployed =
    program.exists &&
    program.executable &&
    program.programAddress === BPF_LOADER_UPGRADEABLE &&
    program.data[0] === PROGRAM_TAG &&
    getAddressDecoder().decode(program.data.subarray(4, 36)) === programData;
  if (!deployed) return { programData, deployed, upgradeAuthority: null, matches: false };

  const data = await fetchEncodedAccount(rpc, programData, { commitment: "confirmed" });
  if (!data.exists || data.data[0] !== PROGRAM_DATA_TAG) return { programData, deployed: false, upgradeAuthority: null, matches: false };
  const bytes = data.data;
  const upgradeAuthority = bytes[12] === 1 ? getAddressDecoder().decode(bytes.subarray(13, 45)) : null;
  const elf = bytes.subarray(PROGRAM_DATA_HEADER);
  const matches =
    elf.length >= so.length && elf.subarray(0, so.length).every((b, i) => b === so[i]) && elf.subarray(so.length).every((b) => b === 0);
  return { programData, deployed, upgradeAuthority, matches };
}

/** Localnet repair: rewrites ProgramData's authority field in place with `surfnet_setAccount`. */
export async function forceUpgradeAuthority(rpc: SolanaRpc, surfnet: Surfnet, authority: Address): Promise<void> {
  const programData = await findProgramDataAddress();
  const account = await fetchEncodedAccount(rpc, programData, { commitment: "confirmed" });
  if (!account.exists) throw new Error(`ProgramData ${programData} missing`);
  const data = Uint8Array.from(account.data);
  data[12] = 1;
  data.set(getAddressEncoder().encode(authority), 13);
  await surfnet.setAccount(programData, {
    lamports: account.lamports,
    owner: BPF_LOADER_UPGRADEABLE,
    data,
    executable: false,
  });
}
