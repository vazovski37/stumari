/** Test-only access to a Surfpool chain: RPC client plus the `surfnet_*` cheatcodes the tests need. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSolanaRpc, fetchEncodedAccount, getAddressDecoder, some, none, type Address } from "@solana/kit";
import { getMintEncoder, getMintSize, getTokenDecoder, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { STUMARI_ESCROW_PROGRAM_ADDRESS } from "../src";

const PROGRAM_SO = resolve(import.meta.dirname, "../../../onchain/artifacts/stumari_escrow.so");
const CLOCK_SYSVAR = "SysvarC1ock11111111111111111111111111111111" as Address;
const CHUNK = 256 * 1024;

export type TestRpc = ReturnType<typeof createSolanaRpc>;

export class Surfnet {
  readonly rpc: TestRpc;

  constructor(readonly url: string) {
    this.rpc = createSolanaRpc(url);
  }

  async cheat<T = unknown>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = (await res.json()) as { result?: T; error?: { message: string } };
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result as T;
  }

  /** Deploys the committed build as an upgradeable program whose upgrade authority is `authority`. */
  async deployEscrow(authority: Address): Promise<void> {
    const so = readFileSync(PROGRAM_SO);
    for (let offset = 0; offset < so.length; offset += CHUNK) {
      const chunk = so.subarray(offset, offset + CHUNK).toString("hex");
      await this.cheat("surfnet_writeProgram", [STUMARI_ESCROW_PROGRAM_ADDRESS, chunk, offset, authority]);
    }
  }

  async setLamports(account: Address, lamports: bigint): Promise<void> {
    await this.cheat("surfnet_setAccount", [account, { lamports: Number(lamports) }]);
  }

  /** A classic SPL mint with 6 decimals written directly into `mint`. */
  async createMint(mint: Address, authority: Address): Promise<void> {
    const data = getMintEncoder().encode({
      mintAuthority: some(authority),
      supply: 0n,
      decimals: 6,
      isInitialized: true,
      freezeAuthority: none(),
    });
    const rent = await this.rpc.getMinimumBalanceForRentExemption(BigInt(getMintSize())).send();
    await this.cheat("surfnet_setAccount", [
      mint,
      { lamports: Number(rent), owner: TOKEN_PROGRAM_ADDRESS, data: Buffer.from(data).toString("hex") },
    ]);
  }

  /** Creates or overwrites `owner`'s associated token account with `amount`. */
  async setTokenBalance(owner: Address, mint: Address, amount: bigint): Promise<void> {
    await this.cheat("surfnet_setTokenAccount", [owner, mint, { amount: Number(amount), state: "initialized" }]);
  }

  async tokenBalance(tokenAccount: Address): Promise<bigint> {
    const account = await fetchEncodedAccount(this.rpc, tokenAccount, { commitment: "confirmed" });
    return account.exists ? getTokenDecoder().decode(account.data).amount : 0n;
  }

  async lamports(account: Address): Promise<bigint> {
    return (await this.rpc.getBalance(account, { commitment: "confirmed" }).send()).value;
  }

  async exists(account: Address): Promise<boolean> {
    return (await fetchEncodedAccount(this.rpc, account, { commitment: "confirmed" })).exists;
  }

  /** The chain's `Clock.unix_timestamp`. */
  async now(): Promise<bigint> {
    const clock = await fetchEncodedAccount(this.rpc, CLOCK_SYSVAR);
    if (!clock.exists) throw new Error("no clock sysvar");
    return new DataView(clock.data.buffer, clock.data.byteOffset).getBigInt64(32, true);
  }

  /** Moves the clock forward to `unixSeconds` (Surfpool takes milliseconds). */
  async timeTravel(unixSeconds: bigint): Promise<void> {
    await this.cheat("surfnet_timeTravel", [{ absoluteTimestamp: Number(unixSeconds * 1000n) }]);
  }

  /** Upgrade authority recorded in the program's ProgramData account. */
  async upgradeAuthority(programData: Address): Promise<Address | null> {
    const account = await fetchEncodedAccount(this.rpc, programData);
    if (!account.exists || account.data[12] !== 1) return null;
    return getAddressDecoder().decode(account.data.subarray(13, 45));
  }
}
