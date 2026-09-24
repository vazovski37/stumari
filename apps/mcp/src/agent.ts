import {
  type Address,
  createKeyPairFromBytes,
  getAddressFromPublicKey,
  getBase64EncodedWireTransaction,
  partiallySignTransaction,
} from "@solana/kit";
import { formatUsdc } from "@stumari/core";
import type { PublicConfig } from "./schemas";
import { type ExpectedAction, STUMARI_ESCROW_PROGRAM_ID, inspectEscrowTx } from "./tx-guard";

/** Why the agent key refused to sign (policy, not transaction contents). */
export class PolicyError extends Error {
  constructor(
    readonly code: "MAINNET_REFUSED" | "AMOUNT_OVER_AGENT_CAP" | "NO_QUOTE_SIGNER" | "PROGRAM_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "PolicyError";
  }
}

export interface SignRequest {
  config: PublicConfig;
  /** Money at stake: the option price for a booking, the booking amount for a cancel. */
  amountMinor: bigint;
  txBase64: string;
  action: ExpectedAction;
}

export interface SignedTx {
  txBase64: string;
  /** `cancel_booking(min_refund)` read from the signed bytes. */
  minRefund: bigint | null;
}

/**
 * The optional agent wallet (AGENT_SECRET_KEY, devnet demo). It signs only server-built escrow
 * transactions that pass every policy and transaction guard; the key never leaves this object.
 */
export class AgentWallet {
  private constructor(
    readonly address: Address,
    private readonly keyPair: CryptoKeyPair,
    readonly maxAmountMinor: bigint,
  ) {}

  static async fromSecretKey(secretKey: Uint8Array, maxAmountMinor: bigint): Promise<AgentWallet> {
    let keyPair: CryptoKeyPair;
    try {
      keyPair = await createKeyPairFromBytes(secretKey);
    } catch {
      throw new Error("AGENT_SECRET_KEY is not a valid Ed25519 keypair (public half does not match)");
    }
    return new AgentWallet(await getAddressFromPublicKey(keyPair.publicKey), keyPair, maxAmountMinor);
  }

  async sign(req: SignRequest): Promise<SignedTx> {
    const { config } = req;
    if (config.cluster === "mainnet-beta") {
      throw new PolicyError("MAINNET_REFUSED", "The agent key signs only on devnet or localnet; this API is on mainnet-beta. Sign with a wallet instead.");
    }
    if (config.program_id !== STUMARI_ESCROW_PROGRAM_ID) {
      throw new PolicyError("PROGRAM_MISMATCH", `The API reports program ${config.program_id}, not the Stumari escrow program ${STUMARI_ESCROW_PROGRAM_ID}.`);
    }
    if (config.quote_signer === null) {
      throw new PolicyError("NO_QUOTE_SIGNER", "The API has no quote signer configured.");
    }
    if (req.amountMinor > this.maxAmountMinor) {
      throw new PolicyError(
        "AMOUNT_OVER_AGENT_CAP",
        `${formatUsdc(req.amountMinor)} is above the agent signing cap of ${formatUsdc(this.maxAmountMinor)} (AGENT_MAX_AMOUNT_MINOR).`,
      );
    }
    const inspected = await inspectEscrowTx(req.txBase64, {
      feePayer: config.quote_signer as Address,
      signer: this.address,
      action: req.action,
    });
    const signed = await partiallySignTransaction([this.keyPair], inspected.transaction);
    return { txBase64: getBase64EncodedWireTransaction(signed), minRefund: inspected.minRefund };
  }
}
