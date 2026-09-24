use anchor_lang::prelude::*;

use crate::{
    constants::{CONFIG_SEED, HOTEL_SEED},
    error::EscrowError,
    state::{Config, Hotel},
};

#[derive(Accounts)]
#[instruction(hotel_id: [u8; 16])]
pub struct RegisterHotel<'info> {
    #[account(mut, address = config.admin @ EscrowError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        space = 8 + Hotel::INIT_SPACE,
        seeds = [HOTEL_SEED, hotel_id.as_ref()],
        bump
    )]
    pub hotel: Account<'info, Hotel>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_hotel(
    ctx: Context<RegisterHotel>,
    hotel_id: [u8; 16],
    authority: Pubkey,
) -> Result<()> {
    ctx.accounts.hotel.set_inner(Hotel {
        hotel_id,
        authority,
        active: true,
        bump: ctx.bumps.hotel,
    });
    Ok(())
}
