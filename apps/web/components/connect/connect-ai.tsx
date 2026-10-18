"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useState } from "react";
import { shortAddress } from "@/lib/format";
import { apiPost, errorMessage } from "@/lib/client/api";

const EXAMPLES = [
  "Find me a quiet hotel in Sololaki with air conditioning for 2 adults, 14 to 16 November, under 90 USDC a night. Show the cancellation options and recommend one.",
  "I need a place near the old town with breakfast included, 3 nights from 20 November, 1 adult. Cheapest option with free cancellation.",
];

/**
 * Mints the personal connector link and shows how to add it to Claude or ChatGPT. The link is
 * created on a click, never rendered into the page, so it is not in the HTML or any cache.
 */
export function ConnectAi({ wallet }: { wallet: string }) {
  const [link, setLink] = useState<{ url: string; expires_at: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      setLink(await apiPost<{ url: string; expires_at: number }>("/api/me/connector", {}));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Select the link and copy it by hand.");
    }
  }

  return (
    <div className="space-y-8">
      <section className="card space-y-4 p-5 sm:p-6" aria-labelledby="link-title">
        <h2 id="link-title" className="font-sans text-lg font-semibold">
          1. Create your connector link
        </h2>
        <p className="text-sm text-ink-soft">
          Linked wallet: <span className="font-mono">{shortAddress(wallet)}</span>. The link lets your AI search hotels and prepare a booking for this
          wallet. It cannot pay: every payment is approved in your wallet on this site.
        </p>
        {link ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input readOnly value={link.url} aria-label="Connector link" onFocus={(e) => e.currentTarget.select()} className="field font-mono text-xs" />
              <button type="button" onClick={copy} className="btn btn-primary !px-4 !py-2 text-sm" aria-label="Copy link">
                {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-ink-soft">
              Valid until {new Date(link.expires_at * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. Treat it like a
              password: anyone with it can search and hold rooms for your wallet, but nobody can spend your funds with it.
            </p>
          </div>
        ) : (
          <button type="button" onClick={create} disabled={busy} className="btn btn-primary disabled:opacity-60">
            <Link2 aria-hidden="true" className="size-4" />
            {busy ? "Creating…" : "Create my link"}
          </button>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
      </section>

      <section className="card space-y-3 p-5 sm:p-6" aria-labelledby="add-title">
        <h2 id="add-title" className="font-sans text-lg font-semibold">
          2. Add it to your AI
        </h2>
        <ul className="space-y-3 text-sm text-ink-soft">
          <li>
            <span className="font-semibold text-ink">Claude:</span> Settings → Connectors → Add custom connector. Name it Stumari, paste the link, leave
            authentication empty.
          </li>
          <li>
            <span className="font-semibold text-ink">ChatGPT:</span> Settings → Connectors → turn on Developer mode, then create a connector with the link and
            no authentication. Custom connectors are not on every plan.
          </li>
          <li>
            <span className="font-semibold text-ink">Any other app that supports remote MCP servers:</span> use the link as the server URL.
          </li>
        </ul>
        <p className="text-xs text-ink-soft">Your AI&rsquo;s own plan pays for the thinking. Stumari pays nothing and sees no chat.</p>
      </section>

      <section className="card space-y-3 p-5 sm:p-6" aria-labelledby="try-title">
        <h2 id="try-title" className="font-sans text-lg font-semibold">
          3. Ask for a hotel
        </h2>
        <ul className="space-y-2 text-sm">
          {EXAMPLES.map((e) => (
            <li key={e} className="rounded-xl bg-surface px-4 py-3 text-ink-soft">
              {e}
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-soft">
          Your AI answers with prices and cancellation options, then gives you a payment link back to this site. You review the terms and approve the payment in
          your wallet.
        </p>
      </section>
    </div>
  );
}
