import Link from "next/link";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { PaymentsComingSoon } from "@/components/site/payments-coming-soon";
import { WalletButton } from "@/components/wallet/wallet-button";
import { WalletProvider } from "@/components/wallet/wallet-provider";
import { serverEnv } from "@/lib/env";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { publicConfig } from "@/lib/public-config";

const clusterName = { localnet: "a local test chain", devnet: "Solana devnet", "mainnet-beta": "Solana" } as const;

/**
 * Guest pages (checkout, booking, my bookings): English only, with the wallet in the header.
 * Without chain settings (landing-only deploy) they show a "coming soon" state instead of a
 * checkout that could only fail, and the header drops "My bookings" and the wallet.
 */
export default function GuestLayout({ children }: LayoutProps<"/">) {
  const env = serverEnv();
  const dict = getDictionary("en");
  const config = publicConfig(env);
  if (config.mint === null || config.quote_signer === null) {
    return (
      <>
        <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
            <Link href="/" aria-label="Stumari home" className="shrink-0">
              <Logo />
            </Link>
            <nav aria-label="Guest" className="ml-auto">
              <Link href="/model" className="text-sm font-medium text-ink-soft hover:text-brand">
                How pricing works
              </Link>
            </nav>
          </div>
        </header>
        <main id="main" className="min-h-[60dvh]">
          <PaymentsComingSoon />
        </main>
        <SiteFooter locale="en" footer={dict.footer} />
      </>
    );
  }
  return (
    <WalletProvider config={{ cluster: env.cluster, demoMode: env.demoMode }}>
      {env.cluster !== "mainnet-beta" && (
        <p className="bg-brand-deep px-4 py-2 text-center text-xs font-medium text-paper">
          Demo on {clusterName[env.cluster]}: payments use test USDC with no real value.
        </p>
      )}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Stumari home" className="shrink-0">
            <Logo />
          </Link>
          <nav aria-label="Guest" className="ml-2 hidden sm:block">
            <ul className="flex items-center gap-5 text-sm font-medium text-ink-soft">
              <li>
                <Link href="/connect-ai" className="hover:text-brand">
                  Use my AI
                </Link>
              </li>
              <li>
                <Link href="/my" className="hover:text-brand">
                  My bookings
                </Link>
              </li>
              <li>
                <Link href="/model" className="hover:text-brand">
                  How pricing works
                </Link>
              </li>
            </ul>
          </nav>
          <div className="ml-auto">
            <WalletButton />
          </div>
        </div>
      </header>
      <main id="main" className="min-h-[60dvh]">
        {children}
      </main>
      <SiteFooter locale="en" footer={dict.footer} />
    </WalletProvider>
  );
}
