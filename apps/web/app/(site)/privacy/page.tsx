import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConsentSettings } from "@/components/consent/consent-settings";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { metaPixelIdFrom } from "@/lib/env-schema";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "What Stumari collects, why, where it is kept and how to have it deleted.",
  alternates: { canonical: "/privacy" },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 leading-relaxed text-ink-soft [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </section>
  );
}

// Read at build time, like the [lang] layout that loads the pixel.
const metaPixelConfigured = metaPixelIdFrom(process.env.NEXT_PUBLIC_META_PIXEL_ID) !== null;

export default function PrivacyPage() {
  const dict = getDictionary("en");
  return (
    <>
      <SiteHeader locale="en" nav={dict.nav} />
      <main id="main" className="mx-auto max-w-3xl space-y-10 px-4 py-14 sm:px-6">
        <header className="space-y-3">
          <p className="eyebrow">Privacy</p>
          <h1 className="text-4xl font-semibold tracking-tight">Privacy notice</h1>
          <p className="text-ink-soft">Last updated 27 September 2026. This page is in English only during the pilot.</p>
        </header>

        <Section title="Pilot applications">
          <p>When you apply for the founding-hotel pilot we store what you type into the form:</p>
          <ul>
            <li>your property&rsquo;s name, city and number of rooms;</li>
            <li>your name, role, WhatsApp number, Telegram username and email (whichever you give);</li>
            <li>how you sell today (channels, channel manager, calendar questions) and your message;</li>
            <li>
              which form you used (the full pilot application or the short demo request), the page language, any
              campaign tags in the link you followed, and your consent to be contacted. So that those tags reach the
              form when you open it from another page, your browser keeps them in its session storage for that tab
              until you close it; they are not sent anywhere until you send the form.
            </li>
          </ul>
          <p>
            We also store a one-way hash of your IP address, combined with a secret key, to limit spam. We never store
            the IP address itself.
          </p>
          <p>
            We use this only to contact you about the pilot. A short summary may be sent to the founders&rsquo; private
            Telegram chat so we can reply quickly. We do not sell or share it with anyone else.
          </p>
        </Section>

        <Section title="Bookings and wallets">
          <p>
            Payments, refunds and payouts happen on the Solana blockchain. Wallet addresses, amounts and booking terms
            written on-chain are public by nature and cannot be deleted by us or anyone else.
          </p>
          <p>
            If a guest gives a name, email or phone number at checkout, it is stored off-chain and shown only to the hotel
            they booked.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            Stumari itself sets only functional cookies: a sign-in session for hotel dashboards and a random identifier
            that keeps a guest&rsquo;s 10-minute room hold during checkout. We do not use analytics cookies.
          </p>
        </Section>

        <Section title="Ad measurement (Meta Pixel)">
          {metaPixelConfigured ? (
            <p>
              We advertise on Facebook and Instagram. To see whether those ads bring hotels to this site, our landing and
              apply pages can load the Meta Pixel, a script from Meta Platforms. It loads{" "}
              <strong className="font-semibold text-ink">only if you press Accept</strong> in the cookie banner. If you
              press Decline, or make no choice, it is never loaded and Meta receives nothing from these pages.
            </p>
          ) : (
            <p>
              This site does not load the Meta Pixel at the moment. If we start measuring our Facebook and Instagram ads,
              our landing and apply pages will ask for your permission first and load it only if you press Accept.
            </p>
          )}
          <p>When it is loaded after you accept:</p>
          <ul>
            <li>Meta sets its own cookies (such as <code>_fbp</code>) and receives the addresses of the pages you view, together with information your browser sends with every request, such as your IP address and browser type;</li>
            <li>after you send a form, we tell Meta that a form was sent and which one (pilot application or demo request). We do not send Meta what you typed: no names, phone numbers, usernames or emails, and automatic form matching is switched off;</li>
            <li>Meta uses this under its own privacy policy, including to measure and improve ads;</li>
            <li>Meta may process this data outside Georgia, including in the United States.</li>
          </ul>
          <p>
            We remember your choice in your browser&rsquo;s local storage for about six months, then ask again. The
            choice applies to this browser only.
          </p>
          {metaPixelConfigured && <ConsentSettings />}
        </Section>

        <Section title="Where data is kept, and for how long">
          <p>
            Our database is hosted by our infrastructure providers (Vercel and Turso). We keep pilot applications until
            the pilot ends or until you ask us to delete them, whichever comes first.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            To see, correct or delete what we hold about you, reply to any message we sent you on WhatsApp, Telegram or
            email and tell us. We will act on it within 30 days.
          </p>
          <p>Stumari does not give legal, tax or financial advice.</p>
        </Section>
      </main>
      <SiteFooter locale="en" footer={dict.footer} />
    </>
  );
}
