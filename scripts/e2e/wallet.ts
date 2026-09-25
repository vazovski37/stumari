/** What a browser wallet does, done with a local keypair: sign server-built transactions and SIWS messages. */
import assert from "node:assert/strict";
import {
  getBase58Decoder,
  getBase64Decoder,
  getBase64Encoder,
  getTransactionDecoder,
  getTransactionEncoder,
  signBytes,
  type KeyPairSigner,
  type Transaction,
  type TransactionWithinSizeLimit,
  type TransactionWithLifetime,
} from "@solana/kit";
import type { Http } from "./http";

/** `solana:signTransaction`: bytes in, the same message with this wallet's signature merged, bytes out. */
export async function walletSign(signer: KeyPairSigner, txBase64: string): Promise<string> {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(txBase64)) as Transaction &
    TransactionWithinSizeLimit &
    TransactionWithLifetime;
  assert.ok(signer.address in tx.signatures, `${signer.address} is not a signer of this transaction`);
  const [signatures] = await signer.signTransactions([tx]);
  return getBase64Decoder().decode(getTransactionEncoder().encode({ ...tx, signatures: { ...tx.signatures, ...signatures } }));
}

/** Sign-In With Solana (api.md "Auth"): nonce → sign the exact message → verify sets the session cookie. */
export async function signIn(http: Http, signer: KeyPairSigner): Promise<{ wallet: string; is_admin: boolean }> {
  const { message } = await http.ok<{ nonce: string; message: string }>("GET", `/api/auth/nonce?wallet=${signer.address}`);
  const signature = await signBytes(signer.keyPair.privateKey, new TextEncoder().encode(message));
  return http.ok("POST", "/api/auth/verify", { wallet: signer.address, message, signature: getBase58Decoder().decode(signature) });
}
