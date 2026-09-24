/** Stumari mark: an old-Tbilisi arched doorway (hospitality) holding a coin (settlement). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--color-wine)" />
      <path d="M9 27V15a7 7 0 0 1 14 0v12z" fill="var(--color-paper)" />
      <circle cx="16" cy="19" r="3.25" fill="var(--color-amber)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark className="size-8" />
      <span className="font-display text-xl font-semibold tracking-tight text-ink">Stumari</span>
    </span>
  );
}
