use anchor_lang::prelude::*;

#[error_code]
#[derive(PartialEq, Eq)]
pub enum EscrowError {
    #[msg("New bookings are paused")]
    Paused,
    #[msg("Hotel is not active")]
    HotelInactive,
    #[msg("Quote has expired")]
    QuoteExpired,
    #[msg("Invalid timestamps or window lengths")]
    InvalidTimes,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Invalid refund tiers")]
    InvalidTiers,
    #[msg("Booking is not in a status that allows this action")]
    InvalidStatus,
    #[msg("Cancellation is only possible before check-in")]
    TooLateToCancel,
    #[msg("Refund is below the guest's minimum")]
    RefundBelowMinimum,
    #[msg("Booking is not releasable yet")]
    NotReleasable,
    #[msg("Disputes are only possible between check-in and release")]
    DisputeWindowClosed,
    #[msg("Confirmation window has closed")]
    ConfirmWindowClosed,
    #[msg("Only the admin can void before the confirmation deadline")]
    VoidTooEarly,
    #[msg("Signer or account is not authorized for this action")]
    Unauthorized,
    #[msg("Basis points must not exceed 10000")]
    InvalidBps,
    #[msg("Fee exceeds the maximum")]
    FeeTooHigh,
    #[msg("Mint does not match")]
    InvalidMint,
    #[msg("Treasury does not match")]
    InvalidTreasury,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
