import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingPanel } from "@/components/booking/booking-panel";
import { ApiError } from "@/lib/api/errors";
import { currentBookingView } from "@/lib/bookings/public";
import { unixNow } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your booking", robots: { index: false } };

/** Guest booking page: status, terms, refund-if-cancel-now, cancel / dispute / void (api.md Pages). */
export default async function BookingPage({ params }: PageProps<"/b/[bookingId]">) {
  const { bookingId } = await params;
  const view = await currentBookingView(bookingId, { force: false }).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  return <BookingPanel initial={view} initialNow={unixNow()} />;
}
