import { ImageResponse } from "next/og";

export const alt = "Stumari — get paid 24 hours after check-in, with cancellation terms that fit each guest";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The bundled OG font covers Latin only, so the image is English for every locale.
export default function OpengraphImage() {
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
          background: "#4e121d",
          color: "#faf6ef",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8" fill="#7a1f30" />
            <path d="M9 27V15a7 7 0 0 1 14 0v12z" fill="#faf6ef" />
            <circle cx="16" cy="19" r="3.25" fill="#d99a2b" />
          </svg>
          <span style={{ fontSize: 40, fontWeight: 700 }}>Stumari</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>Get paid 24 hours after check-in.</span>
          <span style={{ fontSize: 44, color: "#f4e3c1", lineHeight: 1.2 }}>Set cancellation terms that fit each guest.</span>
        </div>
        <span style={{ fontSize: 26, color: "#d99a2b" }}>
          Stablecoin checkout for independent hotels · Tbilisi pilot
        </span>
      </div>
    ),
    size,
  );
}
