use {
    crate::harness::*,
    anchor_lang::error::ErrorCode as AnchorError,
    solana_keypair::Keypair,
    solana_signer::Signer,
    stumari_escrow::{error::EscrowError, UpdateConfigArgs},
};

#[test]
fn initialize_config_by_upgrade_authority() {
    let env = Env::new();
    let c = env.config_state();
    assert_eq!(c.admin, env.admin.pubkey());
    assert_eq!(c.quote_signer, env.operator.pubkey());
    assert_eq!(c.mint, env.mint);
    assert_eq!(c.treasury, env.treasury);
    assert_eq!(c.fee_bps, FEE_BPS);
    assert_eq!(c.confirm_window_secs, CONFIRM_WINDOW);
    assert_eq!(c.release_delay_secs, RELEASE_DELAY);
    assert!(!c.paused);
}

#[test]
fn initialize_config_rejects_non_upgrade_authority() {
    let mut env = Env::deployed();
    let attacker = Keypair::new();
    env.svm.airdrop(&attacker.pubkey(), 10 * SOL).unwrap();
    let ix = env.initialize_config_ix(
        &attacker.pubkey(),
        attacker.pubkey(),
        FEE_BPS,
        CONFIRM_WINDOW,
        RELEASE_DELAY,
        env.treasury,
    );
    assert_err(env.send(&[ix], &attacker, &[]), EscrowError::Unauthorized);
    assert!(env.is_closed(&env.config));
}

#[test]
fn initialize_config_validates_params() {
    let mut env = Env::deployed();
    let admin = env.admin.insecure_clone();
    let op = env.operator.pubkey();
    let treasury = env.treasury;

    let ix = env.initialize_config_ix(
        &admin.pubkey(),
        op,
        1_001,
        CONFIRM_WINDOW,
        RELEASE_DELAY,
        treasury,
    );
    assert_err(env.send(&[ix], &admin, &[]), EscrowError::FeeTooHigh);

    let ix = env.initialize_config_ix(&admin.pubkey(), op, FEE_BPS, 59, RELEASE_DELAY, treasury);
    assert_err(env.send(&[ix], &admin, &[]), EscrowError::InvalidTimes);

    let ix = env.initialize_config_ix(&admin.pubkey(), op, FEE_BPS, CONFIRM_WINDOW, 59, treasury);
    assert_err(env.send(&[ix], &admin, &[]), EscrowError::InvalidTimes);

    let other_mint = env.create_mint(&admin.pubkey());
    let foreign_treasury = env.create_ata_for_mint(&admin.pubkey(), &other_mint);
    let ix = env.initialize_config_ix(
        &admin.pubkey(),
        op,
        FEE_BPS,
        CONFIRM_WINDOW,
        RELEASE_DELAY,
        foreign_treasury,
    );
    assert_err(env.send(&[ix], &admin, &[]), EscrowError::InvalidTreasury);

    let ix = env.initialize_config_ix(&admin.pubkey(), op, 1_000, 60, 60, treasury);
    ok(env.send(&[ix], &admin, &[]));
    let ix = env.initialize_config_ix(&admin.pubkey(), op, 1_000, 60, 60, treasury);
    assert_fails(env.send(&[ix], &admin, &[]));
}

#[test]
fn update_config_changes_fields_and_validates() {
    let mut env = Env::new();
    let admin = env.admin.insecure_clone();
    let new_signer = Keypair::new().pubkey();
    let new_treasury = env.create_ata(&Keypair::new().pubkey());
    let args = UpdateConfigArgs {
        quote_signer: Some(new_signer),
        fee_bps: Some(1_000),
        confirm_window_secs: Some(60),
        release_delay_secs: Some(120),
        paused: Some(true),
        ..Default::default()
    };
    let ix = env.update_config_ix(&admin.pubkey(), args, Some(new_treasury));
    ok(env.send(&[ix], &admin, &[]));
    let c = env.config_state();
    assert_eq!(c.quote_signer, new_signer);
    assert_eq!(c.fee_bps, 1_000);
    assert_eq!((c.confirm_window_secs, c.release_delay_secs), (60, 120));
    assert!(c.paused);
    assert_eq!(c.treasury, new_treasury);
    assert_eq!(c.admin, admin.pubkey());
    assert_eq!(c.mint, env.mint);

    let fee = |fee_bps| UpdateConfigArgs {
        fee_bps: Some(fee_bps),
        ..Default::default()
    };
    let ix = env.update_config_ix(&admin.pubkey(), fee(1_001), None);
    assert_err(env.send(&[ix], &admin, &[]), EscrowError::FeeTooHigh);

    let windows = UpdateConfigArgs {
        confirm_window_secs: Some(59),
        ..Default::default()
    };
    let ix = env.update_config_ix(&admin.pubkey(), windows, None);
    assert_err(env.send(&[ix], &admin, &[]), EscrowError::InvalidTimes);

    let other_mint = env.create_mint(&admin.pubkey());
    let foreign_treasury = env.create_ata_for_mint(&admin.pubkey(), &other_mint);
    let ix = env.update_config_ix(
        &admin.pubkey(),
        UpdateConfigArgs::default(),
        Some(foreign_treasury),
    );
    assert_err(env.send(&[ix], &admin, &[]), EscrowError::InvalidTreasury);

    let stranger = Keypair::new();
    env.svm.airdrop(&stranger.pubkey(), SOL).unwrap();
    let ix = env.update_config_ix(&stranger.pubkey(), fee(0), None);
    assert_err(env.send(&[ix], &stranger, &[]), EscrowError::Unauthorized);
}

#[test]
fn update_config_transfers_admin() {
    let mut env = Env::new();
    let admin = env.admin.insecure_clone();
    let next_admin = Keypair::new();
    env.svm.airdrop(&next_admin.pubkey(), SOL).unwrap();
    let args = UpdateConfigArgs {
        admin: Some(next_admin.pubkey()),
        ..Default::default()
    };
    let ix = env.update_config_ix(&admin.pubkey(), args, None);
    ok(env.send(&[ix], &admin, &[]));

    let pause = UpdateConfigArgs {
        paused: Some(true),
        ..Default::default()
    };
    let ix = env.update_config_ix(&admin.pubkey(), pause.clone(), None);
    assert_err(env.send(&[ix], &admin, &[]), EscrowError::Unauthorized);
    let ix = env.update_config_ix(&next_admin.pubkey(), pause, None);
    ok(env.send(&[ix], &next_admin, &[]));
}

#[test]
fn register_and_update_hotel() {
    let mut env = Env::new();
    let h = env.hotel_state(&env.hotel);
    assert_eq!(h.hotel_id, env.hotel_id);
    assert_eq!(h.authority, env.hotel_owner.pubkey());
    assert!(h.active);

    let new_owner = Keypair::new().pubkey();
    let ix = env.update_hotel_ix(env.hotel, Some(new_owner), Some(false));
    let admin = env.admin.insecure_clone();
    ok(env.send(&[ix], &admin, &[]));
    let h = env.hotel_state(&env.hotel);
    assert_eq!(h.authority, new_owner);
    assert!(!h.active);

    let stranger = Keypair::new();
    env.svm.airdrop(&stranger.pubkey(), SOL).unwrap();
    let ix = env.register_hotel_ix(&stranger.pubkey(), [0xBB; 16], stranger.pubkey());
    assert_err(env.send(&[ix], &stranger, &[]), EscrowError::Unauthorized);

    let ix = env.register_hotel_ix(&admin.pubkey(), env.hotel_id, new_owner);
    assert_fails(env.send(&[ix], &admin, &[]));
}

#[test]
fn update_hotel_requires_admin() {
    let mut env = Env::new();
    let stranger = Keypair::new();
    env.svm.airdrop(&stranger.pubkey(), SOL).unwrap();
    let mut ix = env.update_hotel_ix(env.hotel, Some(stranger.pubkey()), None);
    ix.accounts[0].pubkey = stranger.pubkey();
    assert_err(env.send(&[ix], &stranger, &[]), EscrowError::Unauthorized);

    // an admin that does not sign is rejected before any constraint
    let mut ix = env.update_hotel_ix(env.hotel, Some(stranger.pubkey()), None);
    ix.accounts[0].is_signer = false;
    assert_err(
        env.send(&[ix], &stranger, &[]),
        AnchorError::AccountNotSigner,
    );
}
