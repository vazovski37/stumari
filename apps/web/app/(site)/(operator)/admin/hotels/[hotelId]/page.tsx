import { isUuid } from "@stumari/core";
import { eq } from "drizzle-orm";
import { CheckCircle2, Circle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DetailsStep, MewsConnection, PayoutStep, RegisterStep, RoomTypesStep, StatusStep, UnitsStep } from "@/components/admin/onboarding";
import { PolicyEditor } from "@/components/dashboard/policy-editor";
import { SignIn } from "@/components/operator/sign-in";
import { NotAllowed } from "@/components/operator/ui";
import { pageSession } from "@/lib/auth/access";
import { hotelUnits } from "@/lib/dashboard/units";
import { getDb } from "@/lib/db";
import { hotels } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { explorerUrl } from "@/lib/explorer";
import { unixNow } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hotel onboarding" };

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="card space-y-4 p-5 sm:p-6">
      <h2 id={`step-${n}`} className="flex items-center gap-3 text-xl font-semibold tracking-tight">
        {done ? (
          <CheckCircle2 aria-label="done" className="size-6 shrink-0 text-positive" />
        ) : (
          <Circle aria-label="to do" className="size-6 shrink-0 text-line" />
        )}
        <span className="text-ink-soft">{n}.</span> {title}
      </h2>
      {children}
    </section>
  );
}

/** The onboarding sequence of api.md, one step per card, in order. */
export default async function HotelOnboardingPage({ params }: PageProps<"/admin/hotels/[hotelId]">) {
  const session = await pageSession();
  if (!session) {
    return (
      <SignIn title="Stumari admin">
        <p className="text-ink-soft">Sign in with a wallet listed in ADMIN_WALLETS.</p>
      </SignIn>
    );
  }
  if (!session.isAdmin) return <NotAllowed title="Admins only">Hotel onboarding is done by Stumari admins.</NotAllowed>;

  const { hotelId } = await params;
  const db = getDb();
  const hotel = isUuid(hotelId) ? await db.query.hotels.findFirst({ where: eq(hotels.id, hotelId) }) : undefined;
  if (!hotel) notFound();
  const env = serverEnv();
  const roomTypes = await hotelUnits(db, hotel, env.siteUrl, unixNow());
  const unitCount = roomTypes.reduce((n, rt) => n + rt.units.length, 0);
  const mews = hotel.inventory_provider === "mews";
  const explorer = {
    hotel: hotel.onchain_hotel ? explorerUrl("address", hotel.onchain_hotel, env.cluster, env.rpcUrl) : null,
    tx: hotel.registered_sig ? explorerUrl("tx", hotel.registered_sig, env.cluster, env.rpcUrl) : null,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="eyebrow">Onboarding</p>
          <h1 className="text-4xl font-semibold tracking-tight">{hotel.name}</h1>
          {hotel.application_id && <p className="text-sm text-ink-soft">Converted from a pilot application.</p>}
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin?tab=hotels" className="btn btn-secondary !py-2">
            All hotels
          </Link>
          <Link href={`/dashboard/${hotel.id}`} className="btn btn-secondary !py-2">
            Hotel dashboard
          </Link>
        </div>
      </header>

      <Step n={1} title="Hotel details" done={Boolean(hotel.address && hotel.phone)}>
        <DetailsStep hotel={hotel} />
        {mews && <MewsConnection hotelId={hotel.id} />}
      </Step>
      <Step n={2} title="Room types and nightly rates" done={roomTypes.length > 0}>
        <RoomTypesStep hotelId={hotel.id} roomTypes={roomTypes} mews={mews} />
      </Step>
      <Step n={3} title="Units and iCal import links" done={unitCount > 0}>
        <UnitsStep hotelId={hotel.id} roomTypes={roomTypes} mews={mews} />
      </Step>
      <Step n={4} title="Contracts and occupancy" done>
        <PolicyEditor hotelId={hotel.id} policy={hotel.policy} />
      </Step>
      <Step n={5} title="Payout wallet" done={hotel.payout_wallet !== null}>
        <PayoutStep hotel={hotel} />
      </Step>
      <Step n={6} title="Register on Solana" done={hotel.onchain_hotel !== null}>
        <RegisterStep hotel={hotel} explorer={explorer} />
      </Step>
      <Step n={7} title="Activate or pause" done={hotel.status !== "draft"}>
        <StatusStep hotel={hotel} />
      </Step>
    </div>
  );
}
