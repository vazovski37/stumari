use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    constants::{BOOKING_SEED, CONFIG_SEED, VAULT_SEED},
    error::EscrowError,
    events::DisputeResolved,
    logic::split_resolve,
    state::{Booking, BookingStatus, Config},
    vault::VaultExit,
};

/// Arbiter stub (ADR-0006): the admin chooses only the guest/hotel split of a disputed booking.
#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(address = config.admin @ EscrowError::Unauthorized)]
    pub admin: Signer<'info>,
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
    #[account(mut, dup, address = config.treasury @ EscrowError::InvalidTreasury)]
    pub treasury: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = booking.rent_payer @ EscrowError::Unauthorized)]
    pub rent_payer: SystemAccount<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_resolve_dispute(ctx: Context<ResolveDispute>, guest_bps: u16) -> Result<()> {
    let a = ctx.accounts;
    require!(
        a.booking.has_status(BookingStatus::Disputed),
        EscrowError::InvalidStatus
    );
    let split = split_resolve(a.booking.amount, a.booking.fee_bps, guest_bps)?;
    let now = Clock::get()?.unix_timestamp;

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

    a.booking.record_exit(BookingStatus::Resolved, &split, now);
    emit!(DisputeResolved {
        booking: a.booking.key(),
        guest_bps,
        refund: split.refund,
        hotel_amount: split.hotel_net,
        fee: split.fee,
        excess,
    });
    Ok(())
}
