import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createSolanaRpc, fetchEncodedAccount, generateKeyPairSigner, type Address } from "@solana/kit";
import { fetchHotel, fetchMaybeConfig, findAta, findHotelPda } from "@stumari/escrow-client";
import { uuidToBytes } from "@stumari/core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as applicationsRoute from "@/app/api/applications/route";
import * as adminApplications from "@/app/api/admin/applications/route";
import * as convertRoute from "@/app/api/admin/applications/[id]/convert/route";
import * as hotelRoute from "@/app/api/admin/hotels/[id]/route";
import * as registerRoute from "@/app/api/admin/hotels/[id]/register/route";
import * as roomTypesRoute from "@/app/api/admin/hotels/[id]/room-types/route";
import * as unitsRoute from "@/app/api/admin/hotels/[id]/room-types/[rtId]/units/route";
import * as dashboardUnits from "@/app/api/dashboard/[hotelId]/units/route";
import { tempDb } from "@/test/db";
import { params, request, sessionFor, SITE, TEST_AUTH_SECRET, useDb } from "@/test/http";
import type { Db } from "../db/client";

/**
 * The onboarding sequence over the real admin route handlers against the local Surfpool chain
 * (`scripts/localnet.sh start` + `bootstrap --cluster localnet`), using the operator key from
 * apps/web/.env.local. Skipped unless that file points at a running surfnet with the escrow
 * Config initialized; it never runs against devnet or mainnet.
 */

const CHAIN_KEYS = ["STUMARI_CLUSTER", "SOLANA_RPC_URL", "STUMARI_PROGRAM_ID", "STUMARI_MINT", "OPERATOR_SECRET_KEY", "ADMIN_SECRET_KEY"] as const;

async function localnetEnv(): Promise<Record<string, string> | null> {
  const file = fileURLToPath(new URL("../../.env.local", import.meta.url));
  if (!existsSync(file)) return null;
  const env = parseEnv(readFileSync(file, "utf8")) as Record<string, string | undefined>;
  const rpcUrl = env.SOLANA_RPC_URL ?? "";
  if (env.STUMARI_CLUSTER !== "localnet" || !env.OPERATOR_SECRET_KEY || !env.STUMARI_MINT || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(rpcUrl)) return null;
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getVersion", params: [] }),
      signal: AbortSignal.timeout(2_000),
    });
    const version = ((await res.json()) as { result?: Record<string, unknown> }).result ?? {};
    if (!("surfnet-version" in version)) return null;
    if (!(await fetchMaybeConfig(createSolanaRpc(rpcUrl)))) return null;
  } catch {
    return null;
  }
  return Object.fromEntries(CHAIN_KEYS.map((k) => [k, env[k] ?? ""]));
}

const chainEnv = await localnetEnv();
if (!chainEnv) console.warn("onboarding.localnet.test: no local surfnet with the escrow Config (see scripts/README.md) — skipped");

describe.runIf(chainEnv)("onboarding API on localnet", () => {
  const admin = { wallet: "" };
  let db: Db;
  let close: () => void;

  beforeAll(async () => {
    admin.wallet = (await generateKeyPairSigner()).address;
    for (const [k, v] of Object.entries(chainEnv!)) vi.stubEnv(k, v);
    vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
    vi.stubEnv("ADMIN_WALLETS", admin.wallet);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  });
  afterAll(() => vi.unstubAllEnvs());
  beforeEach(async () => {
    ({ db, close } = await tempDb());
    useDb(db);
  });
  afterEach(() => close());

  const asAdmin = (method: string, path: string, body?: unknown) => request(method, path, { cookie: sessionFor(admin.wallet), body });
  async function json<T>(res: Response, status: number): Promise<T> {
    const body = (await res.json()) as T;
    expect(res.status, JSON.stringify(body)).toBe(status);
    return body;
  }

  it("application → convert → room type → unit → payout wallet → register_hotel lands → pause → new payout wallet", { timeout: 120_000 }, async () => {
    const rpc = createSolanaRpc(chainEnv!.SOLANA_RPC_URL!);

    await json(
      await applicationsRoute.POST(
        request("POST", "/api/applications", {
          body: { hotel_name: "Localnet Test Guesthouse", city: "Tbilisi", contact_name: "Nino", role: "owner", phone: "+995 555 123 456", locale: "en", consent: true },
        }),
      ),
      201,
    );
    const [app] = await json<{ id: string; hotel_id: string | null }[]>(await adminApplications.GET(asAdmin("GET", "/api/admin/applications")), 200);
    expect(app!.hotel_id).toBeNull();

    const draft = await json<{ id: string; slug: string; status: string }>(
      await convertRoute.POST(asAdmin("POST", `/api/admin/applications/${app!.id}/convert`), params({ id: app!.id })),
      201,
    );
    expect(draft).toMatchObject({ slug: "localnet-test-guesthouse", status: "draft" });
    const hotelPath = `/api/admin/hotels/${draft.id}`;
    const repeat = await convertRoute.POST(asAdmin("POST", `/api/admin/applications/${app!.id}/convert`), params({ id: app!.id }));
    expect(repeat.status).toBe(409);

    await json(await hotelRoute.PATCH(asAdmin("PATCH", hotelPath, { address: "Sololaki 1", phone: "+995 555 123 456" }), params({ id: draft.id })), 200);
    const rt = await json<{ id: string }>(
      await roomTypesRoute.POST(asAdmin("POST", `${hotelPath}/room-types`, { name: "Double room", base_rate_minor: "65000000", meal: "BB" }), params({ id: draft.id })),
      201,
    );
    const unit = await json<{ id: string; export_url: string }>(
      await unitsRoute.POST(asAdmin("POST", `${hotelPath}/room-types/${rt.id}/units`, { label: "D1" }), params({ id: draft.id, rtId: rt.id })),
      201,
    );
    expect(unit.export_url).toMatch(new RegExp(`^${SITE}/api/ical/[0-9a-f]{64}$`));

    // Not yet: activation needs registration, registration needs a payout wallet.
    expect((await hotelRoute.PATCH(asAdmin("PATCH", hotelPath, { status: "active" }), params({ id: draft.id }))).status).toBe(409);
    expect((await registerRoute.POST(asAdmin("POST", `${hotelPath}/register`), params({ id: draft.id }))).status).toBe(409);
    const operator = (await import("../keys")).parseSecretKey(chainEnv!.OPERATOR_SECRET_KEY!).publicKey;
    expect((await hotelRoute.PATCH(asAdmin("PATCH", hotelPath, { payout_wallet: operator }), params({ id: draft.id }))).status).toBe(400);

    const payout = (await generateKeyPairSigner()).address;
    await json(await hotelRoute.PATCH(asAdmin("PATCH", hotelPath, { payout_wallet: payout }), params({ id: draft.id })), 200);

    const registered = await json<{ hotel: { status: string; onchain_hotel: string }; signature: string | null }>(
      await registerRoute.POST(asAdmin("POST", `${hotelPath}/register`), params({ id: draft.id })),
      200,
    );
    const pda = await findHotelPda(uuidToBytes(draft.id));
    expect(registered.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/);
    expect(registered.hotel).toMatchObject({ status: "active", onchain_hotel: pda });
    expect(await fetchHotel(rpc, pda, { commitment: "confirmed" })).toMatchObject({ authority: payout, active: true });
    const ata = await fetchEncodedAccount(rpc, await findAta(payout, chainEnv!.STUMARI_MINT as Address), { commitment: "confirmed" });
    expect(ata.exists).toBe(true);

    // Idempotent: nothing to send the second time.
    const again = await json<{ signature: string | null }>(await registerRoute.POST(asAdmin("POST", `${hotelPath}/register`), params({ id: draft.id })), 200);
    expect(again.signature).toBeNull();

    const paused = await json<{ hotel: { status: string }; chain: { signature: string; active: boolean } }>(
      await hotelRoute.PATCH(asAdmin("PATCH", hotelPath, { status: "paused" }), params({ id: draft.id })),
      200,
    );
    expect(paused.hotel.status).toBe("paused");
    expect(paused.chain.active).toBe(false);
    expect((await fetchHotel(rpc, pda, { commitment: "confirmed" })).active).toBe(false);

    const next = (await generateKeyPairSigner()).address;
    await json(await hotelRoute.PATCH(asAdmin("PATCH", hotelPath, { payout_wallet: next }), params({ id: draft.id })), 200);
    expect(await fetchHotel(rpc, pda, { commitment: "confirmed" })).toMatchObject({ authority: next, active: false });

    // The new payout wallet now signs in as the hotel and sees its units and export feed.
    const units = await json<{ units: { export_url: string }[] }[]>(
      await dashboardUnits.GET(request("GET", `/api/dashboard/${draft.id}/units`, { cookie: sessionFor(next) }), params({ hotelId: draft.id })),
      200,
    );
    expect(units[0]!.units[0]!.export_url).toBe(unit.export_url);
  });
});
