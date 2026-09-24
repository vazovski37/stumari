use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    constants::{BOOKING_SEED, CONFIG_SEED, VAULT_SEED},
    error::EscrowError,
    events::BookingCancelled,
    logic::split_cancel,
    state::{Booking, BookingStatus, Config},
    vault::VaultExit,
};

#[derive(Accounts)]
pub struct CancelBooking<'info> {
    #[account(address = booking.guest @ EscrowError::Unauthorized)]
    pub guest: Signer<'info>,
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

/// `min_refund` protects the guest against a confirm or a tier boundary landing between
/// building and sending the transaction.
pub fn handle_cancel_booking(ctx: Context<CancelBooking>, min_refund: u64) -> Result<()> {
    let a = ctx.accounts;
    let pending = a.booking.has_status(BookingStatus::Pending);
    require!(
        pending || a.booking.has_status(BookingStatus::Confirmed),
        EscrowError::InvalidStatus
    );
    let now = Clock::get()?.unix_timestamp;
    let b = &a.booking;
    let cancel = split_cancel(
        b.amount,
        b.fee_bps,
        b.active_tiers(),
        pending,
        b.checkin_ts,
        now,
    )?;
    let split = cancel.split;
    require!(split.refund >= min_refund, EscrowError::RefundBelowMinimum);

    let excess = VaultExit {
        booking: &a.booking,
        vault: &mut a.vault,
        mint: &a.mint,
        treasury: a.treasury.to_account_info(),
        rent_payer: a.rent_payer.to_account_info(),
    }
    .settle(&[
        (a.guest_token_account.to_account_info(), split.refund),
        (a.hotel_token_account.to_account_info(), split.hotel_net),
        (a.treasury.to_account_info(), split.fee),
    ])?;

    a.booking.record_exit(BookingStatus::Cancelled, &split, now);
    emit!(BookingCancelled {
        booking: a.booking.key(),
        secs_before: cancel.secs_before,
        refund_bps: cancel.refund_bps,
        refund: split.refund,
        hotel_amount: split.hotel_net,
        fee: split.fee,
        excess,
    });
    Ok(())
}
