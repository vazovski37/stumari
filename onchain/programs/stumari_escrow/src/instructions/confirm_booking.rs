use anchor_lang::prelude::*;

use crate::{
    constants::{BOOKING_SEED, CONFIG_SEED},
    error::EscrowError,
    events::BookingConfirmed,
    state::{Booking, BookingStatus, Config, Hotel},
};

#[derive(Accounts)]
pub struct ConfirmBooking<'info> {
    /// The quote signer (after inventory write-back) or the hotel's current authority.
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(address = booking.hotel @ EscrowError::Unauthorized)]
    pub hotel: Account<'info, Hotel>,
    #[account(mut, seeds = [BOOKING_SEED, booking.booking_id.as_ref()], bump = booking.bump)]
    pub booking: Account<'info, Booking>,
}

pub fn handle_confirm_booking(ctx: Context<ConfirmBooking>) -> Result<()> {
    let by = ctx.accounts.authority.key();
    require!(
        by == ctx.accounts.config.quote_signer || by == ctx.accounts.hotel.authority,
        EscrowError::Unauthorized
    );
    let booking = &mut ctx.accounts.booking;
    require!(
        booking.has_status(BookingStatus::Pending),
        EscrowError::InvalidStatus
    );
    let now = Clock::get()?.unix_timestamp;
    require!(
        now < booking.confirm_deadline_ts,
        EscrowError::ConfirmWindowClosed
    );

    booking.status = BookingStatus::Confirmed as u8;
    emit!(BookingConfirmed {
        booking: booking.key(),
        by,
    });
    Ok(())
}
