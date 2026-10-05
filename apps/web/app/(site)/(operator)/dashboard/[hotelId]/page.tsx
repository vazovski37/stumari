import { isUuid } from "@stumari/core";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { BookingsTable } from "@/components/dashboard/bookings-table";
import { Overview } from "@/components/dashboard/overview";
import { PolicyEditor } from "@/components/dashboard/policy-editor";
import { UnitsPanel } from "@/components/dashboard/units-panel";
import { SignIn } from "@/components/operator/sign-in";
import { NotAllowed, Pill, Section } from "@/components/operator/ui";
import { canManageHotel, pageSession } from "@/lib/auth/access";
import { crankHotel } from "@/lib/bookings/operator";
import { hotelOverview, listOperatorBookings } from "@/lib/dashboard/bookings";
import { hotelUnits } from "@/lib/dashboard/units";
import { getDb } from "@/lib/db";
import { hotels } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { shortAddress } from "@/lib/format";
import { chain } from "@/lib/solana/context";
import { unixNow } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hotel dashboard" };

const STATUS_TONE = { active: "good", paused: "warn", draft: "plain" } as const;

/** Hotel dashboard (api.md): the payout wallet's session, or any admin. */
export default async function HotelDashboardPage({ params }: PageProps<"/dashboard/[hotelId]">) {
  const { hotelId } = await params;
  const session = await pageSession();
  if (!session) {
    return (
      <SignIn title="Hotel dashboard">
        <p className="text-ink-soft">Sign in with the wallet your payouts go to.</p>
      </SignIn>
    );
  }
  const db = getDb();
  const hotel = isUuid(hotelId) ? await db.query.hotels.findFirst({ where: eq(hotels.id, hotelId) }) : undefined;
  if (!hotel || !canManageHotel(session, hotel)) {
    return (
      <NotAllowed title="Not your hotel">
        <p>
          The wallet {shortAddress(session.wallet)} does not manage this hotel. Sign in with the hotel&apos;s payout wallet, or open{" "}
          <Link href="/dashboard" className="text-brand underline">
            your dashboard
          </Link>
          .
        </p>
      </NotAllowed>
    );
  }

  // Due releases / voids first, so the numbers below are current; the page still renders without a chain.
  await chain()
    .then((c) => crankHotel(c, db, hotel.id))
    .catch((e: unknown) => console.warn("dashboard crank skipped", e instanceof Error ? e.message : e));
  const now = unixNow();
  const [overview, bookings, roomTypes] = await Promise.all([
    hotelOverview(db, hotel, now),
    listOperatorBookings(db, { hotelId: hotel.id }),
    hotelUnits(db, hotel, serverEnv().siteUrl, now),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="eyebrow">Hotel dashboard</p>
          <h1 className="flex flex-wrap items-center gap-3 text-4xl font-semibold tracking-tight">
            {hotel.name} <Pill tone={STATUS_TONE[hotel.status]}>{hotel.status}</Pill>
          </h1>
          <p className="text-sm text-ink-soft">
            Payouts go to <span className="font-mono">{hotel.payout_wallet ? shortAddress(hotel.payout_wallet) : "—"}</span> · times in{" "}
            {hotel.timezone}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {hotel.status === "active" && (
            <Link href={`/h/${hotel.slug}`} className="btn btn-secondary !py-2" target="_blank">
              Guest booking page
            </Link>
          )}
          {session.isAdmin && (
            <Link href={`/admin/hotels/${hotel.id}`} className="btn btn-secondary !py-2">
              Onboarding (admin)
            </Link>
          )}
        </div>
      </header>

      <Overview overview={overview} />

      <Section id="bookings" title="Bookings">
        <BookingsTable bookings={bookings} now={now} actionsBase={`/api/dashboard/${hotel.id}/bookings`} />
      </Section>

      <Section id="units" title="Rooms and calendars">
        <UnitsPanel hotelId={hotel.id} roomTypes={roomTypes} timeZone={hotel.timezone} />
      </Section>

      <Section id="contracts" title="Contracts and price bounds">
        <PolicyEditor hotelId={hotel.id} policy={hotel.policy} />
      </Section>
    </div>
  );
}
