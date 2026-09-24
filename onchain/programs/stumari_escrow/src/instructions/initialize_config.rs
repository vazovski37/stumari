use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use crate::{constants::CONFIG_SEED, error::EscrowError, program::StumariEscrow, state::Config};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(constraint = treasury.mint == mint.key() @ EscrowError::InvalidTreasury)]
    pub treasury: Account<'info, TokenAccount>,
    #[account(
        constraint = program.programdata_address()? == Some(program_data.key()) @ EscrowError::Unauthorized
    )]
    pub program: Program<'info, StumariEscrow>,
    /// Only the program's upgrade authority may initialize (no front-running).
    #[account(
        constraint = program_data.upgrade_authority_address == Some(admin.key()) @ EscrowError::Unauthorized
    )]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config(
    ctx: Context<InitializeConfig>,
    quote_signer: Pubkey,
    fee_bps: u16,
    confirm_window_secs: u32,
    release_delay_secs: u32,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.set_inner(Config {
        admin: ctx.accounts.admin.key(),
        quote_signer,
        mint: ctx.accounts.mint.key(),
        treasury: ctx.accounts.treasury.key(),
        fee_bps,
        confirm_window_secs,
        release_delay_secs,
        paused: false,
        bump: ctx.bumps.config,
    });
    config.validate()
}
