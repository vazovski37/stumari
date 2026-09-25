import type { Metadata } from "next";
import Link from "next/link";
import { ApplicationsList } from "@/components/admin/applications-list";
import { Disputes } from "@/components/admin/disputes";
import { NewHotelForm } from "@/components/admin/new-hotel-form";
import { Operations } from "@/components/admin/operations";
import { BookingsTable } from "@/components/dashboard/bookings-table";
import { SignIn } from "@/components/operator/sign-in";
import { Empty, NotAllowed, Pill, Section } from "@/components/operator/ui";
import { listApplications } from "@/lib/admin/applications";
import { adminBookingQuery } from "@/lib/admin/bookings";
import { listHotels } from "@/lib/admin/hotels";
import { pageSession } from "@/lib/auth/access";
import { listOperatorBookings } from "@/lib/dashboard/bookings";
import { getDb } from "@/lib/db";
import { bookingStatuses } from "@/lib/db/schema";
import { shortAddress } from "@/lib/format";
import { unixNow } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin" };

const TABS = [
  { id: "applications", label: "Applications" },
  { id: "hotels", label: "Hotels" },
  { id: "bookings", label: "Bookings" },
  { id: "disputes", label: "Disputes" },
  { id: "operations", label: "Operations" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const HOTEL_TONE = { active: "good", paused: "warn", draft: "plain" } as const;

/** Admin console (api.md "Admin"): applications, hotel onboarding, bookings, disputes, cron. */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const session = await pageSession();
  if (!session) {
    return (
      <SignIn title="Stumari admin">
        <p className="text-ink-soft">Sign in with a wallet listed in ADMIN_WALLETS.</p>
      </SignIn>
    );
  }
  if (!session.isAdmin) {
    return (
      <NotAllowed title="Admins only">
        <p>{shortAddress(session.wallet)} is not an admin wallet.</p>
      </NotAllowed>
    );
  }

  const params = await searchParams;
  const tab: Tab = TABS.find((t) => t.id === params.tab)?.id ?? "applications";
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <p className="eyebrow">Admin</p>
        <h1 className="text-4xl font-semibold tracking-tight">Operations console</h1>
      </header>
      <nav aria-label="Admin sections" className="flex flex-wrap gap-2 border-b border-line pb-3">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin?tab=${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${t.id === tab ? "bg-wine text-paper" : "text-ink-soft hover:bg-sand"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <TabContent tab={tab} params={params} />
    </div>
  );
}

async function TabContent({ tab, params }: { tab: Tab; params: Record<string, string | string[] | undefined> }) {
  const db = getDb();
  switch (tab) {
    case "applications":
      return <ApplicationsList items={await listApplications(db)} />;
    case "hotels":
      return <HotelsTab />;
    case "bookings":
      return <BookingsTab params={params} />;
    case "disputes":
      return <Disputes items={await listOperatorBookings(db, { status: "disputed" })} />;
    case "operations":
      return <Operations />;
  }
}

async function HotelsTab() {
  const list = await listHotels(getDb());
  return (
    <div className="space-y-6">
      <NewHotelForm />
      {list.length === 0 ? (
        <Empty>No hotels yet. Convert an application or create a draft above.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-line text-xs tracking-wide text-ink-soft uppercase">
              <tr>
                <th className="px-4 py-3 font-semibold">Hotel</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Rooms</th>
                <th className="px-4 py-3 font-semibold">Payout wallet</th>
                <th className="px-4 py-3 font-semibold">On-chain</th>
                <th className="px-4 py-3 font-semibold">
                  <span className="sr-only">Links</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {list.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-3">
                    <span className="block font-medium">{h.name}</span>
                    <span className="block font-mono text-xs text-ink-soft">/h/{h.slug}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={HOTEL_TONE[h.status]}>{h.status}</Pill>
                  </td>
                  <td className="px-4 py-3">
                    {h.room_type_count} types · {h.unit_count} units
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{h.payout_wallet ? shortAddress(h.payout_wallet) : "—"}</td>
                  <td className="px-4 py-3">{h.onchain_hotel ? <Pill tone="good">registered</Pill> : <Pill tone="plain">not yet</Pill>}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link href={`/admin/hotels/${h.id}`} className="font-medium text-wine hover:underline">
                      Onboarding
                    </Link>
                    <span className="px-2 text-line">|</span>
                    <Link href={`/dashboard/${h.id}`} className="font-medium text-wine hover:underline">
                      Dashboard
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function BookingsTab({ params }: { params: Record<string, string | string[] | undefined> }) {
  const db = getDb();
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const parsed = adminBookingQuery.safeParse({
    status: one(params.status),
    hotel_id: one(params.hotel_id),
    checkin_from: one(params.checkin_from),
    checkin_to: one(params.checkin_to),
  });
  const f = parsed.success ? parsed.data : {};
  const [hotelList, bookings] = await Promise.all([
    listHotels(db),
    listOperatorBookings(db, { status: f.status, hotelId: f.hotel_id, checkinFrom: f.checkin_from, checkinTo: f.checkin_to }),
  ]);
  return (
    <Section title="Bookings">
      <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
        <input type="hidden" name="tab" value="bookings" />
        <label className="text-sm font-medium">
          Status
          <select name="status" defaultValue={f.status ?? ""} className="field">
            <option value="">Paid (all)</option>
            {bookingStatuses.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Hotel
          <select name="hotel_id" defaultValue={f.hotel_id ?? ""} className="field">
            <option value="">All hotels</option>
            {hotelList.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Check-in from
          <input type="date" name="checkin_from" defaultValue={f.checkin_from ?? ""} className="field" />
        </label>
        <label className="text-sm font-medium">
          Check-in to
          <input type="date" name="checkin_to" defaultValue={f.checkin_to ?? ""} className="field" />
        </label>
        <button type="submit" className="btn btn-secondary !py-2.5">
          Filter
        </button>
      </form>
      {!parsed.success && <p className="text-sm text-clay">Some filters were invalid and were ignored.</p>}
      <BookingsTable bookings={bookings} now={unixNow()} actionsBase="/api/admin/bookings" admin />
    </Section>
  );
}
