# @stumari/escrow-client

Server-side client for the `stumari_escrow` program: a Codama-generated `@solana/kit` 8 client,
PDA helpers, validated account reads, the transaction builders behind "server builds, wallet
signs" (ADR-0009/0010), and the relay used by `POST /api/tx/send`.

Contracts: `docs/architecture/escrow-program.md` (accounts, instructions, errors) and
`docs/architecture/api.md` ("Transaction building contract"). Money is `bigint` base units,
timestamps are unix seconds (`bigint`), percentages are bps. Refund/fee math is **not**
reimplemented here — use `@stumari/core` (`splitCancel`, `minRefundForCancel`, …).

```sh
pnpm --filter @stumari/escrow-client generate    # IDL → src/generated (commit the output; never hand-edit)
pnpm --filter @stumari/escrow-client test        # vitest; starts its own Surfpool container (see Tests)
pnpm --filter @stumari/escrow-client typecheck
```

## Modules

| Module | Exports |
|---|---|
| `generated` | Codama client from `onchain/artifacts/idl/stumari_escrow.json` (instructions, codecs, events, error constants). Exported as the `generated` namespace plus `STUMARI_ESCROW_PROGRAM_ADDRESS`. |
| `pdas` | `findConfigPda()`, `findHotelPda(hotelIdBytes)`, `findBookingPda(bookingIdBytes)`, `findVaultPda(booking)`, `findAta(owner, mint)` (classic SPL Token), `findProgramDataAddress()` — all return an `Address` |
| `accounts` | `fetchConfig` / `fetchHotel` / `fetchBooking` and `fetchMaybe*` (null only when the account is missing). Every read checks owner == program id and the Anchor discriminator (`AccountValidationError` otherwise). `toBookingView` → `BookingView` with `status` as a name, bigint money and `tiers` trimmed to `tier_count` in `@stumari/core` shape |
| `build` | one builder per instruction (below), all returning `BuiltTx` |
| `relay` | `decodeWireTx`, `verifySignatures`, `sendAndConfirm`, `sendBuiltTx` |
| `errors` | `EscrowTxError { stage, failure, errorName }`, `parseTransactionError`, `escrowErrorFromCode` |

## Builders

Every builder takes `{ rpc, operator, lifetime?, simulate? }` and returns

```ts
interface BuiltTx {
  txBase64: Base64EncodedWireTransaction; // v0, partially signed by our keys
  messageBytes: Uint8Array;
  messageHashHex: string;                 // sha256(messageBytes) → built_txs
  lastValidBlockHeight: bigint;
  requiredSigner: Address | null;         // the wallet that still signs; null = fully signed
}
```

- **v0**, fee payer = `operator` (a `TransactionSigner`, normally a `KeyPairSigner`); the
  guest appears as `createNoopSigner(guest)`, so the guest never needs SOL.
- `lifetime`: pass `{ blockhash, lastValidBlockHeight }` to reuse one; otherwise fetched at `confirmed`.
- `simulate` (default `true`): a failing simulation throws `EscrowTxError` with
  `stage: "simulate"` and `errorName` = the program error (`RefundBelowMinimum`, …) → `409 SIMULATION_FAILED`.
- Recipient ATAs get an idempotent `CreateAssociatedTokenAccount` paid by the operator.
- Builders that need the Config (treasury for exits, mint for hotel ATAs) read it; pass
  `config` (from `fetchConfig`) to skip the read.
- When an admin/authority signer has the operator's address (devnet: admin = operator), the
  operator signer is used, so Kit never sees two signers for one address.

```ts
import { createKeyPairSignerFromBytes, createSolanaRpc } from "@solana/kit";
import { deriveBookingId, minRefundForCancel, uuidToBytes } from "@stumari/core";
import * as escrow from "@stumari/escrow-client";

const rpc = createSolanaRpc(process.env.SOLANA_RPC_URL!);
const operator = await createKeyPairSignerFromBytes(operatorSecret); // fee payer + quote signer
const admin = await createKeyPairSignerFromBytes(adminSecret);       // devnet: same key
const ctx = { rpc, operator };
```

### Guest-signed (return `requiredSigner = guest`; the browser signs, then `/api/tx/send`)

```ts
// POST /api/quotes/{id}/pay
const pay = await escrow.buildCreateBookingTx({
  ...ctx,
  guest: payer,                              // wallet address
  hotelId: uuidToBytes(hotel.id),
  mint,                                      // config.mint
  bookingId: deriveBookingId(quote.id),      // ADR-0011
  amount: option.price_minor,                // bigint
  checkinTs, checkoutTs,                     // bigint unix seconds
  quoteHash,                                 // Uint8Array(32), hashQuote(body)
  optionIndex,
  tiers: option.tiers,                       // @stumari/core Tier[]
  quoteExpiresTs: BigInt(body.expires_at),
});
// → { tx: pay.txBase64, signer: pay.requiredSigner, lastValidBlockHeight, booking_pda: pay.booking }

// POST /api/bookings/{id}/tx { action }
const booking = await escrow.fetchBooking(rpc, await escrow.findBookingPda(hexToBytes(id)));
const minRefund = minRefundForCancel({ booking, now: BigInt(Math.floor(Date.now() / 1000)) });
const cancel = await escrow.buildCancelTx({ ...ctx, booking, minRefund });  // refund_minor = minRefund
const dispute = await escrow.buildDisputeTx({ ...ctx, booking });
const guestVoid = await escrow.buildVoidTx({ ...ctx, booking, authority: booking.guest }); // after the deadline
```

### Operator / admin (fully signed; send with `sendBuiltTx`)

```ts
await escrow.sendBuiltTx(rpc, await escrow.buildConfirmTx({ ...ctx, booking }));
await escrow.sendBuiltTx(rpc, await escrow.buildReleaseTx({ ...ctx, booking }));            // cron / lazy crank
await escrow.sendBuiltTx(rpc, await escrow.buildVoidTx({ ...ctx, booking }));               // operator after deadline
await escrow.sendBuiltTx(rpc, await escrow.buildVoidTx({ ...ctx, booking, authority: admin })); // admin, any time
await escrow.sendBuiltTx(rpc, await escrow.buildResolveTx({ ...ctx, booking, admin, guestBps: 5_000 }));

const reg = await escrow.buildRegisterHotelTx({ ...ctx, admin, hotelId: uuidToBytes(hotel.id), authority: payoutWallet });
await escrow.sendBuiltTx(rpc, reg);                                                          // reg.hotel = Hotel PDA
await escrow.sendBuiltTx(rpc, await escrow.buildUpdateHotelTx({ ...ctx, admin, hotelId, authority: newWallet }));
await escrow.sendBuiltTx(rpc, await escrow.buildUpdateHotelTx({ ...ctx, admin, hotelId, active: false }));

// Once per deployment, by the program's upgrade authority:
await escrow.sendBuiltTx(rpc, await escrow.buildInitializeConfigTx({
  ...ctx, admin, mint, treasury, feeBps: 0, confirmWindowSecs: 7_200, releaseDelaySecs: 86_400,
}));                                                                     // quoteSigner defaults to operator
await escrow.sendBuiltTx(rpc, await escrow.buildUpdateConfigTx({ ...ctx, admin, changes: { feeBps: 150 } }));
```

## Relay (`POST /api/tx/send`)

```ts
const decoded = await escrow.decodeWireTx(body.tx);
const row = await findUnexpiredBuiltTx(decoded.messageHashHex);   // built_txs lookup (web app)
if (decoded.feePayer !== operator.address || !row) {
  return error(400, "FOREIGN_TX");
}
const check = await escrow.verifySignatures(decoded);   // { valid, missing, invalid }
if (!check.valid) return error(400, "WALLET_MODIFIED_TX");
try {
  const { signature, slot } = await escrow.sendAndConfirm(rpc, body.tx, {
    lastValidBlockHeight: row.lastValidBlockHeight,        // optional: stop early once expired
    timeoutMs: 30_000,
  });
} catch (e) {
  if (e instanceof escrow.EscrowTxError) {
    // e.stage: "send" (preflight) | "confirm" (landed, failed) | "expired" | "timeout"
    // e.errorName: "RefundBelowMinimum", "ConstraintSeeds", "BlockhashNotFound", …
  }
}
```

`sendAndConfirm` runs a signature-verifying simulation as its preflight (so a failure keeps the
raw error and logs), sends with `skipPreflight`, then polls `getSignatureStatuses` (no
websockets) until `confirmed`. Relaying a transaction that already landed is not an error.
`decodeWireTx` also returns `signers`, per-instruction `programIds` (the MCP agent check "exactly
one `stumari_escrow` instruction") and `lifetimeToken`.

## Errors

`parseTransactionError(err, { logs, programIds })` accepts an RPC `TransactionError` (simulation
or signature status, bigints included) or a thrown error and returns
`{ code, name, message, instructionIndex, logs }`. Anchor's log line wins when present (it also
names framework errors such as `ConstraintSeeds` and keeps messages); otherwise escrow codes
(`6000+`) map through the generated constants, but only when the failing instruction is the
escrow program. Note: Codama's generated `getStumariEscrowErrorMessage` returns a placeholder when
`NODE_ENV=production`; names are always available.

## Tests

`test/lifecycle.test.ts` drives the whole lifecycle through these builders on a fresh chain:
upgrade-authority-gated `initialize_config`, hotel registration (+ payout ATA), gasless creates
(the guest holds 0 SOL and signs like a wallet), a duplicate booking id failing, confirm, void
(too early → `VoidTooEarly`, after the deadline → full refund), dispute + resolve, release after a
clock warp (`NotReleasable` before), cancel around the 7-day tier boundary with
`minRefundForCancel` (and `RefundBelowMinimum` at simulation and at the relay's preflight),
relay decoding/signature checks, and owner/discriminator validation. Every settlement is checked
against `@stumari/core` `splitCancel` / `splitRelease` / `splitResolve` both as token balance
deltas and as the amounts stored on the Booking. `test/offline.test.ts` covers error parsing
(against the IDL's error list), views, PDAs and builders without a chain.

**Chain:** the npm `litesvm` package ships no Windows binary (`Cannot find native binding`), so
the tests run against Surfpool in Docker (ADR-0015). `test/global-setup.ts` starts a dedicated
container `stumari-escrow-client-test` on `127.0.0.1:18899` from `.localnet/bin/surfpool`
(copied there by `bash scripts/localnet.sh start`), deploys `onchain/artifacts/stumari_escrow.so`
with `surfnet_writeProgram` (a fresh upgrade authority), moves the clock with
`surfnet_timeTravel` and removes the container afterwards. The shared localnet on 8899 is not
touched. To use another fresh surfnet instead, set `ESCROW_TEST_RPC_URL`.
