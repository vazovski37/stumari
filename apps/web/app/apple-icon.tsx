import { ImageResponse } from "next/og";
import { S_MARK } from "@/components/brand-paths";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The `s` of the wordmark, white on black (docs/product/brand.md). */
export default function AppleIcon() {
  const h = 180 * 0.52;
  const w = (S_MARK.width / S_MARK.height) * h;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
        <svg width={w} height={h} viewBox={`0 0 ${S_MARK.width} ${S_MARK.height}`}>
          <path d={S_MARK.d} fill="#fff" fillRule="evenodd" />
        </svg>
      </div>
    ),
    size,
  );
}
