"use client";

import type { Wallet } from "@wallet-standard/base";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiPost } from "@/lib/client/api";
import {
  connectDemoWallet,
  connectStandardWallet,
  hasDemoWallet,
  signingWallets,
  watchWallets,
  type ConnectedWallet,
} from "@/lib/client/wallets";
import type { Cluster } from "@/lib/env-schema";
import { WalletPicker } from "./wallet-picker";

export interface WalletConfig {
  cluster: Cluster;
  demoMode: boolean;
}

interface WalletContextValue {
  config: WalletConfig;
  wallets: Wallet[];
  connected: ConnectedWallet | null;
  connect(target: Wallet | "demo"): Promise<ConnectedWallet>;
  disconnect(): Promise<void>;
  /** The connected wallet, or opens the picker and resolves once one connects (rejects if closed). */
  requireWallet(): Promise<ConnectedWallet>;
  openPicker(): void;
  /** Demo mode: mints 500 test USDC to the demo wallet; returns the new balance in base units. */
  fundDemoWallet(): Promise<bigint>;
  demoBalance: bigint | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);
const LAST_WALLET = "stumari_wallet";

function remember(value: string | null) {
  try {
    if (value) localStorage.setItem(LAST_WALLET, value);
    else localStorage.removeItem(LAST_WALLET);
  } catch {
    // Storage is a convenience only.
  }
}

function remembered(): string | null {
  try {
    return localStorage.getItem(LAST_WALLET);
  } catch {
    return null;
  }
}

export function WalletProvider({ config, children }: { config: WalletConfig; children: ReactNode }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [connected, setConnected] = useState<ConnectedWallet | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [demoBalance, setDemoBalance] = useState<bigint | null>(null);
  const waiting = useRef<{ resolve: (w: ConnectedWallet) => void; reject: (e: Error) => void } | null>(null);

  useEffect(() => {
    const refresh = () => setWallets(signingWallets());
    refresh();
    return watchWallets(refresh);
  }, []);

  const connect = useCallback(
    async (target: Wallet | "demo") => {
      const wallet = target === "demo" ? await connectDemoWallet() : await connectStandardWallet(target, config.cluster);
      setConnected(wallet);
      remember(target === "demo" ? "demo" : target.name);
      setPickerOpen(false);
      waiting.current?.resolve(wallet);
      waiting.current = null;
      return wallet;
    },
    [config.cluster],
  );

  // Reconnect the demo wallet silently; a Wallet Standard wallet asks again on first use.
  useEffect(() => {
    if (config.demoMode && remembered() === "demo" && hasDemoWallet()) {
      connectDemoWallet().then(setConnected, () => remember(null));
    }
  }, [config.demoMode]);

  const disconnect = useCallback(async () => {
    await connected?.disconnect().catch(() => {});
    setConnected(null);
    setDemoBalance(null);
    remember(null);
  }, [connected]);

  const requireWallet = useCallback(() => {
    if (connected) return Promise.resolve(connected);
    setPickerOpen(true);
    return new Promise<ConnectedWallet>((resolve, reject) => {
      waiting.current?.reject(new Error("Wallet selection replaced"));
      waiting.current = { resolve, reject };
    });
  }, [connected]);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    waiting.current?.reject(new Error("No wallet selected"));
    waiting.current = null;
  }, []);

  const fundDemoWallet = useCallback(async () => {
    const wallet = connected?.kind === "demo" ? connected : await connect("demo");
    const res = await apiPost<{ balance_minor: string }>("/api/demo/faucet", { wallet: wallet.address });
    const balance = BigInt(res.balance_minor);
    setDemoBalance(balance);
    return balance;
  }, [connected, connect]);

  const value = useMemo<WalletContextValue>(
    () => ({
      config,
      wallets,
      connected,
      connect,
      disconnect,
      requireWallet,
      openPicker: () => setPickerOpen(true),
      fundDemoWallet,
      demoBalance: connected?.kind === "demo" ? demoBalance : null,
    }),
    [config, wallets, connected, connect, disconnect, requireWallet, fundDemoWallet, demoBalance],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      <WalletPicker open={pickerOpen} onClose={closePicker} />
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
