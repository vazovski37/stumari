/** Public base URL (NEXT_PUBLIC_SITE_URL is inlined at build time) used for metadata and absolute links. */
export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
