/** Surfpool `surfnet_*` cheatcodes (localnet only, ADR-0015). Wire shapes: solana-dev surfpool/cheatcodes.md. */
import type { Address } from "@solana/kit";

const CHUNK_BYTES = 256 * 1024;

export class Surfnet {
  constructor(readonly url: string) {}

  /** True when `url` answers getVersion as a surfnet (never a real cluster). */
  static async detect(url: string): Promise<boolean> {
    try {
      const version = await rpcCall<Record<string, unknown>>(url, "getVersion", []);
      return "surfnet-version" in version;
    } catch {
      return false;
    }
  }

  cheat<T = unknown>(method: `surfnet_${string}`, params: unknown[]): Promise<T> {
    return rpcCall<T>(this.url, method, params);
  }

  async setLamports(account: Address, lamports: bigint): Promise<void> {
    await this.cheat("surfnet_setAccount", [account, { lamports: Number(lamports) }]);
  }

  /** Overwrites an account's data (hex), keeping lamports/owner as given. */
  async setAccount(account: Address, update: { lamports: bigint; owner: Address; data: Uint8Array; executable: boolean }) {
    await this.cheat("surfnet_setAccount", [
      account,
      {
        lamports: Number(update.lamports),
        owner: update.owner,
        executable: update.executable,
        data: Buffer.from(update.data).toString("hex"),
      },
    ]);
  }

  /** Deploys `so` as an upgradeable program with `authority` as upgrade authority, in 256 KiB chunks. */
  async writeProgram(programId: Address, so: Uint8Array, authority: Address): Promise<void> {
    for (let offset = 0; offset < so.length; offset += CHUNK_BYTES) {
      const chunk = Buffer.from(so.subarray(offset, offset + CHUNK_BYTES)).toString("hex");
      await this.cheat("surfnet_writeProgram", [programId, chunk, offset, authority]);
    }
  }

  /** Moves the clock to `unixSeconds` (Surfpool takes milliseconds). */
  async timeTravel(unixSeconds: bigint): Promise<void> {
    await this.cheat("surfnet_timeTravel", [{ absoluteTimestamp: Number(unixSeconds * 1000n) }]);
  }
}

async function rpcCall<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result as T;
}
