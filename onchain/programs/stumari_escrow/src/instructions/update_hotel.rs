use anchor_lang::prelude::*;

use crate::{
    constants::{CONFIG_SEED, HOTEL_SEED},
    error::EscrowError,
    state::{Config, Hotel},
};

#[derive(Accounts)]
pub struct UpdateHotel<'info> {
    #[account(address = config.admin @ EscrowError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [HOTEL_SEED, hotel.hotel_id.as_ref()], bump = hotel.bump)]
    pub hotel: Account<'info, Hotel>,
}

/// A new `authority` affects only bookings created afterwards (each booking snapshots it).
pub fn handle_update_hotel(
    ctx: Context<UpdateHotel>,
    authority: Option<Pubkey>,
    active: Option<bool>,
) -> Result<()> {
    let hotel = &mut ctx.accounts.hotel;
    if let Some(authority) = authority {
        hotel.authority = authority;
    }
    if let Some(active) = active {
        hotel.active = active;
    }
    Ok(())
}
