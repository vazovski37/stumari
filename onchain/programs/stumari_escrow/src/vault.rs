//! Moving escrowed tokens out of a booking vault, signed by the Booking PDA.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, TransferChecked};

use crate::state::Booking;

/// Accounts shared by every terminal transition (cancel, release, resolve, void).
pub struct VaultExit<'a, 'info> {
    pub booking: &'a Account<'info, Booking>,
    pub vault: &'a mut Account<'info, TokenAccount>,
    pub mint: &'a Account<'info, Mint>,
    pub treasury: AccountInfo<'info>,
    pub rent_payer: AccountInfo<'info>,
}

impl<'info> VaultExit<'_, 'info> {
    /// Pays each `(recipient, amount)` (zero amounts skipped), sweeps any tokens donated to the
    /// vault to the treasury so the close cannot be blocked, then closes the vault with its rent
    /// going to `booking.rent_payer`. Returns the swept excess.
    pub fn settle(self, payouts: &[(AccountInfo<'info>, u64)]) -> Result<u64> {
        for (to, amount) in payouts {
            self.transfer(to.clone(), *amount)?;
        }
        self.vault.reload()?;
        let excess = self.vault.amount;
        self.transfer(self.treasury.clone(), excess)?;

        let seeds = self.booking.signer_seeds();
        token::close_account(CpiContext::new_with_signer(
            Token::id(),
            CloseAccount {
                account: self.vault.to_account_info(),
                destination: self.rent_payer.clone(),
                authority: self.booking.to_account_info(),
            },
            &[&seeds[..]],
        ))?;
        Ok(excess)
    }

    fn transfer(&self, to: AccountInfo<'info>, amount: u64) -> Result<()> {
        if amount == 0 {
            return Ok(());
        }
        let seeds = self.booking.signer_seeds();
        token::transfer_checked(
            CpiContext::new_with_signer(
                Token::id(),
                TransferChecked {
                    from: self.vault.to_account_info(),
                    mint: self.mint.to_account_info(),
                    to,
                    authority: self.booking.to_account_info(),
                },
                &[&seeds[..]],
            ),
            amount,
            self.mint.decimals,
        )
    }
}
