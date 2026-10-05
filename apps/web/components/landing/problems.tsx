import type { Dictionary } from "@/lib/i18n/dictionaries";

export function Problems({ problems }: { problems: Dictionary["problems"] }) {
  return (
    <section aria-labelledby="problems-title">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
        <h2 id="problems-title" className="headline max-w-3xl text-4xl sm:text-5xl">
          {problems.title}
        </h2>
        <ul className="mt-16 grid gap-14 md:grid-cols-3 md:gap-10">
          {problems.items.map((item) => (
            <li key={item.stat} className="border-t-2 border-ink pt-6">
              <p className="headline text-5xl tabular-nums md:text-[2.6rem] lg:text-6xl">{item.stat}</p>
              <p className="mt-4 text-lg leading-snug">{item.title}</p>
              {"source" in item && item.source && <p className="mt-3 text-xs text-ink-soft">{item.source}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
