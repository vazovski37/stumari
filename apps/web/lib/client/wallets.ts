/**
 * Wallet Standard, used directly (ADR-0009, api.md contract step 2): the server builds every
 * transaction; a wallet only signs bytes. Wallets exposing `solana:signTransaction` sign and we
 * relay via `/api/tx/send`; wallets exposing only `solana:signAndSendTransaction` send it
 * themselves and we record the signature via `/api/bookings/{id}/submitted`.
 */
import {
  createKeyPairSignerFromPrivateKeyBytes,
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
import {
  SolanaSignAndSendTransaction,
  SolanaSignMessage,
  SolanaSignTransaction,
  type SolanaSignAndSendTransactionFeature,
  type SolanaSignMessageFeature,
  type SolanaSignTransactionFeature,
} from "@solana/wallet-standard-features";
import { getWallets } from "@wallet-standard/app";
import type { IdentifierString, Wallet, WalletAccount } from "@wallet-standard/base";
import { StandardConnect, StandardDisconnect, type StandardConnectFeature, type StandardDisconnectFeature } from "@wallet-standard/features";
import type { PublicBookingView } from "../bookings/view";
import type { Cluster } from "../env-schema";
import { apiPost } from "./api";

export interface SubmitResult {
  signature: string | null;
  booking: PublicBookingView | null;
}

/** A connected wallet that can sign our server-built transactions. */
export interface ConnectedWallet {
  kind: "standard" | "demo";
  name: string;
  icon: string | null;
  address: string;
  /** Signs the server's bytes and gets them on-chain; resolves with the updated booking. */
  submit(txBase64: string, bookingId: string, onSigned?: () => void): Promise<SubmitResult>;
  /** Ed25519 signature over raw bytes (Sign-In With Solana, `solana:signMessage`). */
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  disconnect(): Promise<void>;
}

export const chainFor = (cluster: Cluster): IdentifierString => (cluster === "mainnet-beta" ? "solana:mainnet" : `solana:${cluster}`);

const canSign = (w: Wallet) => SolanaSignTransaction in w.features || SolanaSignAndSendTransaction in w.features;

/** Installed wallets that can connect and sign Solana transactions. */
export function signingWallets(): Wallet[] {
  return getWallets()
    .get()
    .filter((w) => StandardConnect in w.features && canSign(w) && w.chains.some((c) => c.startsWith("solana:")));
}

/** Calls `onChange` whenever wallets register or unregister; returns the unsubscribe function. */
export function watchWallets(onChange: () => void): () => void {
  const api = getWallets();
  const offRegister = api.on("register", onChange);
  const offUnregister = api.on("unregister", onChange);
  return () => {
    offRegister();
    offUnregister();
  };
}

const b64 = { toBytes: (s: string) => getBase64Encoder().encode(s), fromBytes: (b: Uint8Array) => getBase64Decoder().decode(b) };

async function relaySigned(signedBase64: string): Promise<SubmitResult> {
  const res = await apiPost<{ signature: string; booking: PublicBookingView | null }>("/api/tx/send", { tx: signedBase64 });
  return { signature: res.signature, booking: res.booking };
}

export async function connectStandardWallet(wallet: Wallet, cluster: Cluster): Promise<ConnectedWallet> {
  const { connect } = (wallet.features as StandardConnectFeature)[StandardConnect];
  const { accounts } = await connect();
  const account: WalletAccount | undefined = accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0];
  if (!account) throw new Error(`${wallet.name} did not share an account`);
  const chain = chainFor(cluster);
  // Wallets that do not list this cluster (e.g. localnet) sign without a chain hint.
  const chainHint = account.chains.includes(chain) ? chain : undefined;
  const features = wallet.features as Partial<
    SolanaSignTransactionFeature & SolanaSignAndSendTransactionFeature & SolanaSignMessageFeature & StandardDisconnectFeature
  >;

  async function submit(txBase64: string, bookingId: string, onSigned?: () => void): Promise<SubmitResult> {
    const transaction = new Uint8Array(b64.toBytes(txBase64));
    const signer = features[SolanaSignTransaction];
    if (signer) {
      const [out] = await signer.signTransaction({ account: account!, transaction, ...(chainHint ? { chain: chainHint } : {}) });
      if (!out) throw new Error("The wallet returned no transaction");
      onSigned?.();
      return relaySigned(b64.fromBytes(out.signedTransaction));
    }
    const sender = features[SolanaSignAndSendTransaction];
    if (!sender) throw new Error(`${wallet.name} cannot sign Solana transactions`);
    const [out] = await sender.signAndSendTransaction({ account: account!, transaction, chain: chainHint ?? chain });
    if (!out) throw new Error("The wallet returned no signature");
    onSigned?.();
    const signature = getBase58Decoder().decode(out.signature);
    const booking = await apiPost<PublicBookingView>(`/api/bookings/${bookingId}/submitted`, { signature });
    return { signature, booking };
  }

  return {
    kind: "standard",
    name: wallet.name,
    icon: wallet.icon ?? null,
    address: account.address,
    submit,
    signMessage: async (message) => {
      const signer = features[SolanaSignMessage];
      if (!signer) throw new Error(`${wallet.name} cannot sign messages; use another wallet to sign in`);
      const [out] = await signer.signMessage({ account: account!, message });
      if (!out) throw new Error("The wallet returned no signature");
      return out.signature;
    },
    disconnect: async () => {
      await features[StandardDisconnect]?.disconnect();
    },
  };
}

// ---------------------------------------------------------------- demo wallet (ADR-0009)

export const DEMO_KEY = "stumari_demo_sk";
export const DEMO_LABEL = "Test wallet — test USDC, not real money";

const hex = {
  from: (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
  to: (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => Number.parseInt(h, 16)),
};

function storedDemoKey(): Uint8Array | null {
  try {
    const value = localStorage.getItem(DEMO_KEY);
    return value && /^[0-9a-f]{64}$/.test(value) ? hex.to(value) : null;
  } catch {
    return null;
  }
}

export const hasDemoWallet = () => storedDemoKey() !== null;

/** 32 random bytes in localStorage (demo mode only); created on first use. */
async function demoSigner(): Promise<KeyPairSigner> {
  let secret = storedDemoKey();
  if (!secret) {
    secret = crypto.getRandomValues(new Uint8Array(32));
    try {
      localStorage.setItem(DEMO_KEY, hex.from(secret));
    } catch {
      // Private windows may refuse storage: the wallet then lives for this page only.
    }
  }
  return createKeyPairSignerFromPrivateKeyBytes(secret);
}

/** Decodes the server's transaction, adds the demo wallet's signature, re-encodes it. */
export async function demoSign(signer: KeyPairSigner, txBase64: string): Promise<string> {
  const tx = getTransactionDecoder().decode(b64.toBytes(txBase64)) as Transaction & TransactionWithinSizeLimit & TransactionWithLifetime;
  const [signatures] = await signer.signTransactions([tx]);
  const signed: Transaction = { ...tx, signatures: { ...tx.signatures, ...signatures } };
  return b64.fromBytes(new Uint8Array(getTransactionEncoder().encode(signed)));
}

export async function connectDemoWallet(): Promise<ConnectedWallet> {
  const signer = await demoSigner();
  return {
    kind: "demo",
    name: DEMO_LABEL,
    icon: null,
    address: signer.address,
    submit: async (txBase64, _bookingId, onSigned) => {
      const signed = await demoSign(signer, txBase64);
      onSigned?.();
      return relaySigned(signed);
    },
    signMessage: async (message) => new Uint8Array(await signBytes(signer.keyPair.privateKey, message)),
    disconnect: async () => {},
  };
}
