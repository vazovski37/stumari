/** Kit RPC helpers: send operator-signed instructions, read balances and the chain clock. */
import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  fetchEncodedAccount,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type Signature,
  type TransactionSigner,
} from "@solana/kit";
import { fetchMaybeToken } from "@solana-program/token";
import { sendAndConfirm } from "@stumari/escrow-client";

export type SolanaRpc = ReturnType<typeof createSolanaRpc>;

export const connect = (url: string): SolanaRpc => createSolanaRpc(url);

const CLOCK_SYSVAR = "SysvarC1ock11111111111111111111111111111111" as Address;
export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** v0 transaction, `feePayer` pays; every signer is embedded in the instructions. */
export async function sendInstructions(
  rpc: SolanaRpc,
  feePayer: TransactionSigner,
  instructions: readonly Instruction[],
): Promise<Signature> {
  const { value: lifetime } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const tx = await signTransactionMessageWithSigners(message);
  const { signature } = await sendAndConfirm(rpc, getBase64EncodedWireTransaction(tx), {
    lastValidBlockHeight: lifetime.lastValidBlockHeight,
    timeoutMs: 60_000,
  });
  return signature;
}

export async function lamports(rpc: SolanaRpc, account: Address): Promise<bigint> {
  return (await rpc.getBalance(account, { commitment: "confirmed" }).send()).value;
}

/** Token balance of a token account; 0 when it does not exist. */
export async function tokenBalance(rpc: SolanaRpc, tokenAccount: Address): Promise<bigint> {
  const account = await fetchMaybeToken(rpc, tokenAccount, { commitment: "confirmed" });
  return account.exists ? account.data.amount : 0n;
}

export async function accountExists(rpc: SolanaRpc, account: Address): Promise<boolean> {
  return (await fetchEncodedAccount(rpc, account, { commitment: "confirmed" })).exists;
}

/** `Clock.unix_timestamp` — differs from wall time on a surfnet after time travel. */
export async function chainNow(rpc: SolanaRpc): Promise<bigint> {
  const clock = await fetchEncodedAccount(rpc, CLOCK_SYSVAR, { commitment: "confirmed" });
  if (!clock.exists) throw new Error("Clock sysvar not found");
  return new DataView(clock.data.buffer, clock.data.byteOffset).getBigInt64(32, true);
}

export const formatSol = (value: bigint) =>
  `${value / LAMPORTS_PER_SOL}.${(value % LAMPORTS_PER_SOL).toString().padStart(9, "0").slice(0, 4)} SOL`;
