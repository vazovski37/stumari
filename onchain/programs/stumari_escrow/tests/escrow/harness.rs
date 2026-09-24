//! LiteSVM test environment: program deployed through the upgradeable loader with a real
//! upgrade authority, a 6-decimal mint, config + one hotel, and instruction builders.

use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{
            bpf_loader_upgradeable, instruction::Instruction, system_instruction, system_program,
        },
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{
        associated_token::{
            get_associated_token_address,
            spl_associated_token_account::instruction::create_associated_token_account_idempotent,
        },
        token::{spl_token, Mint, TokenAccount},
    },
    litesvm::{
        types::{TransactionMetadata, TransactionResult},
        LiteSVM,
    },
    solana_instruction::error::InstructionError,
    solana_keypair::Keypair,
    solana_message::{v0, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    solana_transaction_error::TransactionError,
    stumari_escrow::{
        accounts, instruction, Booking, Config, CreateBookingArgs, Hotel, Tier, UpdateConfigArgs,
        BOOKING_SEED, CONFIG_SEED, HOTEL_SEED, VAULT_SEED,
    },
};

pub const DECIMALS: u8 = 6;
pub const USDC: u64 = 1_000_000;
pub const SOL: u64 = 1_000_000_000;
/// Arbitrary "now" at environment start (2030-03-17).
pub const T0: i64 = 1_900_000_000;
pub const DAY: i64 = 86_400;
pub const FEE_BPS: u16 = 150;
pub const CONFIRM_WINDOW: u32 = 7_200;
pub const RELEASE_DELAY: u32 = 86_400;

pub fn standard_tiers() -> Vec<Tier> {
    vec![tier(604_800, 10_000), tier(259_200, 5_000), tier(0, 0)]
}

pub fn tier(secs_before: u32, refund_bps: u16) -> Tier {
    Tier {
        secs_before,
        refund_bps,
    }
}

pub struct Env {
    pub svm: LiteSVM,
    /// Program upgrade authority and `config.admin`.
    pub admin: Keypair,
    /// Quote signer = fee payer = rent payer for guest-facing transactions (gasless design).
    pub operator: Keypair,
    pub mint_authority: Keypair,
    pub mint: Pubkey,
    pub treasury: Pubkey,
    pub config: Pubkey,
    pub hotel_owner: Keypair,
    pub hotel_id: [u8; 16],
    pub hotel: Pubkey,
    next_id: u8,
}

/// Every account a terminal instruction takes, derived from the booking; tests overwrite
/// single fields to simulate substitution attacks.
#[derive(Clone, Copy, Debug)]
pub struct ExitKeys {
    pub booking: Pubkey,
    pub config: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub guest_token_account: Pubkey,
    pub hotel_token_account: Pubkey,
    pub treasury: Pubkey,
    pub rent_payer: Pubkey,
}

pub fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[CONFIG_SEED], &stumari_escrow::ID).0
}

pub fn hotel_pda(hotel_id: &[u8; 16]) -> Pubkey {
    Pubkey::find_program_address(&[HOTEL_SEED, hotel_id], &stumari_escrow::ID).0
}

pub fn booking_pda(booking_id: &[u8; 16]) -> Pubkey {
    Pubkey::find_program_address(&[BOOKING_SEED, booking_id], &stumari_escrow::ID).0
}

pub fn vault_pda(booking: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[VAULT_SEED, booking.as_ref()], &stumari_escrow::ID).0
}

pub fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address(owner, mint)
}

impl Env {
    /// Deployed program with an upgrade authority, a mint and a treasury; no config yet.
    pub fn deployed() -> Self {
        let mut svm = LiteSVM::new();
        let admin = Keypair::new();
        deploy_with_upgrade_authority(&mut svm, &admin.pubkey());
        let operator = Keypair::new();
        svm.airdrop(&admin.pubkey(), 100 * SOL).unwrap();
        svm.airdrop(&operator.pubkey(), 100 * SOL).unwrap();

        let mut env = Env {
            svm,
            admin,
            operator,
            mint_authority: Keypair::new(),
            mint: Pubkey::default(),
            treasury: Pubkey::default(),
            config: config_pda(),
            hotel_owner: Keypair::new(),
            hotel_id: [0xAA; 16],
            hotel: Pubkey::default(),
            next_id: 0,
        };
        env.set_time(T0);
        env.mint = env.create_mint(&env.mint_authority.pubkey());
        let treasury_owner = Keypair::new().pubkey();
        env.treasury = env.create_ata(&treasury_owner);
        env
    }

    /// Initialized config (fee 1.5%, 2 h confirm window, 24 h release delay) and one hotel.
    pub fn new() -> Self {
        let mut env = Self::deployed();
        let ix = env.initialize_config_ix(
            &env.admin.pubkey(),
            env.operator.pubkey(),
            FEE_BPS,
            CONFIRM_WINDOW,
            RELEASE_DELAY,
            env.treasury,
        );
        let admin = env.admin.insecure_clone();
        env.send(&[ix], &admin, &[]).unwrap();

        let hotel_owner = env.hotel_owner.pubkey();
        env.hotel = env.register_hotel(env.hotel_id, hotel_owner);
        env.create_ata(&hotel_owner);
        env
    }

    // ---- transactions -------------------------------------------------------------------

    /// Sends a v0 transaction. The blockhash is expired first so an identical resend is a new
    /// transaction rather than `AlreadyProcessed`.
    pub fn send(
        &mut self,
        ixs: &[Instruction],
        payer: &Keypair,
        signers: &[&Keypair],
    ) -> TransactionResult {
        self.svm.expire_blockhash();
        let msg = v0::Message::try_compile(&payer.pubkey(), ixs, &[], self.svm.latest_blockhash())
            .expect("compile message");
        let mut all: Vec<&Keypair> = vec![payer];
        all.extend(signers.iter().filter(|s| s.pubkey() != payer.pubkey()));
        let tx = VersionedTransaction::try_new(VersionedMessage::V0(msg), &all).expect("sign");
        self.svm.send_transaction(tx)
    }

    /// Gasless send: the operator pays the fee and signs as quote signer where required.
    pub fn send_op(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> TransactionResult {
        let op = self.operator.insecure_clone();
        self.send(ixs, &op, signers)
    }

    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    pub fn set_time(&mut self, unix_timestamp: i64) {
        let mut clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp = unix_timestamp;
        self.svm.set_sysvar(&clock);
    }

    // ---- reads --------------------------------------------------------------------------

    pub fn fetch<T: AccountDeserialize>(&self, address: &Pubkey) -> T {
        let account = self
            .svm
            .get_account(address)
            .unwrap_or_else(|| panic!("account {address} missing"));
        T::try_deserialize(&mut account.data.as_slice()).expect("deserialize account")
    }

    pub fn booking(&self, booking: &Pubkey) -> Booking {
        self.fetch(booking)
    }

    pub fn config_state(&self) -> Config {
        self.fetch(&self.config)
    }

    pub fn hotel_state(&self, hotel: &Pubkey) -> Hotel {
        self.fetch(hotel)
    }

    pub fn balance(&self, token_account: &Pubkey) -> u64 {
        self.fetch::<TokenAccount>(token_account).amount
    }

    pub fn lamports(&self, address: &Pubkey) -> u64 {
        self.svm.get_balance(address).unwrap_or(0)
    }

    /// Closed accounts are removed from LiteSVM (zero lamports).
    pub fn is_closed(&self, address: &Pubkey) -> bool {
        self.svm
            .get_account(address)
            .is_none_or(|a| a.lamports == 0)
    }

    // ---- tokens -------------------------------------------------------------------------

    pub fn create_mint(&mut self, authority: &Pubkey) -> Pubkey {
        let mint = Keypair::new();
        let rent = self.svm.minimum_balance_for_rent_exemption(Mint::LEN);
        let ixs = [
            system_instruction::create_account(
                &self.operator.pubkey(),
                &mint.pubkey(),
                rent,
                Mint::LEN as u64,
                &spl_token::ID,
            ),
            spl_token::instruction::initialize_mint2(
                &spl_token::ID,
                &mint.pubkey(),
                authority,
                None,
                DECIMALS,
            )
            .unwrap(),
        ];
        self.send_op(&ixs, &[&mint]).unwrap();
        mint.pubkey()
    }

    /// Idempotent ATA creation paid by the operator, as the server does before each exit.
    pub fn create_ata(&mut self, owner: &Pubkey) -> Pubkey {
        self.create_ata_for_mint(owner, &self.mint.clone())
    }

    pub fn create_ata_for_mint(&mut self, owner: &Pubkey, mint: &Pubkey) -> Pubkey {
        let ix = create_associated_token_account_idempotent(
            &self.operator.pubkey(),
            owner,
            mint,
            &spl_token::ID,
        );
        self.send_op(&[ix], &[]).unwrap();
        ata(owner, mint)
    }

    /// A token account of `owner` at a fresh address (not the owner's ATA).
    pub fn create_token_account(&mut self, owner: &Pubkey) -> Pubkey {
        let account = Keypair::new();
        let rent = self
            .svm
            .minimum_balance_for_rent_exemption(TokenAccount::LEN);
        let ixs = [
            system_instruction::create_account(
                &self.operator.pubkey(),
                &account.pubkey(),
                rent,
                TokenAccount::LEN as u64,
                &spl_token::ID,
            ),
            spl_token::instruction::initialize_account3(
                &spl_token::ID,
                &account.pubkey(),
                &self.mint,
                owner,
            )
            .unwrap(),
        ];
        self.send_op(&ixs, &[&account]).unwrap();
        account.pubkey()
    }

    pub fn mint_to(&mut self, token_account: &Pubkey, amount: u64) {
        let ix = spl_token::instruction::mint_to(
            &spl_token::ID,
            &self.mint,
            token_account,
            &self.mint_authority.pubkey(),
            &[],
            amount,
        )
        .unwrap();
        let authority = self.mint_authority.insecure_clone();
        self.send_op(&[ix], &[&authority]).unwrap();
    }

    /// Plain SPL transfer, e.g. an unsolicited donation into a booking vault.
    pub fn transfer(&mut self, owner: &Keypair, from: &Pubkey, to: &Pubkey, amount: u64) {
        let ix = spl_token::instruction::transfer_checked(
            &spl_token::ID,
            from,
            &self.mint,
            to,
            &owner.pubkey(),
            &[],
            amount,
            DECIMALS,
        )
        .unwrap();
        self.send_op(&[ix], &[owner]).unwrap();
    }

    /// A guest wallet with no SOL, holding `usdc` in its ATA.
    pub fn new_guest(&mut self, usdc: u64) -> Keypair {
        let guest = Keypair::new();
        let guest_ata = self.create_ata(&guest.pubkey());
        self.mint_to(&guest_ata, usdc);
        guest
    }

    // ---- setup flows --------------------------------------------------------------------

    pub fn register_hotel(&mut self, hotel_id: [u8; 16], authority: Pubkey) -> Pubkey {
        let ix = self.register_hotel_ix(&self.admin.pubkey(), hotel_id, authority);
        let admin = self.admin.insecure_clone();
        self.send(&[ix], &admin, &[]).unwrap();
        hotel_pda(&hotel_id)
    }

    /// Default args: 100 USDC, check-in in 10 days, 2 nights, standard tiers, quote valid 10 min.
    pub fn booking_args(&mut self) -> CreateBookingArgs {
        self.next_id += 1;
        let now = self.now();
        let checkin_ts = now + 10 * DAY;
        CreateBookingArgs {
            booking_id: [self.next_id; 16],
            amount: 100 * USDC,
            checkin_ts,
            checkout_ts: checkin_ts + 2 * DAY,
            quote_hash: [7; 32],
            option_index: 1,
            tiers: standard_tiers(),
            quote_expires_ts: now + 600,
        }
    }

    /// Gasless create for the default hotel: operator = fee payer + quote signer + rent payer.
    pub fn create_booking(
        &mut self,
        guest: &Keypair,
        args: CreateBookingArgs,
    ) -> TransactionResult {
        let hotel = self.hotel;
        self.create_booking_at(guest, hotel, args)
    }

    pub fn create_booking_at(
        &mut self,
        guest: &Keypair,
        hotel: Pubkey,
        args: CreateBookingArgs,
    ) -> TransactionResult {
        let ix = self.create_booking_ix(&self.operator.pubkey(), &guest.pubkey(), hotel, args);
        self.send_op(&[ix], &[guest])
    }

    /// Creates a booking with default args and returns its PDA.
    pub fn book(&mut self, guest: &Keypair) -> Pubkey {
        let args = self.booking_args();
        let booking = booking_pda(&args.booking_id);
        self.create_booking(guest, args).unwrap();
        booking
    }

    /// Creates and confirms (by the quote signer) a default booking.
    pub fn book_confirmed(&mut self, guest: &Keypair) -> Pubkey {
        let booking = self.book(guest);
        let ix = self.confirm_ix(&self.operator.pubkey(), booking, self.hotel);
        self.send_op(&[ix], &[]).unwrap();
        booking
    }

    pub fn exit_keys(&self, booking: Pubkey) -> ExitKeys {
        let b = self.booking(&booking);
        ExitKeys {
            booking,
            config: self.config,
            mint: b.mint,
            vault: vault_pda(&booking),
            guest_token_account: ata(&b.guest, &b.mint),
            hotel_token_account: ata(&b.hotel_authority, &b.mint),
            treasury: self.config_state().treasury,
            rent_payer: b.rent_payer,
        }
    }

    // ---- instruction builders -----------------------------------------------------------

    pub fn initialize_config_ix(
        &self,
        admin: &Pubkey,
        quote_signer: Pubkey,
        fee_bps: u16,
        confirm_window_secs: u32,
        release_delay_secs: u32,
        treasury: Pubkey,
    ) -> Instruction {
        ix(
            instruction::InitializeConfig {
                quote_signer,
                fee_bps,
                confirm_window_secs,
                release_delay_secs,
            },
            accounts::InitializeConfig {
                admin: *admin,
                config: self.config,
                mint: self.mint,
                treasury,
                program: stumari_escrow::ID,
                program_data: programdata_address(),
                system_program: system_program::ID,
            },
        )
    }

    pub fn update_config_ix(
        &self,
        admin: &Pubkey,
        args: UpdateConfigArgs,
        treasury: Option<Pubkey>,
    ) -> Instruction {
        ix(
            instruction::UpdateConfig { args },
            accounts::UpdateConfig {
                admin: *admin,
                config: self.config,
                treasury,
            },
        )
    }

    pub fn register_hotel_ix(
        &self,
        admin: &Pubkey,
        hotel_id: [u8; 16],
        authority: Pubkey,
    ) -> Instruction {
        ix(
            instruction::RegisterHotel {
                hotel_id,
                authority,
            },
            accounts::RegisterHotel {
                admin: *admin,
                config: self.config,
                hotel: hotel_pda(&hotel_id),
                system_program: system_program::ID,
            },
        )
    }

    pub fn update_hotel_ix(
        &self,
        hotel: Pubkey,
        authority: Option<Pubkey>,
        active: Option<bool>,
    ) -> Instruction {
        ix(
            instruction::UpdateHotel { authority, active },
            accounts::UpdateHotel {
                admin: self.admin.pubkey(),
                config: self.config,
                hotel,
            },
        )
    }

    pub fn create_booking_ix(
        &self,
        quote_signer: &Pubkey,
        guest: &Pubkey,
        hotel: Pubkey,
        args: CreateBookingArgs,
    ) -> Instruction {
        let booking = booking_pda(&args.booking_id);
        ix(
            instruction::CreateBooking { args },
            accounts::CreateBooking {
                quote_signer: *quote_signer,
                guest: *guest,
                config: self.config,
                hotel,
                mint: self.mint,
                guest_token_account: ata(guest, &self.mint),
                booking,
                vault: vault_pda(&booking),
                token_program: spl_token::ID,
                system_program: system_program::ID,
            },
        )
    }

    pub fn confirm_ix(&self, authority: &Pubkey, booking: Pubkey, hotel: Pubkey) -> Instruction {
        ix(
            instruction::ConfirmBooking {},
            accounts::ConfirmBooking {
                authority: *authority,
                config: self.config,
                hotel,
                booking,
            },
        )
    }

    pub fn cancel_ix(&self, guest: &Pubkey, k: &ExitKeys, min_refund: u64) -> Instruction {
        ix(
            instruction::CancelBooking { min_refund },
            accounts::CancelBooking {
                guest: *guest,
                booking: k.booking,
                config: k.config,
                mint: k.mint,
                vault: k.vault,
                guest_token_account: k.guest_token_account,
                hotel_token_account: k.hotel_token_account,
                treasury: k.treasury,
                rent_payer: k.rent_payer,
                token_program: spl_token::ID,
            },
        )
    }

    pub fn release_ix(&self, k: &ExitKeys) -> Instruction {
        ix(
            instruction::Release {},
            accounts::Release {
                booking: k.booking,
                config: k.config,
                mint: k.mint,
                vault: k.vault,
                hotel_token_account: k.hotel_token_account,
                treasury: k.treasury,
                rent_payer: k.rent_payer,
                token_program: spl_token::ID,
            },
        )
    }

    pub fn flag_dispute_ix(&self, guest: &Pubkey, booking: Pubkey) -> Instruction {
        ix(
            instruction::FlagDispute {},
            accounts::FlagDispute {
                guest: *guest,
                booking,
            },
        )
    }

    pub fn resolve_ix(&self, admin: &Pubkey, k: &ExitKeys, guest_bps: u16) -> Instruction {
        ix(
            instruction::ResolveDispute { guest_bps },
            accounts::ResolveDispute {
                admin: *admin,
                booking: k.booking,
                config: k.config,
                mint: k.mint,
                vault: k.vault,
                guest_token_account: k.guest_token_account,
                hotel_token_account: k.hotel_token_account,
                treasury: k.treasury,
                rent_payer: k.rent_payer,
                token_program: spl_token::ID,
            },
        )
    }

    pub fn void_ix(&self, authority: &Pubkey, k: &ExitKeys) -> Instruction {
        ix(
            instruction::VoidBooking {},
            accounts::VoidBooking {
                authority: *authority,
                booking: k.booking,
                config: k.config,
                mint: k.mint,
                vault: k.vault,
                guest_token_account: k.guest_token_account,
                treasury: k.treasury,
                rent_payer: k.rent_payer,
                token_program: spl_token::ID,
            },
        )
    }
}

fn ix(data: impl InstructionData, accounts: impl ToAccountMetas) -> Instruction {
    Instruction::new_with_bytes(
        stumari_escrow::ID,
        &data.data(),
        accounts.to_account_metas(None),
    )
}

fn programdata_address() -> Pubkey {
    Pubkey::find_program_address(&[stumari_escrow::ID.as_ref()], &bpf_loader_upgradeable::ID).0
}

/// `LiteSVM::add_program` deploys through the upgradeable loader with no upgrade authority;
/// write the authority into the ProgramData header so `initialize_config` can be gated on it.
/// Header layout (bincode `UpgradeableLoaderState::ProgramData`): u32 variant = 3, u64 slot,
/// Option<Pubkey> = 1-byte tag + 32 bytes.
fn deploy_with_upgrade_authority(svm: &mut LiteSVM, authority: &Pubkey) {
    let so = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/stumari_escrow.so"
    ));
    svm.add_program(stumari_escrow::ID, so).unwrap();
    let address = programdata_address();
    let mut account = svm.get_account(&address).expect("programdata");
    assert_eq!(account.data[..4], 3u32.to_le_bytes(), "ProgramData variant");
    account.data[12] = 1;
    account.data[13..45].copy_from_slice(authority.as_ref());
    svm.set_account(address, account).unwrap();
}

// ---- assertions -----------------------------------------------------------------------------

/// The custom program error code of a failed transaction, if that is how it failed.
pub fn custom_error(res: &TransactionResult) -> Option<u32> {
    match res {
        Err(failed) => match failed.err {
            TransactionError::InstructionError(_, InstructionError::Custom(code)) => Some(code),
            _ => None,
        },
        Ok(_) => None,
    }
}

pub fn assert_err(res: TransactionResult, expected: impl Into<u32> + std::fmt::Debug + Copy) {
    let code: u32 = expected.into();
    if custom_error(&res) != Some(code) {
        match res {
            Ok(meta) => panic!(
                "expected {expected:?} ({code}), tx succeeded
{}",
                meta.pretty_logs()
            ),
            Err(failed) => panic!(
                "expected {expected:?} ({code}), got {:?}
{}",
                failed.err,
                failed.meta.pretty_logs()
            ),
        }
    }
}

pub fn assert_fails(res: TransactionResult) {
    if let Ok(meta) = res {
        panic!("expected failure, tx succeeded\n{}", meta.pretty_logs());
    }
}

pub fn ok(res: TransactionResult) -> TransactionMetadata {
    res.unwrap_or_else(|failed| {
        panic!("tx failed: {:?}\n{}", failed.err, failed.meta.pretty_logs())
    })
}
