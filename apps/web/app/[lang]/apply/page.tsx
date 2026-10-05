import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplyForm } from "@/components/apply/apply-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { intentFromQuery } from "@/lib/application-fields";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localePath, resolveLocale } from "@/lib/i18n/locales";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { pickUtm } from "@/lib/utm";

// `?type=demo` is the short "book a 15-minute demo" form for ad traffic; anything else is the full pilot form.
export async function generateMetadata({ params, searchParams }: PageProps<"/[lang]/apply">): Promise<Metadata> {
  const locale = resolveLocale((await params).lang);
  if (!locale) return {};
  const { meta } = getDictionary(locale);
  if (intentFromQuery((await searchParams).type) === "demo") {
    return localizedMetadata(locale, "/apply?type=demo", { title: meta.demoTitle, description: meta.demoDescription });
  }
  return localizedMetadata(locale, "/apply", { title: meta.applyTitle, description: meta.applyDescription });
}

export default async function ApplyPage({ params, searchParams }: PageProps<"/[lang]/apply">) {
  const locale = resolveLocale((await params).lang);
  if (!locale) notFound();
  const dict = getDictionary(locale);
  const query = await searchParams;
  const intent = intentFromQuery(query.type);
  return (
    <>
      <SiteHeader
        locale={locale}
        nav={dict.nav}
        switcherPath={intent === "demo" ? "/apply?type=demo" : "/apply"}
        switcherUtm={pickUtm(query)}
      />
      <main id="main" className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[0.8fr_1.4fr] lg:py-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Link href={localePath(locale)} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-brand">
            <ArrowLeft aria-hidden="true" className="size-4" />
            {dict.apply.back}
          </Link>
          {intent === "demo" ? (
            <>
              <p className="eyebrow mt-8">{dict.demo.eyebrow}</p>
              <h1 className="headline mt-4 text-4xl sm:text-5xl">{dict.demo.title}</h1>
              <p className="mt-4 text-lg leading-relaxed text-ink-soft">{dict.demo.lead}</p>
              <ul className="mt-8 space-y-3">
                {dict.demo.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-sm font-medium text-ink">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-positive" />
                    {point}
                  </li>
                ))}
              </ul>
              <p className="mt-8 text-sm text-ink-soft">
                {dict.demo.fullFormPrompt}{" "}
                <Link href={localePath(locale, "/apply")} className="inline-flex items-center gap-1 font-medium text-brand underline underline-offset-2">
                  {dict.demo.fullFormLink}
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow mt-8">{dict.pilot.eyebrow}</p>
              <h1 className="headline mt-4 text-4xl sm:text-5xl">{dict.apply.title}</h1>
              <p className="mt-4 text-lg leading-relaxed text-ink-soft">{dict.apply.lead}</p>
              <ol className="mt-8 space-y-4 border-l-2 border-ink pl-5">
                {dict.how.steps.map((step, i) => (
                  <li key={step.title}>
                    <p className="text-sm font-semibold text-ink">
                      <span className="font-label text-xs text-ink-soft">{String(i + 1).padStart(2, "0")}</span> {step.title}
                    </p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
        <ApplyForm key={intent} locale={locale} strings={dict.apply} privacyHref="/privacy" intent={intent} demo={dict.demo} />
      </main>
      <SiteFooter locale={locale} footer={dict.footer} />
    </>
  );
}
