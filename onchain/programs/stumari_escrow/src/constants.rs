use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const HOTEL_SEED: &[u8] = b"hotel";
#[constant]
pub const BOOKING_SEED: &[u8] = b"booking";
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

/// Not an IDL constant: the IDL has no usize type (the Booking.tiers array length carries it).
pub const MAX_TIERS: usize = 8;
#[constant]
pub const BPS_DENOM: u16 = 10_000;
#[constant]
pub const MAX_FEE_BPS: u16 = 1_000;
/// Lower bound for `confirm_window_secs` and `release_delay_secs`.
#[constant]
pub const MIN_WINDOW_SECS: u32 = 60;
