import "server-only";
import { createKeyPairSignerFromBytes, createSolanaRpc, type Address, type KeyPairSigner } from "@solana/kit";
import { ApiError } from "../api/errors";
import { serverEnv } from "../env";
import type { ServerEnv } from "../env-schema";
import { programIdProblem } from "./program-id";

export type SolanaRpc = ReturnType<typeof createSolanaRpc>;

/** Everything a chain feature needs; built once per process. */
export interface Chain {
  env: ServerEnv;
  rpc: SolanaRpc;
  /** Fee payer, rent payer, quote signer. */
  operator: KeyPairSigner;
  operatorSecret: Uint8Array;
  /** Arbiter stub (devnet: the operator). */
  admin: KeyPairSigner;
  mint: Address;
}

const globalForChain = globalThis as typeof globalThis & { stumariChain?: Promise<Chain> };

async function createChain(env: ServerEnv): Promise<Chain> {
  const problem = programIdProblem(env.programId);
  if (problem) throw new ApiError(503, "PROGRAM_ID_MISMATCH", problem);
  if (!env.operator || !env.admin || !env.mint) {
    throw new ApiError(503, "CHAIN_NOT_CONFIGURED", "Payments are not configured yet (operator key or mint missing)");
  }
  const operator = await createKeyPairSignerFromBytes(env.operator.secretKey);
  const admin =
    env.admin.publicKey === env.operator.publicKey ? operator : await createKeyPairSignerFromBytes(env.admin.secretKey);
  return {
    env,
    rpc: createSolanaRpc(env.rpcUrl),
    operator,
    operatorSecret: env.operator.secretKey,
    admin,
    mint: env.mint as Address,
  };
}

/** The chain context, or a 503 `ApiError` when the Solana settings are missing or inconsistent. */
export function chain(): Promise<Chain> {
  const pending = (globalForChain.stumariChain ??= createChain(serverEnv()));
  // A failed setup is not cached, so fixing the environment and restarting is not the only way out.
  pending.catch(() => {
    if (globalForChain.stumariChain === pending) globalForChain.stumariChain = undefined;
  });
  return pending;
}

/** Addresses that belong to our own keys: never accepted as a guest wallet (security backlog). */
export function serverKeyAddresses(c: Pick<Chain, "operator" | "admin">): Set<string> {
  return new Set([c.operator.address, c.admin.address]);
}
