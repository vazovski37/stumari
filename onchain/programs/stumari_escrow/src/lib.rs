//! Stumari escrow: each booking's USDC sits in a PDA vault that can only pay the booking's
//! snapshotted guest, hotel authority or treasury, following the signed refund schedule.
//! Spec: docs/architecture/escrow-program.md.

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod logic;
pub mod state;
mod vault;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf");

#[program]
pub mod stumari_escrow {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        quote_signer: Pubkey,
        fee_bps: u16,
        confirm_window_secs: u32,
        release_delay_secs: u32,
    ) -> Result<()> {
        handle_initialize_config(
            ctx,
            quote_signer,
            fee_bps,
            confirm_window_secs,
            release_delay_secs,
        )
    }

    pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
        handle_update_config(ctx, args)
    }

    pub fn register_hotel(
        ctx: Context<RegisterHotel>,
        hotel_id: [u8; 16],
        authority: Pubkey,
    ) -> Result<()> {
        handle_register_hotel(ctx, hotel_id, authority)
    }

    pub fn update_hotel(
        ctx: Context<UpdateHotel>,
        authority: Option<Pubkey>,
        active: Option<bool>,
    ) -> Result<()> {
        handle_update_hotel(ctx, authority, active)
    }

    pub fn create_booking(ctx: Context<CreateBooking>, args: CreateBookingArgs) -> Result<()> {
        handle_create_booking(ctx, args)
    }

    pub fn confirm_booking(ctx: Context<ConfirmBooking>) -> Result<()> {
        handle_confirm_booking(ctx)
    }

    pub fn cancel_booking(ctx: Context<CancelBooking>, min_refund: u64) -> Result<()> {
        handle_cancel_booking(ctx, min_refund)
    }

    pub fn release(ctx: Context<Release>) -> Result<()> {
        handle_release(ctx)
    }

    pub fn flag_dispute(ctx: Context<FlagDispute>) -> Result<()> {
        handle_flag_dispute(ctx)
    }

    pub fn resolve_dispute(ctx: Context<ResolveDispute>, guest_bps: u16) -> Result<()> {
        handle_resolve_dispute(ctx, guest_bps)
    }

    pub fn void_booking(ctx: Context<VoidBooking>) -> Result<()> {
        handle_void_booking(ctx)
    }
}
