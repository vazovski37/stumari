//! LiteSVM integration tests for `stumari_escrow` (docs/architecture/escrow-program.md, test
//! plan). Built as one test binary; the program `.so` comes from `anchor build`.

// `litesvm::types::TransactionResult` has a large Err variant; boxing it would only add noise.
#![allow(clippy::result_large_err)]

mod attacks;
mod cancel;
mod config;
mod dispute_void;
mod harness;
mod lifecycle;
