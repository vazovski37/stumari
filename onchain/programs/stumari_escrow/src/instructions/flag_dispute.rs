use anchor_lang::prelude::*;

use crate::{
    constants::BOOKING_SEED,
    error::EscrowError,
    events::BookingDisputed,
    state::{Booking, BookingStatus},
};

#[derive(Accounts)]
pub struct FlagDispute<'info> {
    #[account(address = booking.guest @ EscrowError::Unauthorized)]
    pub guest: Signer<'info>,
    #[account(mut, seeds = [BOOKING_SEED, booking.booking_id.as_ref()], bump = booking.bump)]
    pub booking: Account<'info, Booking>,
}

pub fn handle_flag_dispute(ctx: Context<FlagDispute>) -> Result<()> {
    let booking = &mut ctx.accounts.booking;
    require!(
        booking.has_status(BookingStatus::Confirmed),
        EscrowError::InvalidStatus
    );
    let now = Clock::get()?.unix_timestamp;
    require!(
        booking.checkin_ts <= now && now < booking.release_after_ts,
        EscrowError::DisputeWindowClosed
    );
    booking.status = BookingStatus::Disputed as u8;
    emit!(BookingDisputed {
        booking: booking.key(),
    });
    Ok(())
}
