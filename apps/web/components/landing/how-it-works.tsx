import type { Dictionary } from "@/lib/i18n/dictionaries";

export function HowItWorks({ how }: { how: Dictionary["how"] }) {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 id="how-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {how.title}
        </h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {how.steps.map((step, i) => (
            <li key={step.title} className="relative">
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-full border border-wine/25 bg-paper font-display text-xl font-semibold text-wine"
              >
                {i + 1}
              </span>
              {i < how.steps.length - 1 && (
                <span aria-hidden="true" className="absolute top-6 left-16 hidden h-px w-[calc(100%-4.5rem)] bg-line md:block" />
              )}
              <h3 className="mt-5 font-sans text-lg font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
