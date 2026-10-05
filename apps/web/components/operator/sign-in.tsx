"use client";

import { getBase58Decoder } from "@solana/kit";
import { LogIn, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { apiGet, apiPost, errorMessage } from "@/lib/client/api";

/**
 * Sign-In With Solana: connect a wallet, sign the server's one-time message (`solana:signMessage`;
 * no transaction, no fee), and the server sets the session cookie.
 */
export function SignIn({ title, children }: { title: string; children?: React.ReactNode }) {
  const wallet = useWallet();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    try {
      const w = await wallet.requireWallet();
      setBusy("Preparing the sign-in message…");
      const { message } = await apiGet<{ message: string }>(`/api/auth/nonce?wallet=${encodeURIComponent(w.address)}`);
      setBusy("Approve the message in your wallet…");
      const signature = await w.signMessage(new TextEncoder().encode(message));
      setBusy("Checking the signature…");
      await apiPost("/api/auth/verify", { wallet: w.address, message, signature: getBase58Decoder().decode(signature) });
      router.refresh();
    } catch (e) {
      if (e instanceof Error && e.message === "No wallet selected") return;
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
      <div className="card space-y-5 p-6 sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {children}
        <p className="text-sm text-ink-soft">
          Your wallet signs a one-time message. It is not a transaction: nothing is sent and there is no fee.
        </p>
        <button type="button" onClick={signIn} disabled={busy !== null} className="btn btn-primary w-full disabled:opacity-60">
          <LogIn aria-hidden="true" className="size-4" />
          {busy ?? "Sign in with wallet"}
        </button>
        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const { disconnect } = useWallet();
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    await disconnect();
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={signOut}
      className="rounded-full border border-line p-2 text-ink-soft hover:border-ink-soft hover:text-ink"
      aria-label="Sign out"
      title="Sign out"
    >
      <LogOut aria-hidden="true" className="size-4" />
    </button>
  );
}
