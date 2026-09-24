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

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

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
    z.string().min(32, { message: "AUTH_SECRET must be at least 32 characters (use 32 random bytes as hex)" }).optional(),
  ),
  CRON_SECRET: optionalString,
  LIBSQL_URL: optionalString,
  LIBSQL_AUTH_TOKEN: optionalString,
  STUMARI_DEMO_MODE: booleanFlag.default(false),
  NEXT_PUBLIC_SITE_URL: optionalString.pipe(z.url().optional()),
  AMOUNT_CAP_MINOR: optionalString.pipe(
    z.string().regex(/^[1-9][0-9]{0,19}$/, { message: "AMOUNT_CAP_MINOR must be a positive integer (base units)" }).optional(),
  ),
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_CHAT_ID: optionalString,
});

export type ServerEnv = {
  nodeEnv: "development" | "production" | "test";
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
  siteUrl: string;
  amountCapMinor: bigint;
  telegram: { botToken: string; chatId: string } | null;
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
  if (production && !raw.NEXT_PUBLIC_SITE_URL) problems.push("NEXT_PUBLIC_SITE_URL: required in production");
  if (problems.length > 0) throw new EnvError(problems);

  const operator = raw.OPERATOR_SECRET_KEY ?? null;
  const amountCap = raw.AMOUNT_CAP_MINOR;

  return {
    nodeEnv: raw.NODE_ENV,
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
    siteUrl: (raw.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
    amountCapMinor: amountCap === undefined ? DEFAULT_AMOUNT_CAP_MINOR : BigInt(amountCap),
    telegram:
      raw.TELEGRAM_BOT_TOKEN && raw.TELEGRAM_CHAT_ID
        ? { botToken: raw.TELEGRAM_BOT_TOKEN, chatId: raw.TELEGRAM_CHAT_ID }
        : null,
  };
}
