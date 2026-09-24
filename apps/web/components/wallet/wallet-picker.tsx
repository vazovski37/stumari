"use client";

import { FlaskConical, Wallet as WalletIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEMO_LABEL } from "@/lib/client/wallets";
import { useWallet } from "./wallet-provider";

/** Modal wallet chooser: detected Wallet Standard wallets, plus the test wallet in demo mode. */
export function WalletPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { config, wallets, connect } = useWallet();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setError(null);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  async function choose(key: string, target: Parameters<typeof connect>[0]) {
    setBusy(key);
    setError(null);
    try {
      await connect(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The wallet did not connect");
    } finally {
      setBusy(null);
    }
  }

  const option =
    "flex w-full items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left transition-colors hover:border-wine disabled:opacity-60";

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="wallet-picker-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-line bg-paper p-0 text-ink shadow-[var(--shadow-card)] backdrop:bg-ink/40"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id="wallet-picker-title" className="font-sans text-lg font-semibold">
          Choose a wallet
        </h2>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-ink-soft hover:bg-sand" aria-label="Close">
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <div className="space-y-3 px-5 py-5">
        {config.demoMode && (
          <button type="button" className={option} disabled={busy !== null} onClick={() => choose("demo", "demo")}>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-soft text-wine-deep">
              <FlaskConical aria-hidden="true" className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">{DEMO_LABEL}</span>
              <span className="block text-sm text-ink-soft">
                A throwaway key kept in this browser. Get 500 test USDC with one click; no install needed.
              </span>
            </span>
          </button>
        )}
        {wallets.map((w) => (
          <button key={w.name} type="button" className={option} disabled={busy !== null} onClick={() => choose(w.name, w)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons are data: URIs supplied by the wallet */}
            <img src={w.icon} alt="" className="size-10 shrink-0 rounded-lg" />
            <span className="font-semibold">{busy === w.name ? `Connecting ${w.name}…` : w.name}</span>
          </button>
        ))}
        {wallets.length === 0 && (
          <p className="flex gap-3 rounded-xl bg-sand px-4 py-3 text-sm text-ink-soft">
            <WalletIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <span>
              No Solana wallet was found in this browser. Install{" "}
              <a href="https://phantom.com/download" target="_blank" rel="noreferrer" className="font-medium text-wine underline">
                Phantom
              </a>{" "}
              and reload{config.demoMode ? ", or use the test wallet above" : ""}. You pay in USDC only; Stumari covers the network fee.
            </span>
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-clay/10 px-4 py-3 text-sm text-clay">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
