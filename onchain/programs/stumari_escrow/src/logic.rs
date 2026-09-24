//! Pure refund/payout math and tier validation (no accounts). Shared contract with
//! `packages/core` through `spec/vectors/refund.json`.

use crate::{
    constants::{BPS_DENOM, MAX_TIERS},
    error::EscrowError,
    state::Tier,
};

/// How an escrowed amount is divided on exit. Invariant: `refund + hotel_net + fee == amount`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Split {
    pub refund: u64,
    pub hotel_net: u64,
    pub fee: u64,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct CancelSplit {
    pub secs_before: i64,
    pub refund_bps: u16,
    pub split: Split,
}

/// Tiers are sorted by `secs_before` strictly descending, end with `secs_before == 0`,
/// hold 1..=MAX_TIERS entries, and each `refund_bps <= BPS_DENOM`.
pub fn validate_tiers(tiers: &[Tier]) -> Result<(), EscrowError> {
    let last = tiers.last().ok_or(EscrowError::InvalidTiers)?;
    let descending = tiers
        .windows(2)
        .all(|w| w[0].secs_before > w[1].secs_before);
    let bps_ok = tiers.iter().all(|t| t.refund_bps <= BPS_DENOM);
    if tiers.len() > MAX_TIERS || last.secs_before != 0 || !descending || !bps_ok {
        return Err(EscrowError::InvalidTiers);
    }
    Ok(())
}

/// First tier whose threshold the remaining time reaches. Compared as i64 so a
/// `secs_before` beyond the u32 range still matches the first (largest) tier.
pub fn refund_bps_for(tiers: &[Tier], secs_before: i64) -> Result<u16, EscrowError> {
    tiers
        .iter()
        .find(|t| secs_before >= i64::from(t.secs_before))
        .map(|t| t.refund_bps)
        .ok_or(EscrowError::InvalidTiers)
}

/// A pending (unconfirmed) booking always refunds 100%; a confirmed one follows its tiers.
pub fn split_cancel(
    amount: u64,
    fee_bps: u16,
    tiers: &[Tier],
    pending: bool,
    checkin_ts: i64,
    now: i64,
) -> Result<CancelSplit, EscrowError> {
    if now >= checkin_ts {
        return Err(EscrowError::TooLateToCancel);
    }
    let secs_before = checkin_ts
        .checked_sub(now)
        .ok_or(EscrowError::MathOverflow)?;
    let refund_bps = if pending {
        BPS_DENOM
    } else {
        refund_bps_for(tiers, secs_before)?
    };
    Ok(CancelSplit {
        secs_before,
        refund_bps,
        split: split(amount, refund_bps, fee_bps)?,
    })
}

pub fn split_release(amount: u64, fee_bps: u16) -> Result<Split, EscrowError> {
    split(amount, 0, fee_bps)
}

pub fn split_resolve(amount: u64, fee_bps: u16, guest_bps: u16) -> Result<Split, EscrowError> {
    split(amount, guest_bps, fee_bps)
}

/// refund = amount * refund_bps / 10000; fee = (amount - refund) * fee_bps / 10000.
/// Floor division everywhere, so rounding dust goes to the hotel.
fn split(amount: u64, refund_bps: u16, fee_bps: u16) -> Result<Split, EscrowError> {
    if refund_bps > BPS_DENOM || fee_bps > BPS_DENOM {
        return Err(EscrowError::InvalidBps);
    }
    let refund = mul_bps(amount, refund_bps)?;
    let hotel_gross = amount
        .checked_sub(refund)
        .ok_or(EscrowError::MathOverflow)?;
    let fee = mul_bps(hotel_gross, fee_bps)?;
    let hotel_net = hotel_gross
        .checked_sub(fee)
        .ok_or(EscrowError::MathOverflow)?;
    Ok(Split {
        refund,
        hotel_net,
        fee,
    })
}

fn mul_bps(value: u64, bps: u16) -> Result<u64, EscrowError> {
    let scaled = u128::from(value)
        .checked_mul(u128::from(bps))
        .and_then(|v| v.checked_div(u128::from(BPS_DENOM)))
        .ok_or(EscrowError::MathOverflow)?;
    u64::try_from(scaled).map_err(|_| EscrowError::MathOverflow)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use std::collections::HashMap;

    const VECTORS: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../spec/vectors/refund.json"
    );

    #[derive(Deserialize)]
    struct Vectors {
        templates: HashMap<String, Vec<JsonTier>>,
        cancel: Vec<CancelCase>,
        release: Vec<ReleaseCase>,
        resolve: Vec<ResolveCase>,
        tiers_validation: TiersValidation,
    }

    #[derive(Deserialize, Clone, Copy)]
    struct JsonTier {
        secs_before: u32,
        refund_bps: u16,
    }

    #[derive(Deserialize)]
    struct CancelCase {
        name: String,
        status: String,
        template: String,
        amount: u64,
        fee_bps: u16,
        checkin_ts: i64,
        now: i64,
        expect: Expect,
    }

    #[derive(Deserialize)]
    struct ReleaseCase {
        name: String,
        amount: u64,
        fee_bps: u16,
        expect: Expect,
    }

    #[derive(Deserialize)]
    struct ResolveCase {
        name: String,
        amount: u64,
        fee_bps: u16,
        guest_bps: u16,
        expect: Expect,
    }

    #[derive(Deserialize)]
    struct Expect {
        error: Option<String>,
        secs_before: Option<i64>,
        refund_bps: Option<u16>,
        refund: Option<u64>,
        fee: Option<u64>,
        hotel_net: Option<u64>,
    }

    #[derive(Deserialize)]
    struct TiersValidation {
        valid: Vec<Vec<JsonTier>>,
        invalid: Vec<NamedTiers>,
    }

    #[derive(Deserialize)]
    struct NamedTiers {
        name: String,
        tiers: Vec<JsonTier>,
    }

    fn load() -> Vectors {
        let raw =
            std::fs::read_to_string(VECTORS).unwrap_or_else(|e| panic!("read {VECTORS}: {e}"));
        serde_json::from_str(&raw).expect("parse refund.json")
    }

    fn tiers(json: &[JsonTier]) -> Vec<Tier> {
        json.iter()
            .map(|t| Tier {
                secs_before: t.secs_before,
                refund_bps: t.refund_bps,
            })
            .collect()
    }

    fn assert_outcome(name: &str, amount: u64, got: Result<Split, EscrowError>, expect: &Expect) {
        match (&expect.error, got) {
            (Some(err), Err(e)) => assert_eq!(&e.name(), err, "{name}"),
            (Some(err), Ok(s)) => panic!("{name}: expected {err}, got {s:?}"),
            (None, Err(e)) => panic!("{name}: unexpected {e:?}"),
            (None, Ok(s)) => {
                let want = Split {
                    refund: expect.refund.expect("refund"),
                    hotel_net: expect.hotel_net.expect("hotel_net"),
                    fee: expect.fee.expect("fee"),
                };
                assert_eq!(s, want, "{name}");
                assert_eq!(s.refund + s.hotel_net + s.fee, amount, "{name}: invariant");
            }
        }
    }

    #[test]
    fn cancel_vectors() {
        let v = load();
        assert!(!v.cancel.is_empty());
        for c in &v.cancel {
            let template = tiers(&v.templates[&c.template]);
            validate_tiers(&template).unwrap();
            let pending = match c.status.as_str() {
                "pending" => true,
                "confirmed" => false,
                other => panic!("{}: unknown status {other}", c.name),
            };
            let got = split_cancel(c.amount, c.fee_bps, &template, pending, c.checkin_ts, c.now);
            if let Ok(cs) = &got {
                assert_eq!(Some(cs.secs_before), c.expect.secs_before, "{}", c.name);
                assert_eq!(Some(cs.refund_bps), c.expect.refund_bps, "{}", c.name);
            }
            assert_outcome(&c.name, c.amount, got.map(|cs| cs.split), &c.expect);
        }
    }

    #[test]
    fn release_vectors() {
        let v = load();
        assert!(!v.release.is_empty());
        for c in &v.release {
            let got = split_release(c.amount, c.fee_bps);
            assert_outcome(&c.name, c.amount, got, &c.expect);
        }
    }

    #[test]
    fn resolve_vectors() {
        let v = load();
        assert!(!v.resolve.is_empty());
        for c in &v.resolve {
            let got = split_resolve(c.amount, c.fee_bps, c.guest_bps);
            assert_outcome(&c.name, c.amount, got, &c.expect);
        }
    }

    #[test]
    fn tier_validation_vectors() {
        let v = load();
        assert!(!v.tiers_validation.valid.is_empty());
        for (i, t) in v.tiers_validation.valid.iter().enumerate() {
            assert_eq!(validate_tiers(&tiers(t)), Ok(()), "valid[{i}]");
        }
        assert!(!v.tiers_validation.invalid.is_empty());
        for c in &v.tiers_validation.invalid {
            assert_eq!(
                validate_tiers(&tiers(&c.tiers)),
                Err(EscrowError::InvalidTiers),
                "{}",
                c.name
            );
        }
    }

    #[test]
    fn refund_bps_compares_as_i64() {
        let t = [
            Tier {
                secs_before: u32::MAX,
                refund_bps: 10_000,
            },
            Tier {
                secs_before: 0,
                refund_bps: 0,
            },
        ];
        assert_eq!(refund_bps_for(&t, i64::from(u32::MAX) + 1), Ok(10_000));
        assert_eq!(refund_bps_for(&t, i64::from(u32::MAX) - 1), Ok(0));
        assert_eq!(refund_bps_for(&t, -1), Err(EscrowError::InvalidTiers));
    }

    #[test]
    fn split_invariant_holds_at_extremes() {
        for amount in [1, 7, 10_001, u64::MAX] {
            for bps in [0, 1, 3_333, 9_999, 10_000] {
                let s = split_resolve(amount, 1_000, bps).unwrap();
                let total = u128::from(s.refund) + u128::from(s.hotel_net) + u128::from(s.fee);
                assert_eq!(total, u128::from(amount));
            }
        }
        assert_eq!(split_release(1, 10_001), Err(EscrowError::InvalidBps));
    }
}
