use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::{constants::CONFIG_SEED, error::EscrowError, state::Config};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug)]
pub struct UpdateConfigArgs {
    pub admin: Option<Pubkey>,
    pub quote_signer: Option<Pubkey>,
    pub fee_bps: Option<u16>,
    pub confirm_window_secs: Option<u32>,
    pub release_delay_secs: Option<u32>,
    pub paused: Option<bool>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(address = config.admin @ EscrowError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// When present, becomes the new treasury (its mint must be `config.mint`).
    #[account(constraint = treasury.mint == config.mint @ EscrowError::InvalidTreasury)]
    pub treasury: Option<Account<'info, TokenAccount>>,
}

/// Changes apply to bookings created afterwards only: each booking snapshots what it needs.
pub fn handle_update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
    let config = &mut ctx.accounts.config;
    if let Some(admin) = args.admin {
        config.admin = admin;
    }
    if let Some(quote_signer) = args.quote_signer {
        config.quote_signer = quote_signer;
    }
    if let Some(fee_bps) = args.fee_bps {
        config.fee_bps = fee_bps;
    }
    if let Some(secs) = args.confirm_window_secs {
        config.confirm_window_secs = secs;
    }
    if let Some(secs) = args.release_delay_secs {
        config.release_delay_secs = secs;
    }
    if let Some(paused) = args.paused {
        config.paused = paused;
    }
    if let Some(treasury) = &ctx.accounts.treasury {
        config.treasury = treasury.key();
    }
    config.validate()
}
