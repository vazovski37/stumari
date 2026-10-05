import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignIn } from "@/components/operator/sign-in";
import { NotAllowed } from "@/components/operator/ui";
import { hotelsOf, pageSession } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { shortAddress } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hotel dashboard" };

/** Entry point: sign in, then the hotels this wallet is the payout wallet of. */
export default async function DashboardIndexPage() {
  const session = await pageSession();
  if (!session) {
    return (
      <SignIn title="Hotel dashboard">
        <p className="text-ink-soft">Sign in with the wallet your payouts go to. Stumari admins sign in with their admin wallet.</p>
      </SignIn>
    );
  }
  const mine = await hotelsOf(getDb(), session.wallet);
  if (mine.length === 1 && !session.isAdmin) redirect(`/dashboard/${mine[0]!.id}`);
  return (
    <NotAllowed title={mine.length > 0 ? "Your hotels" : "No hotel for this wallet"}>
      {mine.length > 0 ? (
        <ul className="space-y-2">
          {mine.map((h) => (
            <li key={h.id}>
              <Link href={`/dashboard/${h.id}`} className="font-medium text-brand underline">
                {h.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {shortAddress(session.wallet)} is not the payout wallet of any hotel. Sign in with the wallet you gave Stumari during onboarding.
        </p>
      )}
      {session.isAdmin && (
        <p>
          You are an admin:{" "}
          <Link href="/admin?tab=hotels" className="text-brand underline">
            open any hotel from the admin console
          </Link>
          .
        </p>
      )}
    </NotAllowed>
  );
}
