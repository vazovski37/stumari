import type { Metadata } from "next";
import { MyBookings } from "@/components/booking/my-bookings";

export const metadata: Metadata = { title: "My bookings", robots: { index: false } };

export default function MyBookingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12 sm:px-6">
      <header className="space-y-2">
        <p className="eyebrow">Guests</p>
        <h1 className="text-4xl font-semibold tracking-tight">My bookings</h1>
        <p className="text-ink-soft">Bookings paid from your wallet, with their status and your refund options.</p>
      </header>
      <MyBookings />
    </div>
  );
}
