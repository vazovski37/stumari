import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplyForm } from "@/components/apply/apply-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localePath, resolveLocale } from "@/lib/i18n/locales";
import { localizedMetadata } from "@/lib/i18n/metadata";

export async function generateMetadata({ params }: PageProps<"/[lang]/apply">): Promise<Metadata> {
  const locale = resolveLocale((await params).lang);
  if (!locale) return {};
  const { meta } = getDictionary(locale);
  return localizedMetadata(locale, "/apply", { title: meta.applyTitle, description: meta.applyDescription });
}

export default async function ApplyPage({ params }: PageProps<"/[lang]/apply">) {
  const locale = resolveLocale((await params).lang);
  if (!locale) notFound();
  const dict = getDictionary(locale);
  return (
    <>
      <SiteHeader locale={locale} nav={dict.nav} switcherPath="/apply" />
      <main id="main" className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[0.8fr_1.4fr] lg:py-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Link href={localePath(locale)} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-wine">
            <ArrowLeft aria-hidden="true" className="size-4" />
            {dict.apply.back}
          </Link>
          <p className="eyebrow mt-8">{dict.pilot.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{dict.apply.title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">{dict.apply.lead}</p>
          <ol className="mt-8 space-y-4 border-l border-line pl-5">
            {dict.how.steps.map((step, i) => (
              <li key={step.title}>
                <p className="text-sm font-semibold text-ink">
                  <span className="text-wine">{i + 1}.</span> {step.title}
                </p>
              </li>
            ))}
          </ol>
        </div>
        <ApplyForm locale={locale} strings={dict.apply} privacyHref="/privacy" />
      </main>
      <SiteFooter locale={locale} footer={dict.footer} />
    </>
  );
}
