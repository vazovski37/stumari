import type { Dictionary } from "@/lib/i18n/dictionaries";

export function HowItWorks({ how }: { how: Dictionary["how"] }) {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
        <h2 id="how-title" className="headline text-4xl sm:text-5xl">
          {how.title}
        </h2>
        <ol className="mt-16 grid gap-14 md:grid-cols-3 md:gap-10">
          {how.steps.map((step, i) => (
            <li key={step.title}>
              <span aria-hidden="true" className="headline block text-6xl text-ink/15 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 text-2xl font-extrabold tracking-[-0.02em]">{step.title}</h3>
              <p className="mt-2 text-lg leading-snug text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
