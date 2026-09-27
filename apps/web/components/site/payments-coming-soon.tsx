import Link from "next/link";

/**
 * Shown on guest pages (/h/*, /b/*, /my) when the deployment has no chain settings yet
 * (landing-only deploy, docs/plan/go-live-landing.md): checkout would only answer 503.
 */
export function PaymentsComingSoon() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <div className="card space-y-4 p-8">
        <p className="eyebrow">Coming soon</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Checkout is not open yet</h1>
        <p className="leading-relaxed text-ink-soft">
          Stumari is a stablecoin checkout for hotels in Tbilisi. We are onboarding our first pilot hotels now; booking pages
          open here once a hotel goes live.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/apply" className="btn btn-primary">
            Hotels: apply for the pilot
          </Link>
          <Link href="/" className="btn btn-secondary">
            Back to Stumari
          </Link>
        </div>
      </div>
    </div>
  );
}
