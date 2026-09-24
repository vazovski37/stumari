use anchor_lang::prelude::*;

#[event]
pub struct BookingCreated {
    pub booking: Pubkey,
    pub booking_id: [u8; 16],
    pub hotel: Pubkey,
    pub hotel_authority: Pubkey,
    pub guest: Pubkey,
    pub amount: u64,
    pub checkin_ts: i64,
    pub checkout_ts: i64,
    pub option_index: u8,
    pub quote_hash: [u8; 32],
    pub fee_bps: u16,
}

#[event]
pub struct BookingConfirmed {
    pub booking: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct BookingCancelled {
    pub booking: Pubkey,
    pub secs_before: i64,
    pub refund_bps: u16,
    pub refund: u64,
    pub hotel_amount: u64,
    pub fee: u64,
    pub excess: u64,
}

#[event]
pub struct BookingReleased {
    pub booking: Pubkey,
    pub hotel_authority: Pubkey,
    pub hotel_amount: u64,
    pub fee: u64,
    pub excess: u64,
}

#[event]
pub struct BookingDisputed {
    pub booking: Pubkey,
}

#[event]
pub struct DisputeResolved {
    pub booking: Pubkey,
    pub guest_bps: u16,
    pub refund: u64,
    pub hotel_amount: u64,
    pub fee: u64,
    pub excess: u64,
}

#[event]
pub struct BookingVoided {
    pub booking: Pubkey,
    pub by_admin: bool,
    pub refund: u64,
    pub excess: u64,
}
