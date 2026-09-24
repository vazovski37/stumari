use {
    crate::harness::*,
    solana_keypair::Keypair,
    solana_signer::Signer,
    stumari_escrow::{
        error::EscrowError,
        events::{BookingVoided, DisputeResolved},
        BookingStatus,
    },
};

#[test]
fn dispute_at_checkin_then_resolve_odd_split() {
    let mut env = Env::new();
    let guest = env.new_guest(123_456_789);
    let mut args = env.booking_args();
    args.amount = 123_456_789;
    let booking = booking_pda(&args.booking_id);
    ok(env.create_booking(&guest, args));
    ok(env.send_op(
        &[env.confirm_ix(&env.operator.pubkey(), booking, env.hotel)],
        &[],
    ));
    let b = env.booking(&booking);

    env.set_time(b.checkin_ts - 1);
    let ix = env.flag_dispute_ix(&guest.pubkey(), booking);
    assert_err(
        env.send_op(&[ix], &[&guest]),
        EscrowError::DisputeWindowClosed,
    );

    env.set_time(b.checkin_ts);
    let ix = env.flag_dispute_ix(&env.operator.pubkey(), booking);
    assert_err(env.send_op(&[ix], &[]), EscrowError::Unauthorized);
    let ix = env.flag_dispute_ix(&guest.pubkey(), booking);
    ok(env.send_op(&[ix], &[&guest]));
    assert!(env.booking(&booking).has_status(BookingStatus::Disputed));

    // a disputed booking can no longer be released or disputed again
    env.set_time(b.release_after_ts + DAY);
    let keys = env.exit_keys(booking);
    assert_err(
        env.send_op(&[env.release_ix(&keys)], &[]),
        EscrowError::InvalidStatus,
    );
    let ix = env.flag_dispute_ix(&guest.pubkey(), booking);
    assert_err(env.send_op(&[ix], &[&guest]), EscrowError::InvalidStatus);

    let stranger = Keypair::new();
    let ix = env.resolve_ix(&stranger.pubkey(), &keys, 3_333);
    assert_err(env.send_op(&[ix], &[&stranger]), EscrowError::Unauthorized);

    let admin = env.admin.insecure_clone();
    let ix = env.resolve_ix(&admin.pubkey(), &keys, 10_001);
    assert_err(env.send(&[ix], &admin, &[]), EscrowError::InvalidBps);

    let treasury_before = env.balance(&env.treasury);
    let ix = env.resolve_ix(&admin.pubkey(), &keys, 3_333);
    let resolved: DisputeResolved = event(&ok(env.send(&[ix], &admin, &[])));
    // spec/vectors/refund.json resolve_odd_split_rounding
    let (refund, fee, hotel_net) = (41_148_147, 1_234_629, 81_074_013);
    assert_eq!(resolved.booking, booking);
    assert_eq!(
        (
            resolved.guest_bps,
            resolved.refund,
            resolved.hotel_amount,
            resolved.fee,
            resolved.excess
        ),
        (3_333, refund, hotel_net, fee, 0)
    );
    assert_eq!(env.balance(&ata(&guest.pubkey(), &env.mint)), refund);
    assert_eq!(
        env.balance(&ata(&env.hotel_owner.pubkey(), &env.mint)),
        hotel_net
    );
    assert_eq!(env.balance(&env.treasury), treasury_before + fee);
    assert!(env.is_closed(&keys.vault));
    let b = env.booking(&booking);
    assert!(b.has_status(BookingStatus::Resolved));
    assert_eq!(
        (b.refund_amount, b.hotel_amount, b.fee_amount),
        (refund, hotel_net, fee)
    );

    let ix = env.resolve_ix(&admin.pubkey(), &keys, 3_333);
    assert_fails(env.send(&[ix], &admin, &[]));
}

#[test]
fn dispute_closes_at_release_after() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book_confirmed(&guest);
    let b = env.booking(&booking);
    env.set_time(b.release_after_ts);
    let ix = env.flag_dispute_ix(&guest.pubkey(), booking);
    assert_err(
        env.send_op(&[ix], &[&guest]),
        EscrowError::DisputeWindowClosed,
    );

    env.set_time(b.release_after_ts - 1);
    let ix = env.flag_dispute_ix(&guest.pubkey(), booking);
    ok(env.send_op(&[ix], &[&guest]));
}

#[test]
fn dispute_requires_confirmed_booking() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book(&guest);
    env.set_time(env.booking(&booking).checkin_ts);
    let ix = env.flag_dispute_ix(&guest.pubkey(), booking);
    assert_err(env.send_op(&[ix], &[&guest]), EscrowError::InvalidStatus);
}

#[test]
fn resolve_requires_disputed_booking() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book_confirmed(&guest);
    let keys = env.exit_keys(booking);
    let admin = env.admin.insecure_clone();
    let ix = env.resolve_ix(&admin.pubkey(), &keys, 5_000);
    assert_err(env.send(&[ix], &admin, &[]), EscrowError::InvalidStatus);
}

#[test]
fn void_after_deadline_by_anyone() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book(&guest);
    let b = env.booking(&booking);
    let keys = env.exit_keys(booking);
    let stranger = Keypair::new();
    env.svm.airdrop(&stranger.pubkey(), SOL).unwrap();

    env.set_time(b.confirm_deadline_ts - 1);
    let ix = env.void_ix(&stranger.pubkey(), &keys);
    assert_err(env.send(&[ix], &stranger, &[]), EscrowError::VoidTooEarly);

    env.set_time(b.confirm_deadline_ts);
    let rent_before = env.lamports(&b.rent_payer);
    let vault_rent = env.lamports(&keys.vault);
    let treasury_before = env.balance(&env.treasury);
    let ix = env.void_ix(&stranger.pubkey(), &keys);
    let voided: BookingVoided = event(&ok(env.send(&[ix], &stranger, &[])));
    assert_eq!(voided.booking, booking);
    assert!(!voided.by_admin);
    assert_eq!((voided.refund, voided.excess), (100 * USDC, 0));

    assert_eq!(env.balance(&ata(&guest.pubkey(), &env.mint)), 100 * USDC);
    assert_eq!(env.balance(&env.treasury), treasury_before);
    assert!(env.is_closed(&keys.vault));
    assert_eq!(env.lamports(&b.rent_payer), rent_before + vault_rent);
    let b = env.booking(&booking);
    assert!(b.has_status(BookingStatus::Voided));
    assert_eq!(
        (b.refund_amount, b.hotel_amount, b.fee_amount),
        (100 * USDC, 0, 0)
    );
    assert_eq!(b.closed_ts, b.confirm_deadline_ts);

    let ix = env.void_ix(&stranger.pubkey(), &keys);
    assert_fails(env.send(&[ix], &stranger, &[]));
}

#[test]
fn admin_void_before_deadline() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book(&guest);
    let keys = env.exit_keys(booking);
    let admin = env.admin.insecure_clone();
    let ix = env.void_ix(&admin.pubkey(), &keys);
    let voided: BookingVoided = event(&ok(env.send(&[ix], &admin, &[])));
    assert!(voided.by_admin);
    assert_eq!((voided.refund, voided.excess), (100 * USDC, 0));
    assert!(env.booking(&booking).has_status(BookingStatus::Voided));
    assert_eq!(env.balance(&ata(&guest.pubkey(), &env.mint)), 100 * USDC);
}

#[test]
fn void_requires_pending_booking() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book_confirmed(&guest);
    let keys = env.exit_keys(booking);
    let admin = env.admin.insecure_clone();
    let ix = env.void_ix(&admin.pubkey(), &keys);
    assert_err(env.send(&[ix], &admin, &[]), EscrowError::InvalidStatus);
}
