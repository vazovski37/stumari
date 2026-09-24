use {
    crate::harness::*,
    anchor_lang::error::ErrorCode as AnchorError,
    anchor_spl::token::TokenAccount,
    solana_keypair::Keypair,
    solana_signer::Signer,
    stumari_escrow::{
        error::EscrowError, events::BookingReleased, BookingStatus, UpdateConfigArgs,
    },
};

#[test]
fn gasless_create_confirm_release() {
    let mut env = Env::new();
    let guest = env.new_guest(250 * USDC);
    let guest_ata = ata(&guest.pubkey(), &env.mint);
    let hotel_ata = ata(&env.hotel_owner.pubkey(), &env.mint);
    let args = env.booking_args();
    let (id, amount, checkin, checkout) = (
        args.booking_id,
        args.amount,
        args.checkin_ts,
        args.checkout_ts,
    );
    let booking = booking_pda(&id);
    let vault = vault_pda(&booking);
    let now = env.now();

    ok(env.create_booking(&guest, args));
    // the guest never held SOL: operator paid the fee and both rents
    assert_eq!(env.lamports(&guest.pubkey()), 0);
    assert_eq!(env.balance(&guest_ata), 150 * USDC);
    assert_eq!(env.balance(&vault), amount);
    let vault_state: TokenAccount = env.fetch(&vault);
    assert_eq!(vault_state.owner, booking);
    assert_eq!(vault_state.mint, env.mint);

    let b = env.booking(&booking);
    assert_eq!(b.booking_id, id);
    assert_eq!(b.hotel, env.hotel);
    assert_eq!(b.hotel_authority, env.hotel_owner.pubkey());
    assert_eq!(b.guest, guest.pubkey());
    assert_eq!(b.rent_payer, env.operator.pubkey());
    assert_eq!(b.mint, env.mint);
    assert_eq!(b.amount, amount);
    assert_eq!(b.fee_bps, FEE_BPS);
    assert_eq!(
        (b.checkin_ts, b.checkout_ts, b.created_ts),
        (checkin, checkout, now)
    );
    assert_eq!(b.confirm_deadline_ts, now + i64::from(CONFIRM_WINDOW));
    assert_eq!(b.release_after_ts, checkin + i64::from(RELEASE_DELAY));
    assert_eq!(b.quote_hash, [7; 32]);
    assert_eq!(b.option_index, 1);
    assert_eq!(b.tier_count, 3);
    assert_eq!(b.active_tiers(), standard_tiers().as_slice());
    assert_eq!(b.tiers[3..], [tier(0, 0); 5]);
    assert!(b.has_status(BookingStatus::Pending));
    assert_eq!(
        (b.refund_amount, b.hotel_amount, b.fee_amount, b.closed_ts),
        (0, 0, 0, 0)
    );

    let ix = env.confirm_ix(&env.operator.pubkey(), booking, env.hotel);
    ok(env.send_op(&[ix], &[]));
    assert!(env.booking(&booking).has_status(BookingStatus::Confirmed));

    let keys = env.exit_keys(booking);
    let cranker = Keypair::new();
    env.svm.airdrop(&cranker.pubkey(), SOL).unwrap();
    env.set_time(b.release_after_ts - 1);
    let ix = env.release_ix(&keys);
    assert_err(env.send(&[ix], &cranker, &[]), EscrowError::NotReleasable);

    env.set_time(b.release_after_ts);
    let vault_rent = env.lamports(&vault);
    let operator_before = env.lamports(&env.operator.pubkey());
    let treasury_before = env.balance(&env.treasury);
    let ix = env.release_ix(&keys);
    let released: BookingReleased = event(&ok(env.send(&[ix], &cranker, &[])));

    let fee = 1_500_000;
    assert_eq!(
        (released.booking, released.hotel_authority),
        (booking, env.hotel_owner.pubkey())
    );
    assert_eq!(
        (released.hotel_amount, released.fee, released.excess),
        (amount - fee, fee, 0)
    );
    assert_eq!(env.balance(&hotel_ata), amount - fee);
    assert_eq!(env.balance(&env.treasury), treasury_before + fee);
    assert_eq!(env.balance(&guest_ata), 150 * USDC);
    assert!(env.is_closed(&vault));
    // vault rent goes back to the rent payer, not the cranker
    assert_eq!(
        env.lamports(&env.operator.pubkey()),
        operator_before + vault_rent
    );

    // the booking account persists as the public outcome
    let b = env.booking(&booking);
    assert!(b.has_status(BookingStatus::Released));
    assert_eq!(
        (b.refund_amount, b.hotel_amount, b.fee_amount),
        (0, amount - fee, fee)
    );
    assert_eq!(b.closed_ts, b.release_after_ts);

    let ix = env.release_ix(&keys);
    assert_fails(env.send(&[ix], &cranker, &[]));
}

#[test]
fn hotel_authority_can_confirm() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book(&guest);
    let owner = env.hotel_owner.insecure_clone();
    let ix = env.confirm_ix(&owner.pubkey(), booking, env.hotel);
    ok(env.send_op(&[ix], &[&owner]));
    assert!(env.booking(&booking).has_status(BookingStatus::Confirmed));

    let ix = env.confirm_ix(&owner.pubkey(), booking, env.hotel);
    assert_err(env.send_op(&[ix], &[&owner]), EscrowError::InvalidStatus);
}

#[test]
fn confirm_rejects_random_signer_and_closed_window() {
    let mut env = Env::new();
    let guest = env.new_guest(200 * USDC);
    let booking = env.book(&guest);
    let deadline = env.booking(&booking).confirm_deadline_ts;

    let stranger = Keypair::new();
    let ix = env.confirm_ix(&stranger.pubkey(), booking, env.hotel);
    assert_err(env.send_op(&[ix], &[&stranger]), EscrowError::Unauthorized);

    // a hotel account other than the booking's
    let other_hotel = env.register_hotel([0xCC; 16], stranger.pubkey());
    let ix = env.confirm_ix(&stranger.pubkey(), booking, other_hotel);
    assert_err(env.send_op(&[ix], &[&stranger]), EscrowError::Unauthorized);

    env.set_time(deadline);
    let ix = env.confirm_ix(&env.operator.pubkey(), booking, env.hotel);
    assert_err(env.send_op(&[ix], &[]), EscrowError::ConfirmWindowClosed);

    env.set_time(deadline - 1);
    let ix = env.confirm_ix(&env.operator.pubkey(), booking, env.hotel);
    ok(env.send_op(&[ix], &[]));
}

#[test]
fn create_requires_the_configured_quote_signer() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let payer = Keypair::new();
    env.svm.airdrop(&payer.pubkey(), 10 * SOL).unwrap();

    // quote signer listed but not signing
    let args = env.booking_args();
    let mut ix = env.create_booking_ix(&env.operator.pubkey(), &guest.pubkey(), env.hotel, args);
    ix.accounts[0].is_signer = false;
    assert_err(
        env.send(&[ix], &payer, &[&guest]),
        AnchorError::AccountNotSigner,
    );

    // a different key signing as quote signer
    let args = env.booking_args();
    let booking = booking_pda(&args.booking_id);
    let ix = env.create_booking_ix(&payer.pubkey(), &guest.pubkey(), env.hotel, args);
    assert_err(
        env.send(&[ix], &payer, &[&guest]),
        EscrowError::Unauthorized,
    );
    assert!(env.is_closed(&booking));
    assert_eq!(env.balance(&ata(&guest.pubkey(), &env.mint)), 100 * USDC);
}

#[test]
fn create_requires_guest_signature() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let args = env.booking_args();
    let mut ix = env.create_booking_ix(&env.operator.pubkey(), &guest.pubkey(), env.hotel, args);
    ix.accounts[1].is_signer = false;
    assert_err(env.send_op(&[ix], &[]), AnchorError::AccountNotSigner);
}

#[test]
fn create_when_paused_fails_but_cancel_still_works() {
    let mut env = Env::new();
    let guest = env.new_guest(200 * USDC);
    let booking = env.book_confirmed(&guest);

    let admin = env.admin.insecure_clone();
    let pause = UpdateConfigArgs {
        paused: Some(true),
        ..Default::default()
    };
    let ix = env.update_config_ix(&admin.pubkey(), pause, None);
    ok(env.send(&[ix], &admin, &[]));

    let args = env.booking_args();
    assert_err(env.create_booking(&guest, args), EscrowError::Paused);

    let keys = env.exit_keys(booking);
    let ix = env.cancel_ix(&guest.pubkey(), &keys, 100 * USDC);
    ok(env.send_op(&[ix], &[&guest]));
    assert_eq!(env.balance(&ata(&guest.pubkey(), &env.mint)), 200 * USDC);
}

#[test]
fn create_validates_hotel_quote_times_amount_and_tiers() {
    let mut env = Env::new();
    let guest = env.new_guest(1_000 * USDC);

    let admin = env.admin.insecure_clone();
    let inactive = env.register_hotel([0xDD; 16], Keypair::new().pubkey());
    let ix = env.update_hotel_ix(inactive, None, Some(false));
    ok(env.send(&[ix], &admin, &[]));
    let args = env.booking_args();
    assert_err(
        env.create_booking_at(&guest, inactive, args),
        EscrowError::HotelInactive,
    );

    let mut args = env.booking_args();
    args.quote_expires_ts = env.now() - 1;
    assert_err(env.create_booking(&guest, args), EscrowError::QuoteExpired);
    let mut args = env.booking_args();
    args.quote_expires_ts = env.now();
    ok(env.create_booking(&guest, args));

    let mut args = env.booking_args();
    args.checkin_ts = env.now();
    assert_err(env.create_booking(&guest, args), EscrowError::InvalidTimes);
    let mut args = env.booking_args();
    args.checkout_ts = args.checkin_ts;
    assert_err(env.create_booking(&guest, args), EscrowError::InvalidTimes);

    let mut args = env.booking_args();
    args.amount = 0;
    assert_err(env.create_booking(&guest, args), EscrowError::InvalidAmount);

    let bad_tiers = [
        vec![],
        vec![tier(86_400, 10_000)],
        vec![tier(100, 1), tier(200, 2), tier(0, 0)],
        vec![tier(100, 1), tier(100, 2), tier(0, 0)],
        vec![tier(0, 10_001)],
        (0..9).rev().map(|i| tier(i * 100, 1)).collect(),
    ];
    for tiers in bad_tiers {
        let mut args = env.booking_args();
        args.tiers = tiers;
        assert_err(env.create_booking(&guest, args), EscrowError::InvalidTiers);
    }

    let mut args = env.booking_args();
    args.tiers = (0..8)
        .rev()
        .map(|i| tier(i * 100, 800 - i as u16 * 100))
        .collect();
    let booking = booking_pda(&args.booking_id);
    ok(env.create_booking(&guest, args));
    assert_eq!(env.booking(&booking).tier_count, 8);
}

#[test]
fn one_booking_per_booking_id() {
    let mut env = Env::new();
    let guest = env.new_guest(300 * USDC);
    let args = env.booking_args();
    let booking = booking_pda(&args.booking_id);
    ok(env.create_booking(&guest, args.clone()));
    assert_fails(env.create_booking(&guest, args.clone()));
    let mut changed = args;
    changed.amount = 50 * USDC;
    assert_fails(env.create_booking(&guest, changed));
    assert_eq!(env.balance(&ata(&guest.pubkey(), &env.mint)), 200 * USDC);
    assert_eq!(env.balance(&vault_pda(&booking)), 100 * USDC);
}

#[test]
fn create_rejects_foreign_mint_and_guest_account() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let other = env.new_guest(100 * USDC);

    // paying from someone else's token account
    let args = env.booking_args();
    let mut ix = env.create_booking_ix(&env.operator.pubkey(), &guest.pubkey(), env.hotel, args);
    ix.accounts[5].pubkey = ata(&other.pubkey(), &env.mint);
    assert_err(
        env.send_op(&[ix], &[&guest]),
        AnchorError::ConstraintTokenOwner,
    );

    // a mint other than config.mint
    let admin = env.admin.pubkey();
    let fake_mint = env.create_mint(&admin);
    let fake_ata = env.create_ata_for_mint(&guest.pubkey(), &fake_mint);
    let args = env.booking_args();
    let mut ix = env.create_booking_ix(&env.operator.pubkey(), &guest.pubkey(), env.hotel, args);
    ix.accounts[4].pubkey = fake_mint;
    ix.accounts[5].pubkey = fake_ata;
    assert_err(env.send_op(&[ix], &[&guest]), EscrowError::InvalidMint);
}

#[test]
fn fee_snapshot_survives_update_config() {
    let mut env = Env::new();
    let guest = env.new_guest(200 * USDC);
    let old = env.book_confirmed(&guest);

    let admin = env.admin.insecure_clone();
    let fee = UpdateConfigArgs {
        fee_bps: Some(1_000),
        release_delay_secs: Some(60),
        ..Default::default()
    };
    let ix = env.update_config_ix(&admin.pubkey(), fee, None);
    ok(env.send(&[ix], &admin, &[]));
    let new = env.book_confirmed(&guest);

    let b_old = env.booking(&old);
    let b_new = env.booking(&new);
    assert_eq!(b_old.fee_bps, FEE_BPS);
    assert_eq!(b_new.fee_bps, 1_000);
    assert_eq!(
        b_old.release_after_ts,
        b_old.checkin_ts + i64::from(RELEASE_DELAY)
    );
    assert_eq!(b_new.release_after_ts, b_new.checkin_ts + 60);

    env.set_time(b_old.release_after_ts);
    let treasury_before = env.balance(&env.treasury);
    let (k_old, k_new) = (env.exit_keys(old), env.exit_keys(new));
    ok(env.send_op(&[env.release_ix(&k_old), env.release_ix(&k_new)], &[]));
    assert_eq!(env.booking(&old).fee_amount, 1_500_000);
    assert_eq!(env.booking(&new).fee_amount, 10_000_000);
    assert_eq!(env.balance(&env.treasury), treasury_before + 11_500_000);
}

#[test]
fn update_hotel_authority_after_create_pays_the_snapshot() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book_confirmed(&guest);
    let original = env.hotel_owner.pubkey();

    let new_owner = Keypair::new().pubkey();
    let new_ata = env.create_ata(&new_owner);
    let admin = env.admin.insecure_clone();
    let ix = env.update_hotel_ix(env.hotel, Some(new_owner), None);
    ok(env.send(&[ix], &admin, &[]));

    let b = env.booking(&booking);
    assert_eq!(b.hotel_authority, original);
    env.set_time(b.release_after_ts);

    let mut keys = env.exit_keys(booking);
    keys.hotel_token_account = new_ata;
    assert_err(
        env.send_op(&[env.release_ix(&keys)], &[]),
        AnchorError::ConstraintTokenOwner,
    );

    let keys = env.exit_keys(booking);
    ok(env.send_op(&[env.release_ix(&keys)], &[]));
    assert_eq!(env.balance(&ata(&original, &env.mint)), 98_500_000);
    assert_eq!(env.balance(&new_ata), 0);

    // bookings created after the change snapshot the new authority
    env.set_time(T0);
    let later_guest = env.new_guest(100 * USDC);
    let later = env.book(&later_guest);
    assert_eq!(env.booking(&later).hotel_authority, new_owner);
}

#[test]
fn release_requires_confirmed_status() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book(&guest);
    let b = env.booking(&booking);
    env.set_time(b.release_after_ts);
    let keys = env.exit_keys(booking);
    assert_err(
        env.send_op(&[env.release_ix(&keys)], &[]),
        EscrowError::InvalidStatus,
    );
}

#[test]
fn release_works_after_guest_closed_their_token_account() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book_confirmed(&guest);
    let guest_ata = ata(&guest.pubkey(), &env.mint);
    let close = anchor_spl::token::spl_token::instruction::close_account(
        &anchor_spl::token::spl_token::ID,
        &guest_ata,
        &guest.pubkey(),
        &guest.pubkey(),
        &[],
    )
    .unwrap();
    ok(env.send_op(&[close], &[&guest]));
    assert!(env.is_closed(&guest_ata));

    env.set_time(env.booking(&booking).release_after_ts);
    let keys = env.exit_keys(booking);
    ok(env.send_op(&[env.release_ix(&keys)], &[]));
    assert!(env.booking(&booking).has_status(BookingStatus::Released));
}
