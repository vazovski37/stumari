import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { adCopy, adFileName, adFormats, adVariants, parseAdFile, type AdCopy, type AdFormat, type AdVariant } from "../../copy";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { locales, resolveLocale, type Locale } from "@/lib/i18n/locales";

/**
 * Ad creatives as PNG: /ads/{en|ka|ru}/{usdc|contracts|founding}.png (1080×1080) and …-wide.png
 * (1200×630). All 18 are rendered at build time. Colours follow the landing (globals.css, OG image).
 * DejaVu Sans (subset, license next to it) is bundled because it has Georgian and Cyrillic glyphs.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((lang) =>
    adVariants.flatMap((variant) => (Object.keys(adFormats) as AdFormat[]).map((format) => ({ lang, file: adFileName(variant, format) }))),
  );
}

const fontDir = join(process.cwd(), "app", "(site)", "ads", "_fonts");
const [regular, bold] = await Promise.all([
  readFile(join(fontDir, "DejaVuSans.ttf")),
  readFile(join(fontDir, "DejaVuSans-Bold.ttf")),
]);

const c = {
  paper: "#faf6ef",
  paperSoft: "rgba(250, 246, 239, 0.82)",
  paperFaint: "rgba(250, 246, 239, 0.62)",
  wine: "#7a1f30",
  wineDeep: "#4e121d",
  amber: "#d99a2b",
  amberSoft: "#f4e3c1",
  line: "rgba(250, 246, 239, 0.22)",
};

/** Georgian and Russian run longer than English. */
const scaleFor: Record<Locale, number> = { en: 1, ru: 0.92, ka: 0.84 };

export async function GET(_request: Request, { params }: RouteContext<"/ads/[lang]/[file]">) {
  const { lang, file } = await params;
  const locale = resolveLocale(lang);
  const parsed = parseAdFile(file);
  if (!locale || !parsed) return new Response("Not found", { status: 404 });
  const { width, height } = adFormats[parsed.format];
  const copy = adCopy[locale];
  const templates = getDictionary(locale).model.templates;
  const s = scaleFor[locale];
  const contracts = [templates.flexible, templates.standard, templates.nonrefundable];

  const content =
    parsed.format === "square"
      ? square(parsed.variant, copy, contracts, s)
      : wide(parsed.variant, copy, contracts, s);

  return new ImageResponse(content, {
    width,
    height,
    fonts: [
      { name: "DejaVu Sans", data: regular, weight: 400, style: "normal" },
      { name: "DejaVu Sans", data: bold, weight: 700, style: "normal" },
    ],
  });
}

type Contract = { name: string; terms: string };

function Frame({ padding, children }: { padding: number; children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding,
        background: `linear-gradient(160deg, ${c.wine} 0%, ${c.wineDeep} 62%)`,
        color: c.paper,
        fontFamily: "DejaVu Sans",
      }}
    >
      {children}
    </div>
  );
}

function Brand({ tag, size }: { tag: string; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: size * 0.4 }}>
        <svg width={size * 1.5} height={size * 1.5} viewBox="0 0 32 32">
          <rect width="32" height="32" rx="8" fill={c.wine} stroke={c.line} />
          <path d="M9 27V15a7 7 0 0 1 14 0v12z" fill={c.paper} />
          <circle cx="16" cy="19" r="3.25" fill={c.amber} />
        </svg>
        <span style={{ fontSize: size, fontWeight: 700 }}>Stumari</span>
      </div>
      <span
        style={{
          fontSize: size * 0.62,
          fontWeight: 700,
          color: c.wineDeep,
          background: c.amberSoft,
          padding: `${size * 0.22}px ${size * 0.5}px`,
          borderRadius: 999,
        }}
      >
        {tag}
      </span>
    </div>
  );
}

function Cta({ copy, size }: { copy: AdCopy; size: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: size * 0.55 }}>
      <div style={{ display: "flex" }}>
        <span
          style={{
            fontSize: size,
            fontWeight: 700,
            color: c.wineDeep,
            background: c.amber,
            padding: `${size * 0.5}px ${size * 1.05}px`,
            borderRadius: 999,
          }}
        >
          {`${copy.common.cta} →`}
        </span>
      </div>
      <span style={{ fontSize: size * 0.68, color: c.paperFaint }}>{copy.common.brand}</span>
    </div>
  );
}

/** A soft panel for a paragraph (the wide usdc creative's right column). */
function Panel({ text, size }: { text: string; size: number }) {
  return (
    <div
      style={{
        display: "flex",
        padding: `${size * 1.1}px ${size * 1.2}px`,
        borderRadius: size * 0.9,
        background: "rgba(250, 246, 239, 0.1)",
        border: `2px solid ${c.line}`,
        width: "100%",
      }}
    >
      <span style={{ fontSize: size, color: c.paperSoft, lineHeight: 1.45 }}>{text}</span>
    </div>
  );
}

function ContractList({ contracts, size }: { contracts: Contract[]; size: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: size * 0.5, width: "100%" }}>
      {contracts.map((contract, i) => (
        <div
          key={contract.name}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: size * 0.2,
            padding: `${size * 0.55}px ${size * 0.8}px`,
            borderRadius: size * 0.7,
            background: i === 1 ? c.paper : "rgba(250, 246, 239, 0.1)",
            color: i === 1 ? c.wineDeep : c.paper,
            border: `2px solid ${i === 1 ? c.paper : c.line}`,
          }}
        >
          <span style={{ fontSize: size, fontWeight: 700 }}>{contract.name}</span>
          <span style={{ fontSize: size * 0.72, color: i === 1 ? c.wine : c.paperSoft }}>{contract.terms}</span>
        </div>
      ))}
    </div>
  );
}

function Checks({ items, size }: { items: string[]; size: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: size * 0.6, width: "100%" }}>
      {items.map((item) => (
        <div key={item} style={{ display: "flex", gap: size * 0.6, alignItems: "flex-start", width: "100%" }}>
          <span style={{ fontSize: size, fontWeight: 700, color: c.amber }}>✓</span>
          <span style={{ fontSize: size, color: c.paperSoft, lineHeight: 1.35, flex: 1 }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

function square(variant: AdVariant, copy: AdCopy, contracts: Contract[], s: number) {
  const headline = (text: string, size = 74) => (
    <span style={{ fontSize: size * s, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1 }}>{text}</span>
  );
  const accent = (text: string, size = 42) => (
    <span style={{ fontSize: size * s, color: c.amberSoft, lineHeight: 1.25 }}>{text}</span>
  );
  let middle: ReactNode;
  if (variant === "usdc") {
    const v = copy.usdc;
    middle = (
      <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
        {headline(v.headline, 78)}
        {accent(v.accent, 46)}
        <span style={{ fontSize: 30 * s, color: c.paperSoft, lineHeight: 1.45 }}>{v.body}</span>
      </div>
    );
  } else if (variant === "contracts") {
    const v = copy.contracts;
    middle = (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {headline(v.headline, 66)}
        {accent(v.accent, 36)}
        <ContractList contracts={contracts} size={29 * s} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 27 * s, fontWeight: 700, color: c.amber }}>{v.stat}</span>
          <span style={{ fontSize: 19 * s, color: c.paperFaint }}>{v.statNote}</span>
        </div>
      </div>
    );
  } else {
    const v = copy.founding;
    middle = (
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <span style={{ fontSize: 50 * s, fontWeight: 700, color: c.amberSoft }}>{v.headline}</span>
        <span style={{ fontSize: 190, fontWeight: 700, lineHeight: 1, letterSpacing: -6 }}>{v.big}</span>
        <span style={{ fontSize: 38 * s, lineHeight: 1.3 }}>{v.accent}</span>
        <div style={{ display: "flex", marginTop: 10, width: "100%" }}>
          <Checks items={v.bullets} size={27 * s} />
        </div>
      </div>
    );
  }
  return (
    <Frame padding={76}>
      <Brand tag={copy.common.tag} size={36} />
      {middle}
      <Cta copy={copy} size={32 * s} />
    </Frame>
  );
}

function wide(variant: AdVariant, copy: AdCopy, contracts: Contract[], s: number) {
  const column = (children: ReactNode, gap = 18) => (
    <div style={{ display: "flex", flexDirection: "column", gap, width: "100%" }}>{children}</div>
  );
  let left: ReactNode;
  let right: ReactNode;
  if (variant === "usdc") {
    left = column([
      <span key="h" style={{ fontSize: 56 * s, fontWeight: 700, lineHeight: 1.12 }}>{copy.usdc.headline}</span>,
      <span key="a" style={{ fontSize: 32 * s, color: c.amberSoft, lineHeight: 1.3 }}>{copy.usdc.accent}</span>,
    ]);
    right = <Panel text={copy.usdc.body} size={20 * s} />;
  } else if (variant === "contracts") {
    left = column([
      <span key="h" style={{ fontSize: 46 * s, fontWeight: 700, lineHeight: 1.12 }}>{copy.contracts.headline}</span>,
      <span key="a" style={{ fontSize: 26 * s, color: c.amberSoft, lineHeight: 1.3 }}>{copy.contracts.accent}</span>,
    ]);
    right = <ContractList contracts={contracts} size={21 * s} />;
  } else {
    left = column(
      [
        <span key="h" style={{ fontSize: 36 * s, fontWeight: 700, color: c.amberSoft }}>{copy.founding.headline}</span>,
        <span key="b" style={{ fontSize: 150, fontWeight: 700, letterSpacing: -5, lineHeight: 1 }}>{copy.founding.big}</span>,
        <span key="a" style={{ fontSize: 25 * s, lineHeight: 1.3 }}>{copy.founding.accent}</span>,
      ],
      12,
    );
    right = <Checks items={copy.founding.bullets} size={21 * s} />;
  }
  return (
    <Frame padding={56}>
      <Brand tag={copy.common.tag} size={28} />
      <div style={{ display: "flex", alignItems: "center", gap: 44, width: "100%" }}>
        <div style={{ display: "flex", width: "53%" }}>{left}</div>
        <div style={{ display: "flex", justifyContent: "center", width: "43%" }}>{right}</div>
      </div>
      <Cta copy={copy} size={26 * s} />
    </Frame>
  );
}
