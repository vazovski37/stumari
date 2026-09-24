use anchor_lang::prelude::*;

use crate::{
    constants::{BOOKING_SEED, MAX_FEE_BPS, MAX_TIERS, MIN_WINDOW_SECS},
    error::EscrowError,
    logic::Split,
};

#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Arbiter stub: registers hotels, resolves disputes, voids pending bookings, updates config.
    pub admin: Pubkey,
    /// Must co-sign `create_booking`; may confirm; pays booking and vault rent.
    pub quote_signer: Pubkey,
    /// The one accepted stablecoin (immutable).
    pub mint: Pubkey,
    /// Token account (mint = `mint`) receiving fees and swept vault excess.
    pub treasury: Pubkey,
    /// Applies to new bookings only (snapshotted on each booking).
    pub fee_bps: u16,
    pub confirm_window_secs: u32,
    pub release_delay_secs: u32,
    /// Blocks `create_booking` only; exits always work.
    pub paused: bool,
    pub bump: u8,
}

impl Config {
    pub fn validate(&self) -> Result<()> {
        require!(self.fee_bps <= MAX_FEE_BPS, EscrowError::FeeTooHigh);
        require!(
            self.confirm_window_secs >= MIN_WINDOW_SECS
                && self.release_delay_secs >= MIN_WINDOW_SECS,
            EscrowError::InvalidTimes
        );
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Hotel {
    pub hotel_id: [u8; 16],
    /// Payout wallet; new bookings snapshot it as `hotel_authority`.
    pub authority: Pubkey,
    pub active: bool,
    pub bump: u8,
}

#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Default, PartialEq, Eq, Debug,
)]
pub struct Tier {
    pub secs_before: u32,
    pub refund_bps: u16,
}

/// Never closed: the durable public outcome of a booking.
#[account]
#[derive(InitSpace)]
pub struct Booking {
    pub booking_id: [u8; 16],
    pub hotel: Pubkey,
    /// Snapshot of `hotel.authority` at creation; payouts go to its ATA.
    pub hotel_authority: Pubkey,
    /// Token authority that paid; refunds go to its ATA.
    pub guest: Pubkey,
    /// Quote signer at creation; receives the vault rent on close.
    pub rent_payer: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    /// Snapshot of `config.fee_bps` at creation.
    pub fee_bps: u16,
    pub checkin_ts: i64,
    pub checkout_ts: i64,
    pub created_ts: i64,
    pub confirm_deadline_ts: i64,
    pub release_after_ts: i64,
    pub quote_hash: [u8; 32],
    pub option_index: u8,
    pub tier_count: u8,
    pub tiers: [Tier; MAX_TIERS],
    /// `BookingStatus` as u8.
    pub status: u8,
    pub refund_amount: u64,
    pub hotel_amount: u64,
    pub fee_amount: u64,
    /// 0 while open.
    pub closed_ts: i64,
    pub bump: u8,
    pub vault_bump: u8,
}

impl Booking {
    pub fn active_tiers(&self) -> &[Tier] {
        &self.tiers[..self.tier_count as usize]
    }

    pub fn has_status(&self, status: BookingStatus) -> bool {
        self.status == status as u8
    }

    pub fn signer_seeds(&self) -> [&[u8]; 3] {
        [
            BOOKING_SEED,
            self.booking_id.as_ref(),
            std::slice::from_ref(&self.bump),
        ]
    }

    /// Terminal transition: the stored amounts are the booking's public outcome.
    pub fn record_exit(&mut self, status: BookingStatus, split: &Split, now: i64) {
        self.status = status as u8;
        self.refund_amount = split.refund;
        self.hotel_amount = split.hotel_net;
        self.fee_amount = split.fee;
        self.closed_ts = now;
    }
}

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum BookingStatus {
    Pending = 0,
    Confirmed = 1,
    Cancelled = 2,
    Released = 3,
    Disputed = 4,
    Resolved = 5,
    Voided = 6,
}
