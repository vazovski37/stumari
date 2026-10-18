import type { Metadata } from "next";
import { ConnectAi } from "@/components/connect/connect-ai";
import { SignIn } from "@/components/operator/sign-in";
import { pageSession } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Connect your AI", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Link a wallet and connect the guest's own AI app (Claude, ChatGPT) to Stumari (ADR-0020). */
export default async function ConnectAiPage() {
  const session = await pageSession();
  if (!session) {
    return (
      <SignIn title="Connect your AI">
        <p className="text-sm text-ink-soft">
          Link your Solana wallet, then add Stumari to the AI app you already use. It finds a hotel for your requirements; you pay here.
        </p>
      </SignIn>
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12 sm:px-6">
      <header className="space-y-2">
        <p className="eyebrow">Your AI · your wallet</p>
        <h1 className="text-4xl font-semibold tracking-tight">Ask your AI for a hotel</h1>
        <p className="text-ink-soft">Use the AI you already pay for. It searches and compares; you approve the payment from your wallet.</p>
      </header>
      <ConnectAi wallet={session.wallet} />
    </div>
  );
}
