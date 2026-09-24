import { serverEnv } from "@/lib/env";
import { publicConfig } from "@/lib/public-config";
import { onchainConfig } from "@/lib/solana/chain-config";
import { chain } from "@/lib/solana/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const env = serverEnv();
  const config = await chain()
    .then((c) => onchainConfig(c.rpc))
    .catch(() => null);
  return Response.json(publicConfig(env, config), {
    headers: { "cache-control": "public, max-age=60" },
  });
}
