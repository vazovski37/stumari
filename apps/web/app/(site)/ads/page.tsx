import type { Metadata } from "next";
import { localeNames, locales } from "@/lib/i18n/locales";
import { adCopy, adFileName, adFormats, adVariants, type AdFormat } from "./copy";

export const metadata: Metadata = {
  title: "Ad creatives",
  description: "Facebook and Instagram ad images for the Stumari pilot.",
  robots: { index: false, follow: false },
};

const variantNames = {
  usdc: "USDC checkout with automatic refund rules",
  contracts: "Per-guest cancellation contracts",
  founding: "First 10 hotels: 0% fee until 31 Dec 2026",
} as const;

/** Internal gallery: every ad image with its URL, to download for Meta Ads Manager. Not indexed. */
export default function AdsPage() {
  const formats = Object.keys(adFormats) as AdFormat[];
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-12 px-4 py-12 sm:px-6">
      <header className="space-y-3">
        <p className="eyebrow">Internal</p>
        <h1 className="text-4xl font-semibold tracking-tight">Ad creatives</h1>
        <p className="max-w-2xl text-ink-soft">
          Square images are 1080×1080 (feed), wide ones 1200×630 (link ads). Send ad traffic to{" "}
          <code>/apply?type=demo</code>, <code>/ka/apply?type=demo</code> or <code>/ru/apply?type=demo</code> with
          utm_source, utm_campaign and utm_content tags.
        </p>
      </header>
      {locales.map((locale) => (
        <section key={locale} className="space-y-5">
          <h2 className="text-2xl font-semibold tracking-tight">{localeNames[locale]}</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {adVariants.map((variant) => (
              <figure key={variant} className="card space-y-3 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- the PNG itself is the deliverable */}
                <img
                  src={`/ads/${locale}/${adFileName(variant, "square")}`}
                  alt={adCopy[locale][variant].headline}
                  width={1080}
                  height={1080}
                  loading="lazy"
                  className="h-auto w-full rounded-xl"
                />
                <figcaption className="space-y-1 text-sm">
                  <p className="font-semibold text-ink">{variantNames[variant]}</p>
                  <p className="flex flex-wrap gap-x-3">
                    {formats.map((format) => (
                      <a
                        key={format}
                        href={`/ads/${locale}/${adFileName(variant, format)}`}
                        download
                        className="font-medium text-brand underline underline-offset-2"
                      >
                        {adFormats[format].width}×{adFormats[format].height}
                      </a>
                    ))}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
