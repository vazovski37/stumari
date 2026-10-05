import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { WORDMARK } from "@/components/brand-paths";

export const alt = "Stumari — get paid 24 hours after check-in, with cancellation terms that fit each guest";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Inter Tight (the landing's display face) as static Latin subsets, since satori cannot read variable
// fonts; license next to them. Latin only, so the image is English for every locale.
const fontDir = join(process.cwd(), "app", "_fonts");
const [medium, extraBold] = await Promise.all([
  readFile(join(fontDir, "InterTight-Medium.latin.ttf")),
  readFile(join(fontDir, "InterTight-ExtraBold.latin.ttf")),
]);

export default function OpengraphImage() {
  const markHeight = 46;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#000",
          color: "#fff",
          fontFamily: "Inter Tight",
        }}
      >
        <svg width={(WORDMARK.width / WORDMARK.height) * markHeight} height={markHeight} viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}>
          <path d={WORDMARK.d} fill="#fff" fillRule="evenodd" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, fontWeight: 800, letterSpacing: -2 }}>
          <span style={{ fontSize: 66, lineHeight: 1.04 }}>Get paid 24 hours after check-in.</span>
          {/* Broken by hand: satori has no text-wrap: balance. */}
          <span style={{ fontSize: 66, lineHeight: 1.04, color: "rgba(255, 255, 255, 0.5)" }}>Set cancellation terms</span>
          <span style={{ fontSize: 66, lineHeight: 1.04, color: "rgba(255, 255, 255, 0.5)" }}>that fit each guest.</span>
        </div>
        <span style={{ fontSize: 24, fontWeight: 500, color: "rgba(255, 255, 255, 0.6)", letterSpacing: 1.5 }}>
          STABLECOIN CHECKOUT FOR INDEPENDENT HOTELS · TBILISI PILOT
        </span>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter Tight", data: medium, weight: 500, style: "normal" },
        { name: "Inter Tight", data: extraBold, weight: 800, style: "normal" },
      ],
    },
  );
}
