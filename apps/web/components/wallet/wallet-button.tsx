"use client";

import { Coins, LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "@/lib/client/api";
import { shortAddress } from "@/lib/format";
import { formatUsdc } from "@/lib/money";
import { useWallet } from "./wallet-provider";

/** Header control: connect, show the connected wallet, test-USDC faucet and disconnect. */
export function WalletButton() {
  const { connected, openPicker, disconnect } = useWallet();
  if (!connected) {
    return (
      <button type="button" onClick={openPicker} className="btn btn-secondary !px-4 !py-2 text-sm">
        <Wallet aria-hidden="true" className="size-4" />
        Connect wallet
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-right text-xs leading-tight text-ink-soft sm:block">
        <span className="block font-mono text-sm text-ink">{shortAddress(connected.address)}</span>
        {connected.kind === "demo" ? "Test wallet · not real money" : connected.name}
      </span>
      <button
        type="button"
        onClick={() => disconnect()}
        className="rounded-full border border-line p-2 text-ink-soft hover:border-ink-soft hover:text-ink"
        aria-label="Disconnect wallet"
        title="Disconnect wallet"
      >
        <LogOut aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

/** "Get 500 test USDC" (demo mode only): mints to the test wallet through /api/demo/faucet. */
export function FaucetButton() {
  const { config, fundDemoWallet, demoBalance } = useWallet();
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  if (!config.demoMode) return null;

  async function fund() {
    setState({ busy: true, error: null });
    try {
      await fundDemoWallet();
      setState({ busy: false, error: null });
    } catch (e) {
      setState({ busy: false, error: errorMessage(e) });
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button type="button" onClick={fund} disabled={state.busy} className="btn btn-secondary !px-4 !py-2 text-sm disabled:opacity-60">
        <Coins aria-hidden="true" className="size-4 text-amber" />
        {state.busy ? "Minting test USDC…" : "Get 500 test USDC"}
      </button>
      {demoBalance !== null && !state.error && (
        <span className="text-xs text-ink-soft" aria-live="polite">
          Test wallet balance: {formatUsdc(demoBalance)} USDC
        </span>
      )}
      {state.error && (
        <span role="alert" className="text-xs text-clay">
          {state.error}
        </span>
      )}
    </div>
  );
}
