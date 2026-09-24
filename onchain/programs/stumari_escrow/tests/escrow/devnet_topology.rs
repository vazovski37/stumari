//! Regression for the devnet topology (security.md): one key is the upgrade authority, admin,
//! quote signer, fee payer and rent payer, and owns the treasury. Signer and SystemAccount
//! aliasing must not trip Anchor's duplicate-account checks.

use {
    crate::harness::*,
    anchor_spl::token::TokenAccount,
    solana_signer::Signer,
    stumari_escrow::{
        events::{BookingVoided, DisputeResolved},
        BookingStatus,
    },
};

#[test]
fn one_key_admin_void_and_resolve_dispute() {
    let mut env = Env::single_key();
    let key = env.operator.insecure_clone();
    let config = env.config_state();
    assert_eq!(env.admin.pubkey(), key.pubkey());
    assert_eq!(
        (config.admin, config.quote_signer),
        (key.pubkey(), key.pubkey())
    );
    assert_eq!(
        env.fetch::<TokenAccount>(&config.treasury).owner,
        key.pubkey()
    );
    let guest = env.new_guest(200 * USDC);
    let guest_ata = ata(&guest.pubkey(), &env.mint);
    let hotel_ata = ata(&env.hotel_owner.pubkey(), &env.mint);

    // admin void before the confirm deadline: the key signs as authority and pays the fee
    let booking = env.book(&guest);
    let keys = env.exit_keys(booking);
    assert_eq!(keys.rent_payer, key.pubkey());
    let lamports_before = env.lamports(&key.pubkey());
    let vault_rent = env.lamports(&keys.vault);
    let meta = ok(env.send_op(&[env.void_ix(&key.pubkey(), &keys)], &[]));
    let voided: BookingVoided = event(&meta);
    assert_eq!(voided.booking, booking);
    assert!(voided.by_admin);
    assert_eq!((voided.refund, voided.excess), (100 * USDC, 0));
    assert_eq!(env.balance(&guest_ata), 200 * USDC);
    assert!(env.is_closed(&keys.vault));
    assert_eq!(
        env.lamports(&key.pubkey()),
        lamports_before + vault_rent - meta.fee
    );
    assert!(env.booking(&booking).has_status(BookingStatus::Voided));

    // a void after the deadline by the same key (the cron) also reports by_admin
    let booking = env.book(&guest);
    env.set_time(env.booking(&booking).confirm_deadline_ts);
    let keys = env.exit_keys(booking);
    let meta = ok(env.send_op(&[env.void_ix(&key.pubkey(), &keys)], &[]));
    assert!(event::<BookingVoided>(&meta).by_admin);

    // dispute at check-in, resolved 25% to the guest by the same key
    let booking = env.book_confirmed(&guest);
    env.set_time(env.booking(&booking).checkin_ts);
    ok(env.send_op(&[env.flag_dispute_ix(&guest.pubkey(), booking)], &[&guest]));
    let keys = env.exit_keys(booking);
    let treasury_before = env.balance(&keys.treasury);
    let lamports_before = env.lamports(&key.pubkey());
    let vault_rent = env.lamports(&keys.vault);
    let meta = ok(env.send_op(&[env.resolve_ix(&key.pubkey(), &keys, 2_500)], &[]));
    let resolved: DisputeResolved = event(&meta);
    // refund 25; hotel gross 75, fee 1.5% of it = 1.125, net 73.875
    let (refund, hotel_net, fee) = (25 * USDC, 73_875_000, 1_125_000);
    assert_eq!(resolved.booking, booking);
    assert_eq!(
        (
            resolved.guest_bps,
            resolved.refund,
            resolved.hotel_amount,
            resolved.fee,
            resolved.excess
        ),
        (2_500, refund, hotel_net, fee, 0)
    );
    assert_eq!(env.balance(&guest_ata), 100 * USDC + refund);
    assert_eq!(env.balance(&hotel_ata), hotel_net);
    assert_eq!(env.balance(&keys.treasury), treasury_before + fee);
    assert!(env.is_closed(&keys.vault));
    assert_eq!(
        env.lamports(&key.pubkey()),
        lamports_before + vault_rent - meta.fee
    );
    let b = env.booking(&booking);
    assert!(b.has_status(BookingStatus::Resolved));
    assert_eq!(
        (b.refund_amount, b.hotel_amount, b.fee_amount),
        (refund, hotel_net, fee)
    );
}
