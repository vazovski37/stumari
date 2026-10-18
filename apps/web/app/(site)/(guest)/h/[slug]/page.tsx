import { localDate } from "@stumari/core";
import { MapPin, Phone, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Checkout } from "@/components/checkout/checkout";
import { getDb } from "@/lib/db";
import { findPublicHotel, hotelProfile } from "@/lib/hotels";
import { unixNow } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/h/[slug]">): Promise<Metadata> {
  const found = await findPublicHotel(getDb(), (await params).slug);
  if (!found) return { title: "Hotel not found" };
  return {
    title: `Book ${found.hotel.name}`,
    description: `Book ${found.hotel.name} directly and pay in USDC, with cancellation terms priced for your stay.`,
    alternates: { canonical: `/h/${found.hotel.slug}` },
  };
}

/** Guest checkout: dates → availability → signed quote menu → pay with a wallet (api.md Pages). */
export default async function HotelPage({ params, searchParams }: PageProps<"/h/[slug]">) {
  const found = await findPublicHotel(getDb(), (await params).slug);
  if (!found) notFound();
  const profile = hotelProfile(found.hotel, found.roomTypes);
  const today = localDate(unixNow(), profile.timezone);
  // A link from the guest's AI assistant (ADR-0020): `?quote=<id>&option=<n>` opens the checkout on that quote.
  const sp = await searchParams;
  const quoteParam = typeof sp.quote === "string" && /^[0-9a-f-]{36}$/.test(sp.quote) ? sp.quote : null;
  const optionParam = typeof sp.option === "string" && /^\d$/.test(sp.option) ? Number(sp.option) : 0;

  return (
    <>
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 pt-10 pb-8 sm:px-6">
          <p className="eyebrow">Direct booking · pay in USDC</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{profile.name}</h1>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
            {profile.address && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="size-4" />
                {profile.address}
                {profile.city && !profile.address.includes(profile.city) ? `, ${profile.city}` : ""}
              </span>
            )}
            {profile.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone aria-hidden="true" className="size-4" />
                {profile.phone}
              </span>
            )}
          </p>
          {profile.description && <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-soft">{profile.description}</p>}
          {profile.amenities.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Amenities">
              {profile.amenities.map((a) => (
                <li key={a} className="rounded-full bg-paper px-3 py-1 text-xs font-medium text-ink-soft ring-1 ring-line">
                  {a.replace(/-/g, " ")}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-5 flex max-w-2xl gap-2 text-sm leading-relaxed text-ink-soft">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-positive" />
            You choose your cancellation terms; each option is priced for your dates. Your payment waits in an escrow on
            Solana: refunds follow your terms automatically, and the hotel is paid after check-in.
          </p>
        </div>
      </section>
      <Checkout hotel={profile} today={today} initial={quoteParam ? { quoteId: quoteParam, option: optionParam } : undefined} />
    </>
  );
}
