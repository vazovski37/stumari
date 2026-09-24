# onchain — `stumari_escrow`

Anchor 1.1.2 program that holds each booking's USDC in its own vault and enforces the refund schedule the guest bought. The contract is [docs/architecture/escrow-program.md](../docs/architecture/escrow-program.md); security model in [docs/architecture/security.md](../docs/architecture/security.md).

Program id: `6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf` (`artifacts/program-id.txt`, `declare_id!`, `Anchor.toml` localnet + devnet).

## Layout

```
onchain/
├── Anchor.toml, Cargo.toml, rust-toolchain.toml (1.89.0), Cargo.lock (committed)
├── artifacts/                  # committed build outputs, copied back by scripts/program.sh
│   ├── program-id.txt
│   ├── stumari_escrow.so
│   └── idl/stumari_escrow.json # input for the Codama client (packages/escrow-client)
├── keys/                       # gitignored secret keypairs; never print or commit
└── programs/stumari_escrow/
    ├── src/
    │   ├── lib.rs              # #[program]: one thin wrapper per instruction
    │   ├── constants.rs        # seeds, BPS_DENOM, MAX_FEE_BPS, MIN_WINDOW_SECS, MAX_TIERS
    │   ├── state.rs            # Config, Hotel, Booking, Tier, BookingStatus
    │   ├── events.rs           # emit! events
    │   ├── error.rs            # EscrowError
    │   ├── logic.rs            # pure tier validation + refund/fee math (+ vector tests)
    │   ├── vault.rs            # PDA-signed payouts, excess sweep, vault close
    │   └── instructions/*.rs   # one file per instruction (accounts + handler)
    └── tests/escrow/           # LiteSVM integration tests (one binary)
        ├── harness.rs          # Env: deploy with upgrade authority, mint, ATAs, ix builders
        ├── config.rs  lifecycle.rs  cancel.rs  dispute_void.rs  attacks.rs
```

## Build, test, deploy

Always through `scripts/program.sh` (ADR-0008). It copies `onchain/` and `spec/vectors/` to `~/stumari-onchain` inside WSL, builds there, and copies `stumari_escrow.so`, the IDL and `Cargo.lock` back. From Git Bash:

```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/Users/User/Workspace/colosseum/scripts/program.sh build
MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/Users/User/Workspace/colosseum/scripts/program.sh test    # anchor build + cargo test
MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/Users/User/Workspace/colosseum/scripts/program.sh fmt     # cargo fmt in place
MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/Users/User/Workspace/colosseum/scripts/program.sh id      # program id from the keypair
DEPLOYER_KEYPAIR=/path/in/wsl.json MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash .../scripts/program.sh deploy devnet
```

`build` copies `onchain/keys/stumari_escrow-keypair.json` into `target/deploy/` first so the program id never changes. Deploy targets devnet by default; never mainnet without an explicit decision (security.md checklist). After the first deploy, the upgrade authority runs `initialize_config` once.

Tests:

- **Logic** (`src/logic.rs`): every case in `spec/vectors/refund.json`, read at run time from `$CARGO_MANIFEST_DIR/../../spec/vectors/refund.json` (exists only in the WSL work dir, where `program.sh` copies it). `packages/core` must pass the same file.
- **Integration** (`tests/escrow/`, LiteSVM 0.10): the program is loaded through the upgradeable loader and its ProgramData header is given a real upgrade authority, so `initialize_config` gating is exercised. Time moves with `set_sysvar(Clock)`; every send expires the blockhash first. Covers the full positive and negative plan in the spec: gasless create (the guest has no SOL), confirm windows, every tier boundary ±1 s, pending cancel, `min_refund`, void (anyone after the deadline, admin before), dispute window edges, resolve with an odd split, fee and payout-authority snapshots, vault donations swept on every exit, aliased guest = hotel = treasury accounts, rent returned to `rent_payer`, and account substitution on all four exits.

## Instructions

| Instruction | Signer(s) | Accounts (in order) | Args |
|---|---|---|---|
| `initialize_config` | admin (upgrade authority) | admin, config, mint, treasury, program, program_data, system_program | quote_signer, fee_bps, confirm_window_secs, release_delay_secs |
| `update_config` | admin | admin, config, treasury (optional) | `UpdateConfigArgs { admin?, quote_signer?, fee_bps?, confirm_window_secs?, release_delay_secs?, paused? }` |
| `register_hotel` | admin | admin, config, hotel, system_program | hotel_id: [u8;16], authority |
| `update_hotel` | admin | admin, config, hotel | authority?, active? |
| `create_booking` | quote_signer (fee + rent payer), guest | quote_signer, guest, config, hotel, mint, guest_token_account, booking, vault, token_program, system_program | `CreateBookingArgs { booking_id, amount, checkin_ts, checkout_ts, quote_hash, option_index, tiers, quote_expires_ts }` |
| `confirm_booking` | quote_signer or hotel authority | authority, config, hotel, booking | — |
| `cancel_booking` | guest | guest, booking, config, mint, vault, guest_token_account, hotel_token_account, treasury, rent_payer, token_program | min_refund: u64 |
| `release` | none (permissionless crank) | booking, config, mint, vault, hotel_token_account, treasury, rent_payer, token_program | — |
| `flag_dispute` | guest | guest, booking | — |
| `resolve_dispute` | admin | admin, booking, config, mint, vault, guest_token_account, hotel_token_account, treasury, rent_payer, token_program | guest_bps: u16 |
| `void_booking` | anyone after the confirm deadline, admin any time | authority, booking, config, mint, vault, guest_token_account, treasury, rent_payer, token_program | — |

`guest_token_account` / `hotel_token_account` must be the ATA (classic SPL Token) of `booking.guest` / `booking.hotel_authority`. They and `treasury` are `dup`, so one wallet may be guest, hotel and treasury owner at once. The server prepends an idempotent ATA create for every recipient.

Status machine: `Pending(0) → Confirmed(1) | Cancelled(2) | Voided(6)`; `Confirmed → Cancelled | Disputed(4) | Released(3)`; `Disputed → Resolved(5)`. Cancel needs `now < checkin_ts`, dispute `checkin_ts ≤ now < release_after_ts`, release `now ≥ release_after_ts`, confirm `now < confirm_deadline_ts`, and a void without the admin `now ≥ confirm_deadline_ts`.

## Accounts

| Account | Seeds | Size (incl. discriminator) | Holds |
|---|---|---|---|
| `Config` | `["config"]` | 148 B | admin, quote_signer, mint (immutable), treasury, fee_bps (≤ 1000), confirm_window_secs, release_delay_secs (≥ 60 each), paused, bump |
| `Hotel` | `["hotel", hotel_id]` | 58 B | hotel_id, authority, active, bump |
| `Booking` | `["booking", booking_id]` | 351 B | parties (hotel, snapshotted hotel_authority, guest, rent_payer, mint), amount, snapshotted fee_bps, times, deadlines, quote_hash, option_index, tiers[8] + tier_count, status, final refund/hotel/fee amounts, closed_ts, bumps. Never closed. |
| vault | `["vault", booking]` | 165 B (SPL token account) | the escrowed tokens; authority = Booking PDA; closed on every exit with rent to `rent_payer` |

`booking_id = sha256("stumari-booking-v1" ‖ quote.id)[0..16]`, so one quote can create one booking (ADR-0011).

Money math (u128, floor, checked): `refund = amount·refund_bps/10000`, `fee = (amount − refund)·fee_bps/10000`, `hotel_net = amount − refund − fee`. Every exit pays exactly `booking.amount`, then sweeps anything else in the vault to the treasury (reported as `excess` in the event) before closing it.

## Events

`BookingCreated`, `BookingConfirmed`, `BookingCancelled`, `BookingReleased`, `BookingDisputed`, `DisputeResolved`, `BookingVoided` (fields as in the spec).

## Errors (`EscrowError`, code = 6000 + index)

| Code | Name | Code | Name |
|---|---|---|---|
| 6000 | Paused | 6010 | DisputeWindowClosed |
| 6001 | HotelInactive | 6011 | ConfirmWindowClosed |
| 6002 | QuoteExpired | 6012 | VoidTooEarly |
| 6003 | InvalidTimes | 6013 | Unauthorized |
| 6004 | InvalidAmount | 6014 | InvalidBps |
| 6005 | InvalidTiers | 6015 | FeeTooHigh |
| 6006 | InvalidStatus | 6016 | InvalidMint |
| 6007 | TooLateToCancel | 6017 | InvalidTreasury |
| 6008 | RefundBelowMinimum | 6018 | MathOverflow |
| 6009 | NotReleasable | | |

Account substitutions surface either as these (`InvalidMint`, `InvalidTreasury`, `Unauthorized` for a wrong signer, `rent_payer` or confirm hotel) or as Anchor framework errors: `ConstraintSeeds` (another booking's vault), `ConstraintTokenOwner` / `ConstraintAssociated` (wrong owner / non-ATA recipient), `AccountDiscriminatorMismatch` (wrong account type), `AccountNotSigner`.
