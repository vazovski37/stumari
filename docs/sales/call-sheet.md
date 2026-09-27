# Call sheet — hotel calls from 2026-09-28

> One page to keep next to the phone. Full scripts: [KA](call-script.ka.md) · [RU](call-script.ru.md) · [EN](call-script.md). Pushback: [KA](objections.ka.md) · [RU](objections.ru.md) · [EN](objections.md). Everything you promise must be in [offer.md](offer.md). `{SITE}` = the landing domain once it is live.

## Goal of every call

**Book the free 20-minute setup/demo call** (the pilot setup call; if they only want to see it first, the site's shorter "15-minute demo" is fine). Nothing else. Don't onboard, don't argue, don't overexplain. Second-best outcome: they agree to receive the one-pager plus the apply link. Third-best: a referral.

Open before dialling: `{SITE}/ka` (or `/ru`), `{SITE}/model` (how prices are set), the demo screenshots in [e2e-report.md](../plan/e2e-report.md) ([e2e-screens/](../plan/e2e-screens/)), and `leads.csv`.

**Guest checkout is not open yet.** On the public site `/h/*`, `/b/*` and `/my` show "Checkout is not open yet" (devnet is not funded; real-money bookings start only after the security review). So **never send a demo checkout link**. If they want to see it during the call, screen-share the demo from the founder's laptop on the local chain: `pnpm --filter @stumari/scripts bootstrap --cluster localnet`, then `pnpm dev`, and open `http://localhost:3000/h/stumari-demo` ([runbook section 3](../plan/runbook.md#3-local-development)); or show the screenshots. Say it is test money on a test chain. Follow-up messages carry only the apply/demo link below.

> **Restore later:** once devnet has a public URL, add the live demo link (`{SITE}/h/stumari-demo`) back here and in the scripts' follow-ups.

## The 30-second pitch

Lead with their answer to "do guests ask to pay in crypto?".

**KA**
> „ახლა ეს სტუმრები პირად საფულეზე გიხდიან: ქვითარი არ არის, თანხის დაბრუნება ხელით ხდება. ამის ნაცვლად Stumari-ს ბმული გაუგზავნეთ. სტუმარი ირჩევს პირობას — მაგალითად, „მოქნილს" ან „დაბრუნების გარეშე" — და USDC-ით იხდის ესქროუში, სადაც თქვენი დაბრუნების წესებია ჩაწერილი. თუ გააუქმა, თანხა ავტომატურად ბრუნდება. თუ არა, ფული თქვენს საფულეში შემოდის შესვლიდან 24 საათში, თუ სტუმარი ამ დროში დავას არ გახსნის. Booking.com თქვენთან რჩება, სტუმრებს ჩვენ არ მოგიყვანთ. თბილისის პირველი 10 სასტუმროსთვის: 0% საკომისიო 2026 წლის ბოლომდე, მერე 1,5%."

**RU**
> «Сейчас такие гости платят вам на личный кошелёк: ни чека, ни нормального возврата — всё вручную. Вместо этого отправьте им ссылку Stumari. Гость выбирает условия — например, "Гибкий" или "Невозвратный" — и платит в USDC на эскроу, где записаны ваши правила возврата. Если он отменяет, деньги возвращаются автоматически. Если нет — они приходят вам на кошелёк через 24 часа после заезда, если только гость не откроет спор за это время. Booking.com остаётся, гостей мы вам не приводим. Для первых 10 отелей Тбилиси — 0% комиссии до конца 2026 года, потом 1,5%.»

**EN**
> "Today those guests pay a personal wallet: no receipt, refunds by hand. Send them your Stumari link instead. They pick a contract, say Flexible or Non-refundable, and pay USDC into an escrow holding your refund rules. Cancellations refund automatically. Otherwise the money reaches your wallet 24 hours after check-in, unless the guest opens a dispute in that window. You keep Booking.com; we don't bring you guests. First 10 Tbilisi hotels: 0% fee until the end of 2026, then 1.5%."

## Five qualifying questions

| # | Ask (short form) | Log in `leads.csv` | Good sign |
|---|---|---|---|
| 1 | Are you the owner or the manager? How many rooms? | `contact_name`, `role`, `rooms` | Owner/manager, roughly 5–40 rooms |
| 2 | Where do guests book you: Booking.com, Airbnb, direct? What commission do you pay? | `channels` (`;`-separated) | Sells on OTAs and direct |
| 3 | Do guests whose cards don't work ask to pay in USDT/crypto? How do you handle it now? | `accepts_crypto` = `no` / `sometimes` / `often` | `sometimes` or `often` |
| 4 | Which system runs your calendar: OtelMS, Exely, Mews, Cloudbeds, Beds24, or just the extranet? Is each room its own listing on Booking.com? | `channel_manager` (`none`, `otelms`, `exely`, `mews`, …); `ical_single_unit=yes/no` in `notes` | Any answer is fine; it decides iCal vs manual confirm |
| 5 | If a guest paid you in USDC to a wallet you control, would that work? Do you have a wallet like Phantom? | wallet yes/no in `notes` | Yes, or "help me set one up" |

**Answer to question 4:** no system and one room per listing → iCal on the setup call. **Mews / OtelMS / Exely** (or several identical rooms per type) → "Not automatically yet. For now we confirm each booking by hand: we get an alert, check your system, enter the booking there and confirm. If the room isn't free, we don't confirm and the guest gets a **full automatic refund** within 2 hours." Needs a staff login for us or someone on their side who answers within 2 hours. No integration dates.

## What to log after every call

One row per hotel in [leads.csv](leads.csv). Columns: `hotel_name, district, rooms, contact_name, role, phone, telegram, email, source, channels, channel_manager, accepts_crypto, status, next_step, next_date, notes`.

- `source`: `cold call`, `walk-in`, `referral:{who}`, `facebook`, …
- `status`: `new` → `no_answer` / `callback` → `contacted` → `info_sent` → `qualified` → `setup_booked` → `onboarded`; or `not_interested` / `not_a_fit`.
- `next_step` + `next_date` (YYYY-MM-DD): always fill both unless the status is final.
- `notes`: `ical_single_unit=yes/no`, wallet yes/no, language (KA/RU), objections heard, referrals, pilot-hotel permission (ask on the setup call).
- Delete the two `EXAMPLE` rows before the first real one.
- **Privacy:** the repo will be shared with judges (and may become public). Real phone numbers and names must not go into a public repo. Keep real rows in a private copy (for example a shared sheet) until the founders decide how to handle `leads.csv`; the pitch video only needs the counts.

## Promise / never promise

| Promise (from [offer.md](offer.md)) | Never promise |
|---|---|
| 0% Stumari fee until 31 Dec 2026, then 1.5%, written into each booking before the guest pays | New guests or demand. We are not an OTA. |
| USDC on Solana to a wallet they control, 24 h after check-in unless the guest opens a dispute | Payouts in lari, exchange rates or a specific converter |
| Refunds follow the contract the guest chose, automatically | Legal, tax or regulatory compliance ("ask your accountant") |
| Guests need no SOL; we pay network fees | Guaranteed revenue (prices *target* current expected revenue) |
| 1,500 USDC per-booking cap during the pilot | USDT, other tokens or other chains |
| Free 20-minute setup, no exclusivity, no minimums, leave anytime | iCal for multi-unit room types before checking their extranet |
| Manual confirm for Mews / OtelMS / Exely hotels; full automatic refund if the room isn't free | A date for automatic PMS/channel-manager integration, or for real-money bookings |
| First 10 Tbilisi hotels | Exchange deposit addresses as payout wallets |

Words to avoid: "travel app", "escrow app", "guaranteed", "legal", "tax-free", "more bookings". Say: "stablecoin checkout for your hotel".

## The link to send

After the call, send the link in their language (WhatsApp/Telegram), with the follow-up text from the script. These are the only links to send; no checkout link until checkout opens. English pages have no language prefix.

```
# "Show me first": the short "Book a 15-minute demo" form
{SITE}/ka/apply?type=demo&utm_source=call&utm_medium=phone
{SITE}/ru/apply?type=demo&utm_source=call&utm_medium=phone
{SITE}/apply?type=demo&utm_source=call&utm_medium=phone

# "I want to join": the pilot application (20-minute setup call)
{SITE}/ka/apply?utm_source=call&utm_medium=phone
{SITE}/ru/apply?utm_source=call&utm_medium=phone
{SITE}/apply?utm_source=call&utm_medium=phone
```

If you already agreed a setup time on the phone, send the confirmation message from the script instead; no form needed. Optional: add `&ref={your-first-name}` (for example `&ref=luka`) so the admin console shows who brought the lead; the form stores `utm_*` and `ref`. Before the first call, open one link yourself and check that the form loads and the source shows in `/admin`.
