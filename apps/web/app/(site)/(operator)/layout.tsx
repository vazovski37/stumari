import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/operator/sign-in";
import { WalletProvider } from "@/components/wallet/wallet-provider";
import { pageSession } from "@/lib/auth/access";
import { serverEnv } from "@/lib/env";
import { shortAddress } from "@/lib/format";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const clusterName = { localnet: "a local test chain", devnet: "Solana devnet", "mainnet-beta": "Solana" } as const;

/** Hotel dashboard and admin console: English only, Sign-In With Solana (api.md "Auth"). */
export default async function OperatorLayout({ children }: LayoutProps<"/">) {
  const env = serverEnv();
  const session = await pageSession();
  return (
    <WalletProvider config={{ cluster: env.cluster, demoMode: env.demoMode }}>
      {env.cluster !== "mainnet-beta" && (
        <p className="bg-wine-deep px-4 py-2 text-center text-xs font-medium text-paper">
          Running on {clusterName[env.cluster]}: amounts are test USDC with no real value.
        </p>
      )}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Stumari home" className="shrink-0">
            <Logo />
          </Link>
          <nav aria-label="Operator" className="ml-2">
            <ul className="flex items-center gap-5 text-sm font-medium text-ink-soft">
              <li>
                <Link href="/dashboard" className="hover:text-wine">
                  Dashboard
                </Link>
              </li>
              {session?.isAdmin && (
                <li>
                  <Link href="/admin" className="hover:text-wine">
                    Admin
                  </Link>
                </li>
              )}
            </ul>
          </nav>
          {session && (
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-right text-xs leading-tight text-ink-soft sm:block">
                <span className="block font-mono text-sm text-ink">{shortAddress(session.wallet)}</span>
                {session.isAdmin ? "Admin" : "Signed in"}
              </span>
              <SignOutButton />
            </div>
          )}
        </div>
      </header>
      <main id="main" className="min-h-[70dvh] bg-paper">
        {children}
      </main>
    </WalletProvider>
  );
}
