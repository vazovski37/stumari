/**
 * Relay side of "server builds, wallet signs" (api.md `POST /api/tx/send`): decode what the
 * wallet returned, verify every signature, send and confirm by polling (no websockets).
 */
import {
  getBase58Decoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getPublicKeyFromAddress,
  getTransactionDecoder,
  signature as toSignature,
  verifySignature,
  type Address,
  type Base64EncodedWireTransaction,
  type Commitment,
  type GetBlockHeightApi,
  type GetSignatureStatusesApi,
  type Rpc,
  type SendTransactionApi,
  type Signature,
  type SignatureBytes,
  type SimulateTransactionApi,
} from "@solana/kit";
import type { BuiltTx } from "./build";
import { EscrowTxError, parseTransactionError, type TxFailure } from "./errors";
import { sha256Hex } from "./hash";

export interface WireSigner {
  address: Address;
  /** Null when this required signer has not signed yet. */
  signature: SignatureBytes | null;
}

export interface DecodedWireTx {
  /** Static account 0 — must be the operator for `/api/tx/send`. */
  feePayer: Address;
  messageBytes: Uint8Array;
  /** sha256(messageBytes), the `built_txs` lookup key. */
  messageHashHex: string;
  /** Every required signer in message order (the fee payer first). */
  signers: WireSigner[];
  /** Program id of each instruction, in order. */
  programIds: Address[];
  version: "legacy" | 0 | 1;
  /** Recent blockhash (or durable nonce value). */
  lifetimeToken: string;
}

export async function decodeWireTx(txBase64: string): Promise<DecodedWireTx> {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(txBase64));
  const messageBytes = Uint8Array.from(tx.messageBytes);
  const message = getCompiledTransactionMessageDecoder().decode(messageBytes);
  const programIndexes =
    message.version === 1
      ? message.instructionHeaders.map((h) => h.programAccountIndex)
      : message.instructions.map((ix) => ix.programAddressIndex);
  const programIds = programIndexes.map((i) => {
    const id = message.staticAccounts[i];
    if (id === undefined) throw new Error(`instruction program index ${i} is not a static account`);
    return id;
  });
  const feePayer = message.staticAccounts[0];
  if (feePayer === undefined) throw new Error("transaction has no accounts");
  return {
    feePayer,
    messageBytes,
    messageHashHex: await sha256Hex(messageBytes),
    signers: Object.entries(tx.signatures).map(([address, signature]) => ({
      address: address as Address,
      signature: signature ?? null,
    })),
    programIds,
    version: message.version,
    lifetimeToken: message.lifetimeToken,
  };
}

export interface SignatureCheck {
  valid: boolean;
  /** Required signers without a signature. */
  missing: Address[];
  /** Signatures that do not verify over the message (e.g. the wallet changed the transaction). */
  invalid: Address[];
}

/** Ed25519-verifies every required signature over the message bytes. */
export async function verifySignatures(tx: DecodedWireTx | string): Promise<SignatureCheck> {
  const decoded = typeof tx === "string" ? await decodeWireTx(tx) : tx;
  const missing: Address[] = [];
  const invalid: Address[] = [];
  for (const { address, signature } of decoded.signers) {
    if (signature === null) {
      missing.push(address);
    } else if (!(await verifySignature(await getPublicKeyFromAddress(address), signature, decoded.messageBytes))) {
      invalid.push(address);
    }
  }
  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export type RelayRpc = Rpc<SendTransactionApi & SimulateTransactionApi & GetSignatureStatusesApi & GetBlockHeightApi>;

export interface SendOptions {
  /** Give up polling after this long (default 30 000 ms). */
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Default `confirmed`. */
  commitment?: Exclude<Commitment, "processed">;
  /** When known, stop early once the blockhash has expired. */
  lastValidBlockHeight?: bigint;
}

export interface SendResult {
  signature: Signature;
  slot: bigint;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const failure = (name: string, message: string): TxFailure => ({
  code: null,
  name,
  message,
  instructionIndex: null,
  logs: [],
});

/**
 * Preflight, send, then poll `getSignatureStatuses` until `commitment`. The preflight is an
 * explicit signature-verifying simulation (then `skipPreflight`) so a failure keeps the raw
 * `TransactionError` and logs, which name the program error. Relaying a transaction that already
 * landed (a retried request) is not an error: it goes straight to polling.
 */
export async function sendAndConfirm(rpc: RelayRpc, txBase64: string, options: SendOptions = {}): Promise<SendResult> {
  const { timeoutMs = 30_000, pollIntervalMs = 500, commitment = "confirmed" } = options;
  const wire = txBase64 as Base64EncodedWireTransaction;
  const decoded = await decodeWireTx(wire);
  const feePayerSignature = decoded.signers[0]?.signature;
  if (!feePayerSignature) throw new EscrowTxError("send", failure("MissingSignature", "fee payer has not signed"));
  const signature = toSignature(getBase58Decoder().decode(feePayerSignature));

  const { value: preflight } = await rpc
    .simulateTransaction(wire, { encoding: "base64", sigVerify: true, commitment: "confirmed" })
    .send();
  const alreadyProcessed = preflight.err === "AlreadyProcessed";
  if (preflight.err && !alreadyProcessed) {
    throw new EscrowTxError(
      "send",
      parseTransactionError(preflight.err, { logs: preflight.logs, programIds: decoded.programIds }),
    );
  }
  if (!alreadyProcessed) {
    try {
      await rpc.sendTransaction(wire, { encoding: "base64", skipPreflight: true }).send();
    } catch (e) {
      throw new EscrowTxError("send", parseTransactionError(e));
    }
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status?.err) {
      throw new EscrowTxError("confirm", parseTransactionError(status.err, { programIds: decoded.programIds }));
    }
    if (status && (status.confirmationStatus === commitment || status.confirmationStatus === "finalized")) {
      return { signature, slot: status.slot };
    }
    if (!status && options.lastValidBlockHeight !== undefined) {
      const height = await rpc.getBlockHeight({ commitment }).send();
      if (height > options.lastValidBlockHeight) {
        throw new EscrowTxError(
          "expired",
          failure("BlockhashExpired", `${signature} did not land before its blockhash expired`),
        );
      }
    }
    await sleep(pollIntervalMs);
  }
  throw new EscrowTxError(
    "timeout",
    failure("ConfirmationTimeout", `${signature} not ${commitment} after ${timeoutMs} ms`),
  );
}

/** Sends a transaction our keys signed completely (confirm, release, admin operations). */
export async function sendBuiltTx(rpc: RelayRpc, built: BuiltTx, options: SendOptions = {}): Promise<SendResult> {
  if (built.requiredSigner !== null) {
    throw new Error(`transaction still needs a signature from ${built.requiredSigner}`);
  }
  return sendAndConfirm(rpc, built.txBase64, { lastValidBlockHeight: built.lastValidBlockHeight, ...options });
}
