# Call script — Tbilisi independent hotels (5–8 minutes)

> **DRAFT — founders confirm before sending.** Everything promised on the call must be in [offer.md](offer.md). Answers to pushback are in [objections.md](objections.md). After the call, log it in [leads.csv](leads.csv).

**Who:** the owner or manager of an independent hotel or guesthouse in Tbilisi. Call in Georgian or Russian, whichever they answer in.
**Goal of the call:** book the free 20-minute setup call. Do not try to onboard them on this call.
**Have open before dialling:** the landing page, `{SITE}/model` (how the prices are set), and the demo screenshots in [e2e-report.md](../plan/e2e-report.md) ([e2e-screens/](../plan/e2e-screens/)). Guest checkout on the public site is **not open yet** (`/h/*`, `/b/*` and `/my` show "Checkout is not open yet"), so there is no demo link to send. If you want to show the checkout live, run it on your own laptop on the local chain before the call (section 4).

## 1. Opener (30 s)

> "Hi, this is {name} from Stumari. We're a small Tbilisi team. Do you have two minutes? I have a quick question about guests who pay in crypto."

If they say no: "When is a better time?" Log `next_date` and hang up.

## 2. Discovery (2 min): ask, listen, write it down

1. **OTA commission:** "Roughly what share of your bookings come through Booking.com or Airbnb, and what commission do you pay them?" (Typical base is 15–25%, and 25–30% with visibility boosters. Do not say these numbers unless they ask.)
2. **Guests who want to pay in crypto:** "Do you get guests whose cards don't work, for example Russian cards, who ask to pay in USDT or other crypto? How do you handle that today?"
   - Listen for the usual answer: *"they send USDT to my wallet (or my brother's)."* That is the day-one use case. Note `accepts_crypto` = `no` / `sometimes` / `often`.
3. **Cancellation pain:** "What happens when a guest cancels late or doesn't show up? Does your cancellation policy fit every guest?"
4. **Calendar system:** "Which system manages your calendar: OtelMS, Exely, Mews, Cloudbeds, Beds24, something else, or just the Booking.com extranet? On Booking.com, is each room its own listing, or one room type with several rooms?" Log `channel_manager` and `ical_single_unit`. Then answer by case:
   - **No system, one room per listing:** "Then we connect your calendars directly over iCal, on the setup call."
   - **"We use Mews / OtelMS / Exely"** (same answer as [objections.md](objections.md#we-use-mews--otelms--exely-does-stumari-connect-to-it)):
     > "Not automatically yet. Each system is its own integration, and we're talking to them. Until then it works like this: when a guest pays on Stumari, we get an alert, check the dates in your system and enter the booking there, then confirm it. It takes a couple of minutes. If the room turns out to be taken, we don't confirm, and the guest gets all their money back automatically within 2 hours. You never have to handle a refund."

     This needs a staff login to their system for us, or someone on their side who answers the alert within 2 hours ([manual confirm mode](../architecture/inventory-ical.md#confirmation-write-back-safety)).
   - **Several identical rooms as one type, no system:** "Let's look at your extranet together on the setup call before we promise anything." Do not promise iCal.
   - Never promise a date for an automatic integration ([research](../research/channel-managers.md)).

## 3. Pitch (30 s)

Lead with their answer to question 2. About 75 words; say it, don't read it.

> "Today those guests pay a personal wallet: no receipt, refunds by hand. Send them your Stumari link instead. They pick a contract, say Flexible or Non-refundable, and pay USDC into an escrow holding your refund rules. Cancellations refund automatically. Otherwise the money reaches your wallet 24 hours after check-in, unless the guest opens a dispute in that window. You keep Booking.com; we don't bring you guests. First 10 Tbilisi hotels: 0% fee until the end of 2026, then 1.5%."

Only if they ask: guests need no SOL (we pay network fees); calendars sync with Booking.com/Airbnb and every booking stays *pending* until we re-check the calendar ([double bookings](objections.md#what-about-double-bookings-with-bookingcom)).

## 4. Demo (2–3 min, screen-share from the founder's laptop)

Skip it if they are short on time; offer the 15-minute demo instead (the apply link in section 6). Guest checkout on the public site is not open yet, so **never send a demo checkout link**. Show it one of two ways:

- **Live on the local chain**, screen-shared from the founder's laptop. Before the call: `pnpm --filter @stumari/scripts bootstrap --cluster localnet`, then `pnpm dev` (and `pnpm --filter web cron` in a second terminal), and open `http://localhost:3000/h/stumari-demo` ([runbook section 3](../plan/runbook.md#3-local-development)). Fund the test wallet with "Get 500 test USDC". Share only that browser window.
- **Screenshots** from [e2e-report.md](../plan/e2e-report.md) ([e2e-screens/](../plan/e2e-screens/)), plus `{SITE}/model` for how prices are set.

> **Restore later:** once devnet has a public URL, put the live demo link (`{SITE}/h/stumari-demo`) back into this section and the follow-up messages.

1. **Landing page** (`/`, `/ka` or `/ru`): "This is what a hotel sees. Here are the pilot terms and the Apply button."
2. **Demo hotel checkout** (`/h/stumari-demo`, local): pick dates about 5 days out, so the cancellation shows a 50% refund → **See prices** → three contracts with different prices. "Your current policy costs exactly your normal rate. Flexible costs a bit more and non-refundable costs less, by this guest's estimated cancellation risk, priced to target the same expected revenue whichever one they choose. It's a target, not a guarantee. You set how far prices can move." Pick **Standard**, then pay with the **Test wallet** (not real money).
3. **Booking page** (`/b/{id}`): show status, the terms timeline, and "refund if you cancel now". Open the **Explorer link** (local chain): "That is the escrow account. It holds this booking's money and rules." Wait until the status shows **Confirmed**; a pending booking always refunds 100%.
4. **Cancel**: click Cancel → the refund arrives at once by the schedule. Standard gives 100% more than 7 days before check-in and 50% between 7 and 3 days. Show the transaction on Explorer: "The guest's refund and the hotel's share are paid in one transaction. Nobody had to approve it."

Say plainly that this is a demo on a local test chain with test money. Guest checkout is not open yet; real bookings start after our security review. Do not give a date that the founders have not confirmed.

## 5. Close (1 min)

> "Setting you up takes a 20-minute call. We connect your calendars, enter your rooms and prices, and help you install a wallet if you don't have one. Does {day} at {time} work?"

- Yes: confirm the time and channel (WhatsApp/Telegram/in person). Ask them to have ready: Booking.com/Airbnb extranet login (they log in themselves), room list with USD rates, check-in/out times. Then follow [onboarding-checklist.md](onboarding-checklist.md).
- Not now: "Can I send you a one-page summary?" Send the matching language from [one-pager.md](one-pager.md).
- No: thank them. Ask "Who else in Tbilisi might need this?" and log it.

## 6. Follow-up messages

Fill in `{…}` before sending. `{apply_link}` = the demo form in their language, e.g. `{SITE}/ka/apply?type=demo&utm_source=call&utm_medium=phone` (see [call-sheet.md](call-sheet.md#the-link-to-send)). Send only the apply/demo link, never a checkout link. *Machine-drafted — RU and KA need native review.*

### After a "yes" (setup booked)

**EN**
> Hi {name}, thanks for the call! Confirming our 20-minute setup on {date} at {time}. Please have ready: your room types with nightly rates in USD, check-in/out times, and access to your Booking.com/Airbnb extranet (you log in, we never need your password). If you don't have a crypto wallet yet, we'll install Phantom together. Pilot terms: {offer_link}. — {your name}, Stumari

**RU**
> Здравствуйте, {name}! Спасибо за разговор. Подтверждаю 20-минутную настройку {date} в {time}. Пожалуйста, подготовьте: типы номеров с ценой за ночь в USD, время заезда и выезда и доступ к экстранету Booking.com/Airbnb (входите вы сами, пароль нам не нужен). Если криптокошелька ещё нет, вместе установим Phantom. Условия пилота: {offer_link}. — {your name}, Stumari

**KA**
> გამარჯობა, {name}! გმადლობთ საუბრისთვის. ვადასტურებ 20-წუთიან დაყენებას {date}-ს, {time}-ზე. გთხოვთ, მოამზადოთ: ოთახების ტიპები ღამის ფასით USD-ში, შესვლისა და გასვლის დრო და წვდომა Booking.com/Airbnb-ის ექსტრანეტზე (შედიხართ თქვენ, პაროლი ჩვენ არ გვჭირდება). თუ კრიპტოსაფულე ჯერ არ გაქვთ, Phantom-ს ერთად დავაყენებთ. პილოტის პირობები: {offer_link}. — {your name}, Stumari

### After "send me info"

**EN**
> Hi {name}, as promised, here is a short summary of Stumari: {one_pager_text}. If it makes sense, leave your number here and we'll agree a time for a 15-minute demo: {apply_link} — {your name}

**RU**
> Здравствуйте, {name}! Как договорились, вот краткое описание Stumari: {one_pager_text}. Если интересно, оставьте номер здесь, и мы договоримся о времени демо на 15 минут: {apply_link} — {your name}

**KA**
> გამარჯობა, {name}! როგორც შევთანხმდით, აი Stumari-ს მოკლე აღწერა: {one_pager_text}. თუ დაგაინტერესებთ, აქ დატოვეთ ნომერი და 15-წუთიან დემოზე შევთანხმდებით: {apply_link} — {your name}

### No answer (second attempt, 2–3 days later)

**EN**
> Hi {name}, this is {your name} from Stumari (Tbilisi). We help hotels accept stablecoin payments from guests whose cards don't work, with automatic refunds and payouts to your own wallet. For the first 10 hotels, the Stumari fee is 0% until the end of 2026. Would a 5-minute call this week work?

**RU**
> Здравствуйте, {name}! Это {your name} из Stumari (Тбилиси). Мы помогаем отелям принимать оплату в стейблкоинах от гостей, у которых не работают карты: с автоматическим возвратом и выплатой на ваш собственный кошелёк. Для первых 10 отелей комиссия Stumari 0% до конца 2026 года. Удобно созвониться на 5 минут на этой неделе?

**KA**
> გამარჯობა, {name}! გწერთ {your name}, Stumari-დან (თბილისი). ვეხმარებით სასტუმროებს, მიიღონ სტეიბლქოინით გადახდა იმ სტუმრებისგან, ვისაც ბარათი არ უმუშავებს: თანხის ავტომატური დაბრუნებითა და თანხის ჩარიცხვით თქვენს საკუთარ საფულეზე. პირველი 10 სასტუმროსთვის Stumari-ს საკომისიო 0%-ია 2026 წლის ბოლომდე. ამ კვირაში 5-წუთიანი საუბარი მოგიხერხდებათ?
