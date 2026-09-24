/**
 * The mock USDC mint (6 decimals, operator = mint authority). Its address is derived from the
 * operator with a fixed seed (`createAccountWithSeed`), so every cluster and every localnet
 * reset gets the same mint without storing another keypair.
 */
import { createAddressWithSeed, fetchEncodedAccount, type Address, type TransactionSigner } from "@solana/kit";
import { getCreateAccountWithSeedInstruction } from "@solana-program/system";
import {
  fetchMaybeMint,
  getCreateAssociatedTokenIdempotentInstruction,
  getInitializeMint2Instruction,
  getMintSize,
  getMintToCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { USDC_DECIMALS } from "@stumari/core";
import { findAta } from "@stumari/escrow-client";
import { sendInstructions, type SolanaRpc } from "./rpc";

const MOCK_USDC_SEED = "stumari-mock-usdc-v1";

export const mockMintAddress = (operator: Address) =>
  createAddressWithSeed({ baseAddress: operator, programAddress: TOKEN_PROGRAM_ADDRESS, seed: MOCK_USDC_SEED });

/** Creates the operator's mock USDC mint unless it exists; refuses a foreign or mis-shaped mint. */
export async function ensureMockMint(rpc: SolanaRpc, operator: TransactionSigner): Promise<{ mint: Address; created: boolean }> {
  const mint = await mockMintAddress(operator.address);
  const existing = await fetchMaybeMint(rpc, mint, { commitment: "confirmed" });
  if (existing.exists) {
    await assertMintAuthority(rpc, mint, operator.address);
    return { mint, created: false };
  }
  const space = BigInt(getMintSize());
  const rent = await rpc.getMinimumBalanceForRentExemption(space).send();
  await sendInstructions(rpc, operator, [
    getCreateAccountWithSeedInstruction({
      payer: operator,
      newAccount: mint,
      base: operator.address,
      seed: MOCK_USDC_SEED,
      amount: rent,
      space,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeMint2Instruction({ mint, decimals: USDC_DECIMALS, mintAuthority: operator.address }),
  ]);
  return { mint, created: true };
}

/** A mint the operator can mint from, with 6 decimals (the config mint may predate this script). */
export async function assertMintAuthority(rpc: SolanaRpc, mint: Address, operator: Address): Promise<void> {
  const account = await fetchMaybeMint(rpc, mint, { commitment: "confirmed" });
  if (!account.exists) throw new Error(`mint ${mint} does not exist`);
  const authority = account.data.mintAuthority;
  if (authority.__option !== "Some" || authority.value !== operator) {
    throw new Error(`mint ${mint}: the operator ${operator} is not its mint authority`);
  }
  if (account.data.decimals !== USDC_DECIMALS) throw new Error(`mint ${mint} has ${account.data.decimals} decimals, expected 6`);
}

/** The owner's ATA, created (operator pays) when missing. */
export async function ensureAta(
  rpc: SolanaRpc,
  operator: TransactionSigner,
  owner: Address,
  mint: Address,
): Promise<{ ata: Address; created: boolean }> {
  const ata = await findAta(owner, mint);
  const created = !(await fetchEncodedAccount(rpc, ata, { commitment: "confirmed" })).exists;
  if (created) {
    await sendInstructions(rpc, operator, [getCreateAssociatedTokenIdempotentInstruction({ payer: operator, ata, owner, mint })]);
  }
  return { ata, created };
}

/** Mints `amount` base units to the owner's ATA (created idempotently in the same transaction). */
export async function mintTo(rpc: SolanaRpc, operator: TransactionSigner, mint: Address, owner: Address, amount: bigint) {
  const ata = await findAta(owner, mint);
  const signature = await sendInstructions(rpc, operator, [
    getCreateAssociatedTokenIdempotentInstruction({ payer: operator, ata, owner, mint }),
    getMintToCheckedInstruction({ mint, token: ata, mintAuthority: operator, amount, decimals: USDC_DECIMALS }),
  ]);
  return { ata, signature };
}
