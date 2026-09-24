import { serverEnv } from "@/lib/env";
import { publicConfig } from "@/lib/public-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(publicConfig(serverEnv()), {
    headers: { "cache-control": "public, max-age=60" },
  });
}
