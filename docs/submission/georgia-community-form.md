# Georgian Colosseum community form (Tally)

The Georgian Colosseum group asked every participant from Georgia to fill in [this Tally form](https://tally.so/r/GxGPve) by the end of the week of 2026-09-27. They use it to see who is building from Georgia and to offer help (project, team, mentoring, Build Station). Filled in by Giorgi (Vazovski) on 2026-09-27. Contact details are in the form, not here (this repo will be public).

Keep these answers consistent with the Colosseum submission ([status.md](status.md)), the landing page and [vision-and-positioning.md](../product/vision-and-positioning.md).

## Answers as submitted

| # | Question | Answer |
|---|---|---|
| 1 | Full name | Giorgi Papidze |
| 2 | Telegram | (in the form) |
| 3 | Registered on Colosseum | Yes |
| 4 | Project name | Stumari |
| 7 | Chain | Solana |
| 9 | Teammates | Yes |
| 10 | Full-time if you win | Yes |
| 11 | Stage | C. Already started building / have a prototype |
| 12 | Planned materials | Pitch video (≤ 2 min), technical demo video (2–3 min), GitHub repo, pitch deck, live product / deployed demo link |
| 14 | Attend Build Station (Oct 5–13) | Yes |
| 15 | Most valuable support | Pitch and presentation coaching; understanding Colosseum judging criteria; connections to mentors or investors; accountability and workspace |
| 16 | Colosseum profile | https://colosseum.com/arena/profiles/Vazovski |

### 5. Describe your project in detail

> Stumari is a stablecoin checkout for merchants with cancellable inventory, starting with independent hotels. Each hotel gets a seller agent that returns a signed quote: a room price plus a deposit-and-refund schedule set per booking by a cancellation-risk model, within the hotel's policy. Payment settles into a Solana USDC escrow that enforces those terms, so the hotel keeps the risk premium instead of a third-party insurer. Launching in Tbilisi, Georgia, where Stripe has never operated.

### 6. Who is the target user, and what specific problem are you solving?

> Independent hotels and guesthouses in Tbilisi, Georgia and the guests who can't pay them by card.
>
> The pain:
> 1. No working payment rail. Stripe has never supported Georgia, and Russian-issued Visa/Mastercard cards don't work abroad. Russia sent 1,579,764 visitors to Georgia in 2025, so many of these guests already pay small hotels in USDT, straight into the owner's personal wallet, with no receipt and no refund rule.
> 2. One cancellation policy for every guest. 27% of ordinary bookings cancel (37% including no-shows and group blocks). A family booking six months ahead gets the same terms as a speculative booking two days out.
> 3. OTA commissions of 15–25%, often paid out weeks later.
>
> Stumari is a stablecoin checkout for these hotels. For each request, a cancellation model tuned to the hotel's own policy prices a menu of contracts (Flexible / Standard / Non-refundable). The guest pays USDC into an escrow that enforces the chosen refund schedule automatically. The hotel is paid 24 hours after check-in.

### 8. Why Solana specifically?

> 1. The guest needs only USDC. Solana lets a separate account pay transaction fees, so we pay every fee and the guest just signs one USDC transfer. No extra paymaster setup is needed, as it would be on EVM chains.
> 2. One escrow per booking is affordable. Each booking gets its own on-chain escrow account that enforces its refund schedule. Fees are a fraction of a cent per transaction, so creating, confirming, cancelling or releasing a booking costs almost nothing, even for a 60 USD guesthouse night.
> 3. Checkout speed. USDC settles in under a second, so the guest sees their booking confirmed right away.
> 4. Native USDC and wallets guests already use. Circle issues USDC natively on Solana. In Phantom, a guest holding USDT can swap to USDC in one step before paying.
> 5. Composability for agents. Our quote signing, Wallet Standard signing and MCP server let an AI agent search, get a signed quote and pay the same escrow, with terms a machine can verify instead of a policy page.

### 13. Biggest blocker right now

> i think mentoring/ advising from your side will be most valuable thing which we might get also to help us gather more clients.

### 17. Anything else

> We're a two-person team in Tbilisi building Stumari (სტუმარი, "guest"): a stablecoin checkout for independent hotels and guesthouses in Georgia, starting in Tbilisi.
>
> Where we are: the MVP works end to end on a Solana test chain:
> - the hotel's cancellation model prices a menu of contracts for each request;
> - the guest pays USDC with no SOL needed, and a per-booking escrow enforces the refund schedule;
> - the hotel has a dashboard with calendar sync;
> - an MCP server lets AI agents book too.
>
> We're deploying to devnet now and are in talks with our first Tbilisi hotel for a pilot.
>
> Where you could help:
> 1. Intros to Tbilisi hotel and guesthouse owners, especially ones whose guests ask to pay in crypto (our first 10 pilot hotels pay 0% fees until the end of 2026).
> 2. Contacts at local PMS / channel managers (OtelMS, Exely), so our bookings sync straight into hotels' systems.
> 3. Licensed VASPs / off-ramp providers in Georgia that can convert USDC to GEL for hotels.
> 4. Anyone who can advise on stablecoin payments for hospitality under Georgian regulation (National Bank VASP rules).
>
> Happy to demo for anyone in the Georgian Colosseum group.

## What this commits us to

- **Build Station, Oct 5–13:** we said we'll attend. Final submission opens Oct 6 and closes Oct 12.
- **Submission materials promised:** both videos, GitHub repo, **pitch deck** (does not exist yet — add to [status.md](status.md)), and a **live demo link** (needs the devnet deployment and Vercel: fund the operator wallet, create Vercel/Turso/Helius accounts).

## Review (2026-09-27): corrections to send

Two reviewers checked the answers against the repo and as a judge would read them. Must-fix items make a claim that is false today:

| Q | Problem | Fix |
|---|---|---|
| 5 | "deposit-and-refund schedule set per booking by the model": partial deposits are cut (full prepay, ADR-0002), and the model *prices* three fixed contracts rather than setting a schedule (ADR-0003) | corrected text below |
| 8.3 | "the guest sees their booking confirmed right away": every booking starts Pending and is confirmed after the calendar check (by hand within 2 h in manual mode, the mode for the Mews prospect) | corrected text below |
| 17 | "works on a Solana test chain" and "deploying to devnet now": it runs on a local chain; devnet waits for the funded operator wallet. "The hotel's cancellation model" implies per-hotel training (it is one prior on public data). The pilot hotel is not signed | corrected text below |
| 13 | names no blocker | corrected text below |
| 2 | a t.me/+phone link exposes the phone number and may not open a chat; the form asks for an @handle | give an @username |

Should-fix: Q6 cites the 27% figure as if it were Tbilisi data (say "in a public dataset of 119,390 hotel bookings") and repeats Q5; Q8.1 "no paymaster as on EVM" is challengeable (EIP-3009) — say the fee payer is a native field; Q8.2 omit "almost nothing" and mention the ~0.003 SOL booking rent we pay; Q8.5 agents sign via MCP, not Wallet Standard; Q15 add "Idea validation and feedback"; Q17 say "0% Stumari fee until 31 Dec 2026, then 1.5%", name the teammate and add Mews to the PMS list.

The corrected texts are in the chat reply of 2026-09-27 and mirrored here once sent.
