# Objection handling

> **DRAFT — founders confirm before sending.** Answer honestly and briefly. Never promise anything outside [offer.md](offer.md) ([ADR-0013](../decisions/README.md)). If you don't know, say "I'll check and get back to you," and log it in [leads.csv](leads.csv).

### "Is crypto even legal here? Isn't it risky?"
> "We can't give legal or tax advice. Please check with your accountant how to record USDC income. What we can explain is what you'd be receiving. USDC is a dollar stablecoin: one USDC is designed to be worth one US dollar, and it is issued by Circle. It is not a volatile coin like Bitcoin. Many of your guests already pay small hotels in USDT. Stumari makes that a proper booking with a receipt and written terms."

Do not say it is legal, compliant or tax-free.

### "I need lari, not USDC."
> "Stumari pays out in USDC only. To get lari you'd use a licensed exchange or conversion provider. We'll help you find one, but choosing one and converting is your decision; this isn't financial advice."

Do not promise GEL payouts, rates or a specific provider.

### "What if the guest cancels?"
> "The guest chose a contract before paying, for example 'full refund until 7 days before, 50% until 3 days, then none'. If they cancel, the escrow applies exactly that rule. The guest gets their refund and you get the rest in the same transaction, automatically. Neither of us has to approve anything, and the program's rules don't let either of us change it afterwards."

### "What about double bookings with Booking.com?"
> "We read your Booking.com and Airbnb calendars, and you paste our calendar feed back into them. Calendars only sync every so often, so each new booking starts as *pending*. We re-check your calendar right after payment and confirm the booking only if the dates are free. If there's a clash, you can move the other guest and confirm it yourself. If nobody confirms within 2 hours, the guest gets a full refund automatically."

Be honest about the remaining gap. After we confirm, Booking.com or Airbnb only sees the booking when it next reads our feed, on its own schedule and often hourly, so it could still sell the same night in between. That is the same risk the hotel already has between Booking.com and Airbnb today.

### "What if Stumari disappears?"
> "The money never sits with us. Each booking's USDC sits in its own escrow account on Solana. The program can only pay three places: the guest's wallet, your wallet (fixed when the guest pays), or Stumari's fee, which is capped and written into the booking (0% during the pilot). The payout to you doesn't need us: after check-in plus 24 hours, anyone can trigger it, including you. Two honest limits: during the pilot we can still upgrade the program, and if a guest opens a dispute, our arbiter decides it. Before real money, both move to a multisig, or the program is frozen."

Always say both limits ([security.md](../architecture/security.md#honest-limits-of-the-trust-property-say-these-out-loud)); never say "no Stumari key can redirect funds" without them:
- **Upgradeable program.** Stumari holds the program's upgrade authority during the pilot, and whoever holds it could replace the program. Before real money, the upgrade authority moves to a multisig or the program is frozen.
- **Disputes depend on our arbiter key.** A disputed booking can only be settled by Stumari's single admin key (a disclosed stub; the roadmap is a multisig of bonded arbiters). If Stumari disappeared, disputed funds would stay locked. Every other booking still releases to you or refunds the guest without us, and a pending booking that nobody confirms refunds the guest in full.

### "What will the fees be later?"
> "0% on every booking until 31 December 2026. After that, a flat 1.5% of what you receive. The fee is written into each booking on-chain before the guest pays, so a booking made at 0% stays at 0% even if our fee changes later. If you don't like the terms, leave anytime; there's no contract lock-in."

### "Why not just use Booking.com?"
> "Keep it. We're not trying to replace it and we don't bring you guests. Stumari is an extra channel for guests who can't pay by card, or who want to pay in stablecoins. You send them your link instead of your personal wallet address. We also make you bookable by AI agents."

If they ask about commissions: OTAs charge 15–25% base, and 25–30% with visibility boosters. Don't claim Stumari will replace that revenue.

### "I don't have a crypto wallet."
> "No problem. On the setup call we'll help you install Phantom on your phone. It takes a few minutes. You write down the recovery phrase on paper and keep it safe. We will never ask for it, and nobody from Stumari ever should."

Never type or photograph the hotel's recovery phrase. The payout wallet must be self-custody, never an exchange deposit address: the same wallet signs in to the dashboard.

### "My guests pay in USDT, not USDC."
> "Stumari accepts USDC on Solana only. A guest holding USDT can swap it to USDC inside Phantom in one step before paying. For you it's the same dollar amount, and you get a clear booking instead of a transfer to your personal wallet."

Do not promise USDT, other chains or other tokens.

### "I have several identical rooms (one room type, many units). Will iCal work?"
> "Let's check your extranet together before we promise anything. Booking.com's calendar sync is built for listings that are one room each. If each of your rooms is its own listing, iCal works. If not, you can block dates in our dashboard by hand, and we'll tell you honestly whether that's workable for you."

Record `ical_single_unit` in the lead notes. See [inventory-ical.md](../architecture/inventory-ical.md).

### "Can I take real bookings today?"
> "Right now you can try everything with test money. Real USDC bookings start after our security review. We'll tell you the exact date as soon as it's set."

Don't give a date that the founders have not confirmed. Real bookings are subject to the pilot limit of 1,500 USDC per booking.

### "How do you set the prices? Will I earn less?"
> "You choose which contracts to offer and the limits on how far prices can move. Your current cancellation policy always costs exactly your normal rate. For each request the model estimates how likely this guest is to cancel, and when. It then prices the other contracts to target the same expected revenue from this guest as under your current policy. It's a target, not a guarantee. On the setup call we also ask how often you sell out, because that decides how likely a cancelled night is to be resold. Today the model has learned from a public dataset of two hotels in Portugal. Retraining it on each hotel's own bookings is on our roadmap and isn't part of the pilot yet."
