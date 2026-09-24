import "server-only";
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type Signature,
} from "@solana/kit";
import { sendAndConfirm } from "@stumari/escrow-client";
import type { Chain } from "./context";

/** Sends instructions signed only by our keys (faucet mint), operator as fee payer. */
export async function sendOperatorInstructions(c: Chain, instructions: readonly Instruction[]): Promise<Signature> {
  const { value: lifetime } = await c.rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(c.operator, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const tx = await signTransactionMessageWithSigners(message);
  const { signature } = await sendAndConfirm(c.rpc, getBase64EncodedWireTransaction(tx), {
    lastValidBlockHeight: lifetime.lastValidBlockHeight,
  });
  return signature;
}
