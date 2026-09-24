use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    constants::{BOOKING_SEED, BPS_DENOM, CONFIG_SEED, VAULT_SEED},
    error::EscrowError,
    events::BookingVoided,
    logic::split_resolve,
    state::{Booking, BookingStatus, Config},
    vault::VaultExit,
};

/// Full refund of an unconfirmed booking: by anyone once the confirm window has closed, or by
/// the admin at any time.
#[derive(Accounts)]
pub struct VoidBooking<'info> {
    pub authority: Signer<'info>,
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
        associated_token::authority = booking.guest,
        associated_token::token_program = token_program
    )]
    pub guest_token_account: Box<Account<'info, TokenAccount>>,
    /// Receives only swept vault excess, never a fee.
    #[account(
        mut,
        dup,
        address = config.treasury @ EscrowError::InvalidTreasury,
        // its own vault as treasury would pay the fee and excess to itself and never close
        constraint = treasury.key() != vault.key() @ EscrowError::InvalidTreasury
    )]
    pub treasury: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = booking.rent_payer @ EscrowError::Unauthorized)]
    pub rent_payer: SystemAccount<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_void_booking(ctx: Context<VoidBooking>) -> Result<()> {
    let a = ctx.accounts;
    require!(
        a.booking.has_status(BookingStatus::Pending),
        EscrowError::InvalidStatus
    );
    let now = Clock::get()?.unix_timestamp;
    let by_admin = a.authority.key() == a.config.admin;
    require!(
        by_admin || now >= a.booking.confirm_deadline_ts,
        EscrowError::VoidTooEarly
    );
    // A full refund is a 100% resolve: no hotel share, so no fee.
    let split = split_resolve(a.booking.amount, a.booking.fee_bps, BPS_DENOM)?;

    let excess = VaultExit {
        booking: &a.booking,
        vault: &mut a.vault,
        mint: &a.mint,
        treasury: a.treasury.to_account_info(),
        rent_payer: a.rent_payer.to_account_info(),
    }
    .settle(&[(a.guest_token_account.to_account_info(), split.refund)])?;

    a.booking.record_exit(BookingStatus::Voided, &split, now);
    emit!(BookingVoided {
        booking: a.booking.key(),
        by_admin,
        refund: split.refund,
        excess,
    });
    Ok(())
}
