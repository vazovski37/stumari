use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    constants::{BOOKING_SEED, CONFIG_SEED, VAULT_SEED},
    error::EscrowError,
    events::BookingReleased,
    logic::split_release,
    state::{Booking, BookingStatus, Config},
    vault::VaultExit,
};

/// Permissionless crank: no signer besides the fee payer. Takes no guest account so it works
/// even if the guest closed their token account.
#[derive(Accounts)]
pub struct Release<'info> {
    #[account(mut, seeds = [BOOKING_SEED, booking.booking_id.as_ref()], bump = booking.bump)]
    pub booking: Box<Account<'info, Booking>>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(address = booking.mint @ EscrowError::InvalidMint)]
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [VAULT_SEED, booking.key().as_ref()], bump = booking.vault_bump)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        dup,
        associated_token::mint = mint,
        associated_token::authority = booking.hotel_authority,
        associated_token::token_program = token_program
    )]
    pub hotel_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        dup,
        address = config.treasury @ EscrowError::InvalidTreasury,
        // a treasury equal to this booking's vault is a misconfiguration (release/resolve could not close it)
        constraint = treasury.key() != vault.key() @ EscrowError::InvalidTreasury
    )]
    pub treasury: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = booking.rent_payer @ EscrowError::Unauthorized)]
    pub rent_payer: SystemAccount<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_release(ctx: Context<Release>) -> Result<()> {
    let a = ctx.accounts;
    require!(
        a.booking.has_status(BookingStatus::Confirmed),
        EscrowError::InvalidStatus
    );
    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= a.booking.release_after_ts,
        EscrowError::NotReleasable
    );
    let split = split_release(a.booking.amount, a.booking.fee_bps)?;

    let excess = VaultExit {
        booking: &a.booking,
        vault: &mut a.vault,
        mint: &a.mint,
        treasury: a.treasury.to_account_info(),
        rent_payer: a.rent_payer.to_account_info(),
    }
    .settle(&[
        (a.hotel_token_account.to_account_info(), split.hotel_net),
        (a.treasury.to_account_info(), split.fee),
    ])?;

    a.booking.record_exit(BookingStatus::Released, &split, now);
    emit!(BookingReleased {
        booking: a.booking.key(),
        hotel_authority: a.booking.hotel_authority,
        hotel_amount: split.hotel_net,
        fee: split.fee,
        excess,
    });
    Ok(())
}
