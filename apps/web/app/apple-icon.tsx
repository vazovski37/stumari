import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#7a1f30" }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
          <path d="M9 27V15a7 7 0 0 1 14 0v12z" fill="#faf6ef" />
          <circle cx="16" cy="19" r="3.25" fill="#d99a2b" />
        </svg>
      </div>
    ),
    size,
  );
}
