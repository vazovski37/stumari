//! Account substitution on every exit, vault donation griefing, and aliased payout accounts.

use {
    crate::harness::*,
    anchor_lang::{error::ErrorCode as AnchorError, prelude::Pubkey},
    litesvm::types::TransactionResult,
    solana_keypair::Keypair,
    solana_signer::Signer,
    stumari_escrow::{error::EscrowError, BookingStatus, UpdateConfigArgs},
};

#[derive(Clone, Copy, Debug, PartialEq)]
enum Exit {
    Cancel,
    Release,
    Resolve,
    Void,
}

const EXITS: [Exit; 4] = [Exit::Cancel, Exit::Release, Exit::Resolve, Exit::Void];

/// A booking by `guest` in the state and at the time where `exit` is allowed.
fn prepare(env: &mut Env, exit: Exit, guest: &Keypair) -> Pubkey {
    env.set_time(T0);
    if exit == Exit::Void {
        return env.book(guest);
    }
    let booking = env.book_confirmed(guest);
    let b = env.booking(&booking);
    match exit {
        Exit::Release => env.set_time(b.release_after_ts),
        Exit::Resolve => {
            env.set_time(b.checkin_ts);
            ok(env.send_op(&[env.flag_dispute_ix(&guest.pubkey(), booking)], &[guest]));
        }
        _ => {}
    }
    booking
}

fn send_exit(env: &mut Env, exit: Exit, guest: &Keypair, k: &ExitKeys) -> TransactionResult {
    let admin = env.admin.insecure_clone();
    match exit {
        Exit::Cancel => {
            let ix = env.cancel_ix(&guest.pubkey(), k, 0);
            env.send_op(&[ix], &[guest])
        }
        Exit::Release => {
            let ix = env.release_ix(k);
            env.send_op(&[ix], &[])
        }
        Exit::Resolve => {
            let ix = env.resolve_ix(&admin.pubkey(), k, 2_500);
            env.send_op(&[ix], &[&admin])
        }
        Exit::Void => {
            let ix = env.void_ix(&admin.pubkey(), k);
            env.send_op(&[ix], &[&admin])
        }
    }
}

#[test]
fn substituted_accounts_are_rejected_on_every_exit() {
    let mut env = Env::new();
    let guest = env.new_guest(1_000 * USDC);
    let other = env.new_guest(1_000 * USDC);
    let other_ata = ata(&other.pubkey(), &env.mint);
    let foreign_treasury = env.create_ata(&Keypair::new().pubkey());
    let admin = env.admin.pubkey();
    let foreign_mint = env.create_mint(&admin);
    let guest_side_account = env.create_token_account(&guest.pubkey());
    let hotel_side_account = env.create_token_account(&env.hotel_owner.pubkey());

    for exit in EXITS {
        let booking = prepare(&mut env, exit, &guest);
        let now = env.now();
        env.set_time(T0);
        let decoy = env.book(&other);
        env.set_time(now);
        let keys = env.exit_keys(booking);

        let mut attacks: Vec<(&str, ExitKeys, u32)> = vec![
            (
                "another booking's vault",
                ExitKeys {
                    vault: vault_pda(&decoy),
                    ..keys
                },
                AnchorError::ConstraintSeeds.into(),
            ),
            (
                "treasury != config",
                ExitKeys {
                    treasury: foreign_treasury,
                    ..keys
                },
                EscrowError::InvalidTreasury.into(),
            ),
            (
                "rent_payer != booking",
                ExitKeys {
                    rent_payer: other.pubkey(),
                    ..keys
                },
                EscrowError::Unauthorized.into(),
            ),
            (
                "mint != booking",
                ExitKeys {
                    mint: foreign_mint,
                    ..keys
                },
                EscrowError::InvalidMint.into(),
            ),
            (
                "hotel as booking",
                ExitKeys {
                    booking: env.hotel,
                    ..keys
                },
                AnchorError::AccountDiscriminatorMismatch.into(),
            ),
        ];
        if exit != Exit::Release {
            attacks.push((
                "guest ATA of another owner",
                ExitKeys {
                    guest_token_account: other_ata,
                    ..keys
                },
                AnchorError::ConstraintTokenOwner.into(),
            ));
            attacks.push((
                "guest-owned non-ATA account",
                ExitKeys {
                    guest_token_account: guest_side_account,
                    ..keys
                },
                AnchorError::ConstraintAssociated.into(),
            ));
        }
        if exit != Exit::Void {
            attacks.push((
                "hotel ATA of a non-snapshot authority",
                ExitKeys {
                    hotel_token_account: other_ata,
                    ..keys
                },
                AnchorError::ConstraintTokenOwner.into(),
            ));
            attacks.push((
                "hotel-owned non-ATA account",
                ExitKeys {
                    hotel_token_account: hotel_side_account,
                    ..keys
                },
                AnchorError::ConstraintAssociated.into(),
            ));
        }
        for (name, bad, code) in attacks {
            let res = send_exit(&mut env, exit, &guest, &bad);
            assert_eq!(custom_error(&res), Some(code), "{exit:?} / {name}: {res:?}");
        }
        // untouched accounts still work, so each failure above came from the substitution
        ok(send_exit(&mut env, exit, &guest, &keys));
        assert!(env.is_closed(&keys.vault), "{exit:?}");
        assert!(
            !env.is_closed(&vault_pda(&decoy)),
            "{exit:?}: decoy vault intact"
        );
    }
}

#[test]
fn vault_donation_is_swept_on_every_exit() {
    let mut env = Env::new();
    let guest = env.new_guest(1_000 * USDC);
    let donor = env.new_guest(10);
    let donor_ata = ata(&donor.pubkey(), &env.mint);

    for exit in EXITS {
        let booking = prepare(&mut env, exit, &guest);
        let keys = env.exit_keys(booking);
        env.transfer(&donor, &donor_ata, &keys.vault, 1);
        assert_eq!(env.balance(&keys.vault), 100 * USDC + 1);

        let treasury_before = env.balance(&env.treasury);
        ok(send_exit(&mut env, exit, &guest, &keys));
        assert!(env.is_closed(&keys.vault), "{exit:?}: vault closed");
        let b = env.booking(&booking);
        assert_eq!(
            b.refund_amount + b.hotel_amount + b.fee_amount,
            100 * USDC,
            "{exit:?}"
        );
        assert_eq!(
            env.balance(&env.treasury),
            treasury_before + b.fee_amount + 1,
            "{exit:?}: fee + excess to treasury"
        );
    }
}

#[test]
fn guest_as_hotel_and_treasury_owner_dup_accounts() {
    let mut env = Env::new();
    let funds = 300 * USDC;
    let founder = env.new_guest(funds);
    let founder_ata = ata(&founder.pubkey(), &env.mint);
    let hotel = env.register_hotel([0xEE; 16], founder.pubkey());
    let admin = env.admin.insecure_clone();
    let ix = env.update_config_ix(
        &admin.pubkey(),
        UpdateConfigArgs::default(),
        Some(founder_ata),
    );
    ok(env.send(&[ix], &admin, &[]));

    let book = |env: &mut Env| {
        env.set_time(T0);
        let args = env.booking_args();
        let booking = booking_pda(&args.booking_id);
        ok(env.create_booking_at(&founder, hotel, args));
        ok(env.send_op(
            &[env.confirm_ix(&founder.pubkey(), booking, hotel)],
            &[&founder],
        ));
        booking
    };

    // cancel in the 50% tier: refund, hotel share and fee all land in one account
    let cancelled = book(&mut env);
    let keys = env.exit_keys(cancelled);
    assert_eq!(keys.guest_token_account, keys.hotel_token_account);
    assert_eq!(keys.guest_token_account, keys.treasury);
    env.set_time(env.booking(&cancelled).checkin_ts - 5 * DAY);
    ok(env.send_op(
        &[env.cancel_ix(&founder.pubkey(), &keys, 50 * USDC)],
        &[&founder],
    ));
    let b = env.booking(&cancelled);
    assert!(b.has_status(BookingStatus::Cancelled));
    assert_eq!(
        (b.refund_amount, b.hotel_amount, b.fee_amount),
        (50 * USDC, 49_250_000, 750_000)
    );
    assert_eq!(env.balance(&founder_ata), funds);

    let released = book(&mut env);
    let keys = env.exit_keys(released);
    env.set_time(env.booking(&released).release_after_ts);
    ok(env.send_op(&[env.release_ix(&keys)], &[]));
    let b = env.booking(&released);
    assert!(b.has_status(BookingStatus::Released));
    assert_eq!(b.hotel_amount + b.fee_amount, 100 * USDC);
    assert_eq!(env.balance(&founder_ata), funds);

    let resolved = book(&mut env);
    let keys = env.exit_keys(resolved);
    env.set_time(env.booking(&resolved).checkin_ts);
    ok(env.send_op(
        &[env.flag_dispute_ix(&founder.pubkey(), resolved)],
        &[&founder],
    ));
    ok(env.send(
        &[env.resolve_ix(&admin.pubkey(), &keys, 5_000)],
        &admin,
        &[],
    ));
    assert!(env.booking(&resolved).has_status(BookingStatus::Resolved));
    assert_eq!(env.balance(&founder_ata), funds);
}
