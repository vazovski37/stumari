import { AccountRole, getBase64Encoder, getTransactionDecoder } from "@solana/kit";
import { TEMPLATES } from "@stumari/core";
import { beforeAll, describe, expect, it } from "vitest";
import { type AgentWallet, type SignRequest, PolicyError } from "../src/agent";
import type { PublicConfig } from "../src/schemas";
import { type ExpectedCreate, GuardError, STUMARI_ESCROW_PROGRAM_ID } from "../src/tx-guard";
import {
  AGENT,
  CREATE_DEFAULTS,
  DISC,
  HOTEL,
  MINT,
  OPERATOR,
  OTHER,
  ataCreateIx,
  buildTx,
  cancelIx,
  computeUnitLimitIx,
  createBookingIx,
  hotelPdaOf,
  pda,
  systemTransferIx,
} from "./fake-api";
import { agentWallet } from "./helpers";

const CONFIG: PublicConfig = {
  cluster: "devnet",
  program_id: STUMARI_ESCROW_PROGRAM_ID,
  mint: MINT,
  quote_signer: OPERATOR,
  demo_mode: true,
};
const BOOKING_ID = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const QUOTE_HASH = new Uint8Array(32).fill(7);
const AMOUNT = 130_000_000n;
let CREATE: ExpectedCreate;
const CANCEL = { kind: "cancel_booking", bookingId: BOOKING_ID, minRefund: 65_000_000n } as const;

let agent: AgentWallet;
beforeAll(async () => {
  agent = await agentWallet();
  CREATE = {
    kind: "create_booking",
    bookingId: BOOKING_ID,
    amount: AMOUNT,
    quoteHash: QUOTE_HASH,
    tiers: TEMPLATES.standard.tiers,
    hotel: await hotelPdaOf(HOTEL.id),
    mint: MINT,
    ...CREATE_DEFAULTS,
  };
});

const createIx = (overrides: Partial<Parameters<typeof createBookingIx>[0]> = {}) =>
  createBookingIx({ guest: AGENT, bookingId: BOOKING_ID, amount: AMOUNT, quoteHash: QUOTE_HASH, ...overrides });

function sign(txBase64: string, overrides: Partial<SignRequest> = {}) {
  return agent.sign({ config: CONFIG, amountMinor: AMOUNT, txBase64, action: CREATE, ...overrides });
}

async function expectGuard(promise: Promise<unknown>, code: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(GuardError);
  expect((err as GuardError).code).toBe(code);
}

async function expectPolicy(promise: Promise<unknown>, code: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(PolicyError);
  expect((err as PolicyError).code).toBe(code);
}

describe("agent signing: accepted transactions", () => {
  it("signs a well-formed create_booking and keeps the operator signature", async () => {
    const signed = await sign(await buildTx([computeUnitLimitIx(200_000), await createIx()]));
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(signed.txBase64));
    expect(tx.signatures[AGENT]).toBeInstanceOf(Uint8Array);
    expect(tx.signatures[OPERATOR]).toBeInstanceOf(Uint8Array);
  });

  it("signs a price exactly at the cap", async () => {
    const tx = await buildTx([await createIx()]);
    const capped = await agentWallet(AMOUNT);
    await expect(capped.sign({ config: CONFIG, amountMinor: AMOUNT, txBase64: tx, action: CREATE })).resolves.toBeDefined();
  });

  it("signs a cancel with an operator-paid idempotent ATA creation and returns min_refund", async () => {
    const tx = await buildTx([await ataCreateIx(OPERATOR, AGENT), await cancelIx({ guest: AGENT, bookingId: BOOKING_ID, minRefund: 65_000_000n })]);
    const signed = await sign(tx, { action: CANCEL });
    expect(signed.minRefund).toBe(65_000_000n);
  });

});

describe("agent signing: policy guards", () => {
  it("refuses mainnet-beta", async () => {
    await expectPolicy(sign(await buildTx([await createIx()]), { config: { ...CONFIG, cluster: "mainnet-beta" } }), "MAINNET_REFUSED");
  });

  it("refuses an amount above AGENT_MAX_AMOUNT_MINOR", async () => {
    const tx = await buildTx([await createIx({ amount: 500_000_001n })]);
    await expectPolicy(sign(tx, { amountMinor: 500_000_001n, action: { ...CREATE, amount: 500_000_001n } }), "AMOUNT_OVER_AGENT_CAP");
  });

  it("refuses when the API reports another program id", async () => {
    await expectPolicy(sign(await buildTx([await createIx()]), { config: { ...CONFIG, program_id: OTHER } }), "PROGRAM_MISMATCH");
  });

  it("refuses when no quote signer is configured", async () => {
    await expectPolicy(sign(await buildTx([await createIx()]), { config: { ...CONFIG, quote_signer: null } }), "NO_QUOTE_SIGNER");
  });
});

describe("agent signing: transaction guards", () => {
  it("rejects bytes that are not a transaction", async () => {
    await expectGuard(sign("aGVsbG8gd29ybGQ="), "TX_DECODE_FAILED");
  });

  it("rejects a legacy transaction", async () => {
    await expectGuard(sign(await buildTx([await createIx()], { version: "legacy" })), "UNSUPPORTED_TX_VERSION");
  });

  it("rejects address lookup tables", async () => {
    const tx = await buildTx([await createIx()], { lookupAccount: MINT });
    await expectGuard(sign(tx), "ADDRESS_LOOKUP_TABLES");
  });

  it("rejects a fee payer other than config.quote_signer", async () => {
    await expectGuard(sign(await buildTx([await createIx()], { feePayer: AGENT })), "FEE_PAYER_MISMATCH");
  });

  it("rejects a transaction the agent is not asked to sign", async () => {
    await expectGuard(sign(await buildTx([await createIx({ guest: OTHER })])), "NOT_A_SIGNER");
  });

  it("rejects zero escrow instructions", async () => {
    await expectGuard(sign(await buildTx([systemTransferIx(AGENT, OTHER, 1n)])), "ESCROW_INSTRUCTION_COUNT");
  });

  it("rejects two escrow instructions", async () => {
    await expectGuard(sign(await buildTx([await createIx(), await createIx()])), "ESCROW_INSTRUCTION_COUNT");
  });

  it("rejects an extra instruction that could move the agent's funds", async () => {
    await expectGuard(sign(await buildTx([await createIx(), systemTransferIx(AGENT, OTHER, 1_000_000n)])), "FOREIGN_INSTRUCTION");
  });

  it("rejects an ATA creation paid by the agent", async () => {
    await expectGuard(sign(await buildTx([await ataCreateIx(AGENT, AGENT), await createIx()])), "FOREIGN_INSTRUCTION");
  });

  it("rejects an escrow instruction of the wrong kind", async () => {
    await expectGuard(sign(await buildTx([await createIx({ discriminator: DISC.cancel_booking })])), "WRONG_INSTRUCTION");
    const cancel = await buildTx([await cancelIx({ guest: AGENT, bookingId: BOOKING_ID, minRefund: 1n })]);
    await expectGuard(sign(cancel), "WRONG_INSTRUCTION");
  });

  it("rejects a booking account that is not the PDA of the quote's booking id", async () => {
    const tx = await buildTx([await createIx({ bookingAccount: await pda("booking", new Uint8Array(16)) })]);
    await expectGuard(sign(tx), "ACCOUNT_MISMATCH");
  });

  it("rejects an instruction whose guest is another wallet while the agent still signs", async () => {
    const ix = await createIx({ guest: OTHER });
    const withAgent = { ...ix, accounts: [...ix.accounts!, { address: AGENT, role: AccountRole.READONLY_SIGNER }] };
    await expectGuard(sign(await buildTx([withAgent])), "ACCOUNT_MISMATCH");
  });

  it("rejects an escrowed amount different from the chosen option", async () => {
    await expectGuard(sign(await buildTx([await createIx({ amount: AMOUNT + 1n })])), "AMOUNT_MISMATCH");
  });

  it("rejects a quote hash different from the verified quote", async () => {
    await expectGuard(sign(await buildTx([await createIx({ quoteHash: new Uint8Array(32).fill(8) })])), "QUOTE_HASH_MISMATCH");
  });

  it("rejects refund terms other than the chosen option's (e.g. non-refundable tiers at the standard price)", async () => {
    const tx = await buildTx([await createIx({ tiers: TEMPLATES.nonrefundable.tiers })]);
    await expectGuard(sign(tx), "TERMS_MISMATCH");
  });

  it("rejects another option index, check-in, check-out or quote expiry", async () => {
    for (const overrides of [
      { optionIndex: 2 },
      { checkinTs: CREATE_DEFAULTS.checkinTs + 86_400n },
      { checkoutTs: CREATE_DEFAULTS.checkoutTs + 1n },
      { quoteExpiresTs: CREATE_DEFAULTS.quoteExpiresTs + 3_600n },
    ]) {
      await expectGuard(sign(await buildTx([await createIx(overrides)])), "TERMS_MISMATCH");
    }
  });

  it("rejects another hotel or mint account", async () => {
    await expectGuard(sign(await buildTx([await createIx({ hotel: await pda("hotel", new Uint8Array(16)) })])), "ACCOUNT_MISMATCH");
    await expectGuard(sign(await buildTx([await createIx({ mint: OTHER })])), "ACCOUNT_MISMATCH");
  });

  it("rejects a cancel whose min_refund differs from the API's refund preview", async () => {
    const tx = await buildTx([await cancelIx({ guest: AGENT, bookingId: BOOKING_ID, minRefund: 1n })]);
    await expectGuard(sign(tx, { action: CANCEL }), "REFUND_MISMATCH");
  });

  it("rejects a program impersonating the escrow under another address", async () => {
    await expectGuard(sign(await buildTx([await createIx({ programAddress: OTHER })])), "ESCROW_INSTRUCTION_COUNT");
  });
});
