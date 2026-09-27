import { z } from "zod";
import { isBase58Address, parseSecretKey, type ParsedSecretKey } from "./keys";

export const clusters = ["localnet", "devnet", "mainnet-beta"] as const;
export type Cluster = (typeof clusters)[number];

/** Fixed program id (ADR-0008). */
export const DEFAULT_PROGRAM_ID = "6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf";
export const DEFAULT_LIBSQL_URL = "file:./.data/stumari.db";
/** 1,500 USDC in base units (6 decimals). */
export const DEFAULT_AMOUNT_CAP_MINOR = 1_500_000_000n;

/** Used only outside production so `next dev` works without a .env.local. Never valid in production. */
const DEV_AUTH_SECRET = "dev-only-insecure-auth-secret-0123456789abcdef0123456789abcdef";

const defaultRpcUrl: Record<Cluster, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

/** Meta Pixel ids are numeric (Events Manager → Data sources). */
export const META_PIXEL_ID_PATTERN = /^[0-9]{5,20}$/;

/**
 * The configured Meta Pixel id, or null when unset or malformed (then no consent banner is shown and no
 * pixel loads). Lenient on purpose: the landing layout reads it at build time without the full server env;
 * `parseServerEnv` rejects a malformed value loudly.
 */
export function metaPixelIdFrom(raw: string | undefined | null): string | null {
  const value = raw?.trim() ?? "";
  return META_PIXEL_ID_PATTERN.test(value) ? value : null;
}

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/** Mews Connector API environments (docs/architecture/mews-inventory.md). */
export const MEWS_DEMO_URL = "https://api.mews-demo.com";
const MEWS_DEMO_HOST = "api.mews-demo.com";
export const DEFAULT_MEWS_CLIENT = "Stumari 0.1.0";

export type MewsEnv = {
  platformUrl: string;
  clientToken: string;
  accessToken: string;
  /** `Client` sent with every request (app name + version). */
  client: string;
  /** Anything but the public demo host; only with MEWS_ALLOW_PRODUCTION=1. */
  production: boolean;
};

const address = (name: string) =>
  z.string().trim().refine(isBase58Address, { message: `${name} must be a base58 Solana address` });

const secretKey = z
  .string()
  .transform((raw, ctx): ParsedSecretKey | typeof z.NEVER => {
    try {
      return parseSecretKey(raw);
    } catch (error) {
      ctx.addIssue({ code: "custom", message: (error as Error).message });
      return z.NEVER;
    }
  });

const booleanFlag = z
  .enum(["true", "false", "1", "0", ""])
  .transform((v) => v === "true" || v === "1");

const rawSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  VERCEL: optionalString,
  STUMARI_CLUSTER: z.enum(clusters).default("devnet"),
  SOLANA_RPC_URL: optionalString.pipe(z.url().optional()),
  STUMARI_PROGRAM_ID: optionalString.pipe(address("STUMARI_PROGRAM_ID").optional()),
  STUMARI_MINT: optionalString.pipe(address("STUMARI_MINT").optional()),
  OPERATOR_SECRET_KEY: optionalString.pipe(secretKey.optional()),
  ADMIN_SECRET_KEY: optionalString.pipe(secretKey.optional()),
  ADMIN_WALLETS: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((w) => w.trim()).filter((w) => w !== ""))
    .pipe(z.array(address("ADMIN_WALLETS entry"))),
  AUTH_SECRET: optionalString.pipe(
    z
      .string()
      .regex(/^[0-9a-fA-F]{64,}$/, { message: "AUTH_SECRET must be at least 32 random bytes as hex (64+ hex characters)" })
      .optional(),
  ),
  CRON_SECRET: optionalString,
  LIBSQL_URL: optionalString,
  LIBSQL_AUTH_TOKEN: optionalString,
  STUMARI_DEMO_MODE: booleanFlag.default(false),
  ICAL_ALLOW_LOOPBACK: booleanFlag.default(false),
  NEXT_PUBLIC_SITE_URL: optionalString.pipe(z.url().optional()),
  AMOUNT_CAP_MINOR: optionalString.pipe(
    z.string().regex(/^[1-9][0-9]{0,19}$/, { message: "AMOUNT_CAP_MINOR must be a positive integer (base units)" }).optional(),
  ),
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_CHAT_ID: optionalString,
  // Validated by parseMewsEnv: a bad optional Mews setting disables Mews, not the whole app.
  MEWS_PLATFORM_URL: optionalString,
  MEWS_CLIENT_TOKEN: optionalString,
  MEWS_ACCESS_TOKEN: optionalString,
  MEWS_CLIENT: optionalString,
  MEWS_ALLOW_PRODUCTION: optionalString,
  NEXT_PUBLIC_META_PIXEL_ID: optionalString.pipe(
    z.string().regex(META_PIXEL_ID_PATTERN, { message: "NEXT_PUBLIC_META_PIXEL_ID must be the numeric pixel id (digits only)" }).optional(),
  ),
});

export type ServerEnv = {
  nodeEnv: "development" | "production" | "test";
  /** Running on Vercel: only then is the first X-Forwarded-For entry the client's address. */
  onVercel: boolean;
  cluster: Cluster;
  rpcUrl: string;
  programId: string;
  /** Accepted stablecoin mint; null until the devnet bootstrap has created it. */
  mint: string | null;
  /** Fee payer, rent payer and quote signer; null until configured. */
  operator: ParsedSecretKey | null;
  /** Arbiter stub; defaults to the operator key. */
  admin: ParsedSecretKey | null;
  adminWallets: string[];
  authSecret: string;
  /** Bearer token for /api/cron/*; cron routes must refuse to run when null. */
  cronSecret: string | null;
  libsqlUrl: string;
  libsqlAuthToken: string | null;
  /** Demo wallet + faucet. Always false on mainnet. */
  demoMode: boolean;
  /** Test-only: iCal import URLs may be plain-http loopback (the local E2E's fixture feed). Never on mainnet or Vercel. */
  icalAllowLoopback: boolean;
  siteUrl: string;
  amountCapMinor: bigint;
  telegram: { botToken: string; chatId: string } | null;
  /** Meta Pixel id for ad measurement; loaded in the browser only after the visitor accepts (consent banner). */
  metaPixelId: string | null;
  /** Mews Connector API credentials (single pilot hotel); null when the tokens are unset or a Mews setting is invalid. */
  mews: MewsEnv | null;
  /**
   * Why Mews is off although something was set (value-free messages). A bad Mews setting never fails
   * the whole environment: Mews hotels answer 503 until it is fixed, and startup logs a warning.
   */
  mewsProblems: string[];
};

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid server environment:\n- ${problems.join("\n- ")}`);
    this.name = "EnvError";
  }
}

/**
 * Validates the server environment. Solana settings are optional here so the
 * landing page and apply form can be deployed before the chain setup exists;
 * features that need them check for null. Messages never echo values.
 */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = rawSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  const raw = result.data;
  const production = raw.NODE_ENV === "production";
  const problems: string[] = [];

  if (production && !raw.AUTH_SECRET) problems.push("AUTH_SECRET: required in production");
  const libsqlUrl = raw.LIBSQL_URL ?? DEFAULT_LIBSQL_URL;
  if (raw.VERCEL && libsqlUrl.startsWith("file:")) {
    problems.push("LIBSQL_URL: a file: database cannot be used on Vercel; use a libsql://…turso.io URL");
  }
  if (raw.ICAL_ALLOW_LOOPBACK && (raw.STUMARI_CLUSTER !== "localnet" || raw.VERCEL)) {
    problems.push("ICAL_ALLOW_LOOPBACK: test-only; allowed only with STUMARI_CLUSTER=localnet and never on Vercel");
  }
  if (production && !raw.NEXT_PUBLIC_SITE_URL) problems.push("NEXT_PUBLIC_SITE_URL: required in production");
  if (production && libsqlUrl.startsWith("libsql://") && !raw.LIBSQL_AUTH_TOKEN) {
    problems.push("LIBSQL_AUTH_TOKEN: required in production for a libsql:// database");
  }
  const mews = parseMewsEnv(source);
  if (problems.length > 0) throw new EnvError(problems);

  const operator = raw.OPERATOR_SECRET_KEY ?? null;
  const amountCap = raw.AMOUNT_CAP_MINOR;

  return {
    nodeEnv: raw.NODE_ENV,
    onVercel: raw.VERCEL !== undefined,
    cluster: raw.STUMARI_CLUSTER,
    rpcUrl: raw.SOLANA_RPC_URL ?? defaultRpcUrl[raw.STUMARI_CLUSTER],
    programId: raw.STUMARI_PROGRAM_ID ?? DEFAULT_PROGRAM_ID,
    mint: raw.STUMARI_MINT ?? null,
    operator,
    admin: raw.ADMIN_SECRET_KEY ?? operator,
    adminWallets: raw.ADMIN_WALLETS,
    authSecret: raw.AUTH_SECRET ?? DEV_AUTH_SECRET,
    cronSecret: raw.CRON_SECRET ?? null,
    libsqlUrl,
    libsqlAuthToken: raw.LIBSQL_AUTH_TOKEN ?? null,
    demoMode: raw.STUMARI_DEMO_MODE && raw.STUMARI_CLUSTER !== "mainnet-beta",
    icalAllowLoopback: raw.ICAL_ALLOW_LOOPBACK,
    siteUrl: (raw.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
    amountCapMinor: amountCap === undefined ? DEFAULT_AMOUNT_CAP_MINOR : BigInt(amountCap),
    telegram:
      raw.TELEGRAM_BOT_TOKEN && raw.TELEGRAM_CHAT_ID
        ? { botToken: raw.TELEGRAM_BOT_TOKEN, chatId: raw.TELEGRAM_CHAT_ID }
        : null,
    metaPixelId: raw.NEXT_PUBLIC_META_PIXEL_ID ?? null,
    mews: mews.env,
    mewsProblems: mews.problems,
  };
}

/**
 * MEWS_ALLOW_PRODUCTION: `1` or `true` (any case) allow a production Mews host; `0`, `false` or unset
 * do not. The same values as `configFromEnv` in packages/mews-client.
 */
export function mewsAllowProduction(value: string | undefined): boolean | null {
  const v = value?.trim().toLowerCase() ?? "";
  if (v === "1" || v === "true") return true;
  if (v === "" || v === "0" || v === "false") return false;
  return null;
}

/**
 * MEWS_*: both tokens or neither; https only; any host but the public demo counts as production and
 * is refused unless MEWS_ALLOW_PRODUCTION is 1/true (Mews production access = a certified private
 * integration). Never throws: a bad setting gives `env: null` plus value-free `problems`, so the rest
 * of the app keeps running and Mews hotels answer 503 until it is fixed.
 */
export function parseMewsEnv(source: Readonly<Record<string, string | undefined>>): { env: MewsEnv | null; problems: string[] } {
  const value = (name: string) => {
    const v = source[name]?.trim();
    return v ? v : undefined;
  };
  const clientToken = value("MEWS_CLIENT_TOKEN");
  const accessToken = value("MEWS_ACCESS_TOKEN");
  const rawUrl = value("MEWS_PLATFORM_URL");
  const allowRaw = value("MEWS_ALLOW_PRODUCTION");
  const problems: string[] = [];
  if (!clientToken !== !accessToken) problems.push("MEWS_CLIENT_TOKEN, MEWS_ACCESS_TOKEN: set both or neither");
  const allow = mewsAllowProduction(allowRaw);
  if (allow === null) problems.push("MEWS_ALLOW_PRODUCTION: must be 1, true, 0 or false");
  const platformUrl = (rawUrl ?? MEWS_DEMO_URL).replace(/\/+$/, "");
  let url: URL | null = null;
  try {
    url = new URL(platformUrl);
  } catch {
    problems.push("MEWS_PLATFORM_URL: must be a URL");
  }
  const production = url === null || url.host.toLowerCase() !== MEWS_DEMO_HOST;
  if (url && url.protocol !== "https:") problems.push("MEWS_PLATFORM_URL: must use https");
  if (url && production && allow !== true) {
    problems.push(`MEWS_PLATFORM_URL: only the Mews demo environment (${MEWS_DEMO_HOST}) is allowed unless MEWS_ALLOW_PRODUCTION=1 (or true)`);
  }
  // No tokens at all: Mews is simply off, whatever the other Mews settings say.
  if (!clientToken && !accessToken) return { env: null, problems: [] };
  if (problems.length > 0 || !clientToken || !accessToken || !url) return { env: null, problems };
  return {
    env: { platformUrl, clientToken, accessToken, client: value("MEWS_CLIENT") ?? DEFAULT_MEWS_CLIENT, production },
    problems: [],
  };
}
