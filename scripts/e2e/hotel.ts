/**
 * The E2E runs against its own database (apps/web/.data/e2e.db, recreated every run) so the demo
 * database the founders click through never collects test bookings. It holds the demo hotel exactly
 * as the bootstrap seeds it, registered on-chain with a fresh payout wallet so hotel balances start at 0.
 */
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { generateKeyPairSigner, type Address, type KeyPairSigner } from "@solana/kit";
import { uuidToBytes } from "@stumari/core";
import { buildRegisterHotelTx, findHotelPda, sendBuiltTx } from "@stumari/escrow-client";
import { migrateWebDb, openWebDb } from "../lib/db";
import { recordRegistration, seedDemoHotel } from "../lib/demo";
import type { Env } from "../lib/env";
import { ensureAta } from "../lib/mint";
import { WEB_DIR } from "../lib/paths";
import type { SolanaRpc } from "../lib/rpc";

const E2E_DB = resolve(WEB_DIR, ".data/e2e.db");
export const E2E_DB_URL = `file:${E2E_DB.replaceAll("\\", "/")}`;

export interface E2eHotel {
  id: string;
  slug: string;
  payoutWallet: Address;
  payoutAta: Address;
}

export async function prepareE2eHotel(rpc: SolanaRpc, operator: KeyPairSigner, env: Env, mint: Address): Promise<E2eHotel> {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    if (existsSync(E2E_DB + suffix)) rmSync(E2E_DB + suffix);
  }
  const dbEnv: Env = { ...env, LIBSQL_URL: E2E_DB_URL, LIBSQL_AUTH_TOKEN: undefined };
  migrateWebDb(dbEnv);
  const payout = await generateKeyPairSigner();
  const db = openWebDb(dbEnv);
  try {
    const { hotel } = await seedDemoHotel(db, payout.address);
    const hotelId = uuidToBytes(hotel.id);
    const { signature } = await sendBuiltTx(
      rpc,
      await buildRegisterHotelTx({ rpc, operator, admin: operator, hotelId, authority: payout.address }),
    );
    await recordRegistration(db, hotel, await findHotelPda(hotelId), signature);
    const { ata } = await ensureAta(rpc, operator, payout.address, mint);
    return { id: hotel.id, slug: hotel.slug, payoutWallet: payout.address, payoutAta: ata };
  } finally {
    db.$client.close();
  }
}
