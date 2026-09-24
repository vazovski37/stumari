import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/landing/cta-band";
import { Faq } from "@/components/landing/faq";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ModelSection } from "@/components/landing/model-section";
import { PilotOffer } from "@/components/landing/pilot-offer";
import { Problems } from "@/components/landing/problems";
import { Trust } from "@/components/landing/trust";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { resolveLocale } from "@/lib/i18n/locales";
import { localizedMetadata } from "@/lib/i18n/metadata";

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const locale = resolveLocale((await params).lang);
  if (!locale) return {};
  const { meta } = getDictionary(locale);
  return localizedMetadata(locale, "", { title: meta.title, description: meta.description });
}

export default async function LandingPage({ params }: PageProps<"/[lang]">) {
  const locale = resolveLocale((await params).lang);
  if (!locale) notFound();
  const dict = getDictionary(locale);
  return (
    <>
      <SiteHeader locale={locale} nav={dict.nav} switcherPath="" sections />
      <main id="main">
        <Hero locale={locale} hero={dict.hero} />
        <Problems problems={dict.problems} />
        <HowItWorks how={dict.how} />
        <ModelSection model={dict.model} />
        <Trust trust={dict.trust} />
        <PilotOffer locale={locale} pilot={dict.pilot} />
        <Faq faq={dict.faq} />
        <CtaBand locale={locale} cta={dict.cta} />
      </main>
      <SiteFooter locale={locale} footer={dict.footer} />
    </>
  );
}
