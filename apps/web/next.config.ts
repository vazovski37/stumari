import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

/**
 * ADR-0008: the fixed program id, inlined so the server can check STUMARI_PROGRAM_ID against it
 * (next runs from apps/web). A deploy without the repo's onchain/ folder skips this check.
 */
function artifactProgramId(): string {
  try {
    return readFileSync(resolve(process.cwd(), "../../onchain/artifacts/program-id.txt"), "utf8").trim();
  } catch {
    return "";
  }
}

// Canonicals, the sitemap and og:url are baked in at build time (lib/site.ts).
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_SITE_URL) {
  const message = "NEXT_PUBLIC_SITE_URL is not set: absolute URLs in this build point at http://localhost:3000";
  if (process.env.VERCEL) throw new Error(message);
  console.warn(`⚠ ${message}`);
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Script nonces would need a proxy (not used, api.md), so the CSP covers framing, plugins and form targets only.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

// Azure App Service (docs/plan/deploy-azure.md) runs the self-contained server: NEXT_OUTPUT=standalone.
// The trace root is the monorepo root so workspace packages and hoisted modules are bundled.
const standalone = process.env.NEXT_OUTPUT === "standalone";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(standalone ? { output: "standalone" as const, outputFileTracingRoot: resolve(process.cwd(), "../..") } : {}),
  env: { STUMARI_ARTIFACT_PROGRAM_ID: artifactProgramId() },
  transpilePackages: ["@stumari/core", "@stumari/escrow-client"],
  serverExternalPackages: ["@libsql/client", "libsql"],
  experimental: {
    // Multiple root layouts ([lang] and (site)) need a routing-level 404.
    globalNotFound: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // English is served without a locale prefix; /ka and /ru are real [lang] segments.
  async redirects() {
    return [
      { source: "/en", destination: "/", permanent: true },
      { source: "/en/apply", destination: "/apply", permanent: true },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/en" },
        { source: "/apply", destination: "/en/apply" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
