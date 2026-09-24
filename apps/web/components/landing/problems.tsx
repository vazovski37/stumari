import type { Dictionary } from "@/lib/i18n/dictionaries";

export function Problems({ problems }: { problems: Dictionary["problems"] }) {
  return (
    <section aria-labelledby="problems-title" className="border-y border-line bg-sand/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 id="problems-title" className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {problems.title}
        </h2>
        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {problems.items.map((item) => (
            <li key={item.stat} className="card flex flex-col p-6">
              <p className="font-display text-4xl font-semibold tracking-tight text-wine">{item.stat}</p>
              <h3 className="mt-3 font-sans text-lg font-semibold text-ink">{item.title}</h3>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">{item.body}</p>
              {"source" in item && item.source && <p className="mt-auto pt-4 text-xs text-ink-soft">{item.source}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
