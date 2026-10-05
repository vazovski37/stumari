import { S_MARK, WORDMARK } from "./brand-paths";

/**
 * The stumari wordmark, traced from the master logo (docs/product/brand.md). It takes the text
 * colour, so it is black on light pages and white inside `.on-dark` bands. Size it by height or width.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}
      className={className}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path fillRule="evenodd" d={WORDMARK.d} />
    </svg>
  );
}

/** The `s` of the wordmark in a black square, for places too small for the wordmark. */
export function LogoMark({ className }: { className?: string }) {
  const k = (32 * 0.6) / S_MARK.height;
  const dx = (32 - S_MARK.width * k) / 2;
  const dy = (32 - S_MARK.height * k) / 2;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" fill="var(--color-brand)" />
      <path transform={`translate(${dx} ${dy}) scale(${k})`} fill="var(--color-paper)" fillRule="evenodd" d={S_MARK.d} />
    </svg>
  );
}

/** Header/footer logo. Callers wrap it in a link with an aria-label ("Stumari home"). */
export function Logo({ className }: { className?: string }) {
  return <Wordmark className={`h-[1.15rem] w-auto ${className ?? ""}`} />;
}
