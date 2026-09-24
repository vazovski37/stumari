use {
    crate::harness::*,
    solana_keypair::Keypair,
    solana_signer::Signer,
    stumari_escrow::{error::EscrowError, BookingStatus},
};

struct Balances {
    guest: u64,
    hotel: u64,
    treasury: u64,
}

fn balances(env: &Env, guest: &Keypair) -> Balances {
    Balances {
        guest: env.balance(&ata(&guest.pubkey(), &env.mint)),
        hotel: env.balance(&ata(&env.hotel_owner.pubkey(), &env.mint)),
        treasury: env.balance(&env.treasury),
    }
}

/// Confirmed 100 USDC booking (fee 1.5%, standard tiers) cancelled `secs_before` check-in.
fn cancel_confirmed_at(env: &mut Env, guest: &Keypair, secs_before: i64) -> (u64, u64, u64) {
    env.set_time(T0);
    let booking = env.book_confirmed(guest);
    let b = env.booking(&booking);
    env.set_time(b.checkin_ts - secs_before);
    let keys = env.exit_keys(booking);
    let before = balances(env, guest);
    let rent_payer_before = env.lamports(&b.rent_payer);
    let vault_rent = env.lamports(&keys.vault);

    // min_refund = 0 here; the exact guard is tested separately
    let ix = env.cancel_ix(&guest.pubkey(), &keys, 0);
    let tx_fee = ok(env.send_op(&[ix], &[guest])).fee;

    let after = balances(env, guest);
    let split = (
        after.guest - before.guest,
        after.hotel - before.hotel,
        after.treasury - before.treasury,
    );
    let b = env.booking(&booking);
    assert!(b.has_status(BookingStatus::Cancelled));
    assert_eq!((b.refund_amount, b.hotel_amount, b.fee_amount), split);
    assert_eq!(split.0 + split.1 + split.2, b.amount, "invariant");
    assert_eq!(b.closed_ts, b.checkin_ts - secs_before);
    assert!(env.is_closed(&keys.vault));
    // the operator paid this tx fee and got the vault rent back
    assert_eq!(
        env.lamports(&b.rent_payer),
        rent_payer_before + vault_rent - tx_fee
    );
    split
}

#[test]
fn cancel_at_each_tier_boundary() {
    let mut env = Env::new();
    let guest = env.new_guest(1_000 * USDC);
    let full = (100 * USDC, 0, 0);
    let half = (50 * USDC, 49_250_000, 750_000);
    let none = (0, 98_500_000, 1_500_000);
    let cases = [
        (604_801, full),
        (604_800, full),
        (604_799, half),
        (259_201, half),
        (259_200, half),
        (259_199, none),
        (1, none),
    ];
    for (secs_before, expected) in cases {
        assert_eq!(
            cancel_confirmed_at(&mut env, &guest, secs_before),
            expected,
            "secs_before = {secs_before}"
        );
    }
}

#[test]
fn cancel_while_pending_refunds_everything() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book(&guest);
    let b = env.booking(&booking);
    env.set_time(b.checkin_ts - 1);
    let keys = env.exit_keys(booking);
    let ix = env.cancel_ix(&guest.pubkey(), &keys, 100 * USDC);
    ok(env.send_op(&[ix], &[&guest]));
    assert_eq!(env.balance(&ata(&guest.pubkey(), &env.mint)), 100 * USDC);
    let b = env.booking(&booking);
    assert_eq!(
        (b.refund_amount, b.hotel_amount, b.fee_amount),
        (100 * USDC, 0, 0)
    );
    assert!(env.is_closed(&keys.vault));
}

#[test]
fn cancel_by_non_guest_fails() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book_confirmed(&guest);
    let keys = env.exit_keys(booking);
    let intruder = Keypair::new();
    let ix = env.cancel_ix(&intruder.pubkey(), &keys, 0);
    assert_err(env.send_op(&[ix], &[&intruder]), EscrowError::Unauthorized);
    let op = env.operator.pubkey();
    let ix = env.cancel_ix(&op, &keys, 0);
    assert_err(env.send_op(&[ix], &[]), EscrowError::Unauthorized);
}

#[test]
fn cancel_at_or_after_checkin_fails() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book_confirmed(&guest);
    let b = env.booking(&booking);
    let keys = env.exit_keys(booking);
    for t in [b.checkin_ts, b.checkin_ts + 10] {
        env.set_time(t);
        let ix = env.cancel_ix(&guest.pubkey(), &keys, 0);
        assert_err(env.send_op(&[ix], &[&guest]), EscrowError::TooLateToCancel);
    }
}

#[test]
fn cancel_below_min_refund_fails() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book(&guest);
    let b = env.booking(&booking);
    let keys = env.exit_keys(booking);
    // the guest saw Pending terms (100%) but a confirm lands first; at 5 days the tier is 50%
    let ix = env.confirm_ix(&env.operator.pubkey(), booking, env.hotel);
    ok(env.send_op(&[ix], &[]));
    env.set_time(b.checkin_ts - 5 * DAY);

    let ix = env.cancel_ix(&guest.pubkey(), &keys, 100 * USDC);
    assert_err(
        env.send_op(&[ix], &[&guest]),
        EscrowError::RefundBelowMinimum,
    );
    let ix = env.cancel_ix(&guest.pubkey(), &keys, 50 * USDC + 1);
    assert_err(
        env.send_op(&[ix], &[&guest]),
        EscrowError::RefundBelowMinimum,
    );

    let ix = env.cancel_ix(&guest.pubkey(), &keys, 50 * USDC);
    ok(env.send_op(&[ix], &[&guest]));
    assert_eq!(env.balance(&ata(&guest.pubkey(), &env.mint)), 50 * USDC);

    let ix = env.cancel_ix(&guest.pubkey(), &keys, 0);
    assert_fails(env.send_op(&[ix], &[&guest]));
}

#[test]
fn cancel_after_terminal_status_fails() {
    let mut env = Env::new();
    let guest = env.new_guest(100 * USDC);
    let booking = env.book_confirmed(&guest);
    let b = env.booking(&booking);
    env.set_time(b.checkin_ts);
    ok(env.send_op(&[env.flag_dispute_ix(&guest.pubkey(), booking)], &[&guest]));
    env.set_time(b.checkin_ts - DAY);
    let keys = env.exit_keys(booking);
    let ix = env.cancel_ix(&guest.pubkey(), &keys, 0);
    assert_err(env.send_op(&[ix], &[&guest]), EscrowError::InvalidStatus);
}
