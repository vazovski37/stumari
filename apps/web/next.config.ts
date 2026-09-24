import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Script nonces would need a proxy (not used, api.md), so the CSP covers framing, plugins and form targets only.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
