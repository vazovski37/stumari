use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::{
    constants::{BOOKING_SEED, CONFIG_SEED, HOTEL_SEED, MAX_TIERS, VAULT_SEED},
    error::EscrowError,
    events::BookingCreated,
    logic::validate_tiers,
    state::{Booking, BookingStatus, Config, Hotel, Tier},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateBookingArgs {
    /// `sha256("stumari-booking-v1" || quote.id)[0..16]`: one booking per quote.
    pub booking_id: [u8; 16],
    pub amount: u64,
    pub checkin_ts: i64,
    pub checkout_ts: i64,
    pub quote_hash: [u8; 32],
    pub option_index: u8,
    pub tiers: Vec<Tier>,
    pub quote_expires_ts: i64,
}

/// The quote signer co-signs the whole message (ADR-0004) and pays every fee and rent, so the
/// guest signs only as token authority and needs no SOL.
#[derive(Accounts)]
#[instruction(args: CreateBookingArgs)]
pub struct CreateBooking<'info> {
    #[account(mut, address = config.quote_signer @ EscrowError::Unauthorized)]
    pub quote_signer: Signer<'info>,
    pub guest: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(seeds = [HOTEL_SEED, hotel.hotel_id.as_ref()], bump = hotel.bump)]
    pub hotel: Box<Account<'info, Hotel>>,
    #[account(address = config.mint @ EscrowError::InvalidMint)]
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = guest)]
    pub guest_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = quote_signer,
        space = 8 + Booking::INIT_SPACE,
        seeds = [BOOKING_SEED, args.booking_id.as_ref()],
        bump
    )]
    pub booking: Box<Account<'info, Booking>>,
    #[account(
        init,
        payer = quote_signer,
        seeds = [VAULT_SEED, booking.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = booking,
        token::token_program = token_program
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_booking(ctx: Context<CreateBooking>, args: CreateBookingArgs) -> Result<()> {
    let accounts = ctx.accounts;
    let config = &accounts.config;
    let now = Clock::get()?.unix_timestamp;

    require!(!config.paused, EscrowError::Paused);
    require!(accounts.hotel.active, EscrowError::HotelInactive);
    require!(now <= args.quote_expires_ts, EscrowError::QuoteExpired);
    require!(
        now < args.checkin_ts && args.checkin_ts < args.checkout_ts,
        EscrowError::InvalidTimes
    );
    require!(args.amount > 0, EscrowError::InvalidAmount);
    validate_tiers(&args.tiers)?;

    token::transfer_checked(
        CpiContext::new(
            Token::id(),
            TransferChecked {
                from: accounts.guest_token_account.to_account_info(),
                mint: accounts.mint.to_account_info(),
                to: accounts.vault.to_account_info(),
                authority: accounts.guest.to_account_info(),
            },
        ),
        args.amount,
        accounts.mint.decimals,
    )?;

    let mut tiers = [Tier::default(); MAX_TIERS];
    tiers[..args.tiers.len()].copy_from_slice(&args.tiers);
    let confirm_deadline_ts = now
        .checked_add(i64::from(config.confirm_window_secs))
        .ok_or(EscrowError::MathOverflow)?;
    let release_after_ts = args
        .checkin_ts
        .checked_add(i64::from(config.release_delay_secs))
        .ok_or(EscrowError::MathOverflow)?;

    let booking_key = accounts.booking.key();
    accounts.booking.set_inner(Booking {
        booking_id: args.booking_id,
        hotel: accounts.hotel.key(),
        hotel_authority: accounts.hotel.authority,
        guest: accounts.guest.key(),
        rent_payer: accounts.quote_signer.key(),
        mint: accounts.mint.key(),
        amount: args.amount,
        fee_bps: config.fee_bps,
        checkin_ts: args.checkin_ts,
        checkout_ts: args.checkout_ts,
        created_ts: now,
        confirm_deadline_ts,
        release_after_ts,
        quote_hash: args.quote_hash,
        option_index: args.option_index,
        // validate_tiers bounds the length to 1..=MAX_TIERS, so this cannot truncate
        tier_count: args.tiers.len() as u8,
        tiers,
        status: BookingStatus::Pending as u8,
        refund_amount: 0,
        hotel_amount: 0,
        fee_amount: 0,
        closed_ts: 0,
        bump: ctx.bumps.booking,
        vault_bump: ctx.bumps.vault,
    });

    let booking = &accounts.booking;
    emit!(BookingCreated {
        booking: booking_key,
        booking_id: booking.booking_id,
        hotel: booking.hotel,
        hotel_authority: booking.hotel_authority,
        guest: booking.guest,
        amount: booking.amount,
        checkin_ts: booking.checkin_ts,
        checkout_ts: booking.checkout_ts,
        option_index: booking.option_index,
        quote_hash: booking.quote_hash,
        fee_bps: booking.fee_bps,
    });
    Ok(())
}
