# Call script — Tbilisi independent hotels (5–8 minutes)

> **DRAFT — founders confirm before sending.** Everything promised on the call must be in [offer.md](offer.md). Answers to pushback are in [objections.md](objections.md). After the call, log it in [leads.csv](leads.csv).

**Who:** the owner or manager of an independent hotel or guesthouse in Tbilisi. Call in Georgian or Russian, whichever they answer in.
**Goal of the call:** book the free 20-minute setup call. Do not try to onboard them on this call.
**Have open before dialling:** the landing page, the demo hotel page (`/h/{demo-slug}`) with the devnet test wallet funded (click "Get 500 test USDC" beforehand), and Solana Explorer on devnet.

## 1. Opener (30 s)

> "Hi, this is {name} from Stumari. We're a small Tbilisi team. Do you have two minutes? I have a quick question about guests who pay in crypto."

If they say no: "When is a better time?" Log `next_date` and hang up.

## 2. Discovery (2 min): ask, listen, write it down

1. **OTA commission:** "Roughly what share of your bookings come through Booking.com or Airbnb, and what commission do you pay them?" (Typical base is 15–25%, and 25–30% with visibility boosters. Do not say these numbers unless they ask.)
2. **Guests who want to pay in crypto:** "Do you get guests whose cards don't work, for example Russian cards, who ask to pay in USDT or other crypto? How do you handle that today?"
   - Listen for the usual answer: *"they send USDT to my wallet (or my brother's)."* That is the day-one use case. Note `accepts_crypto` = `no` / `sometimes` / `often`.
3. **Cancellation pain:** "What happens when a guest cancels late or doesn't show up? Does your cancellation policy fit every guest?"

## 3. Pitch (30 s)

Lead with their answer to question 2.

> "Those guests already pay you in stablecoins, but straight to a personal wallet: no receipt, no clear terms, and refunds by hand. Send them your Stumari link instead. The guest picks a contract, for example Flexible, Standard or Non-refundable, and pays USDC into an escrow on Solana that holds your exact refund rules. If they cancel, the refund happens automatically by those rules. If they stay, the money reaches your own wallet 24 hours after check-in. They need no extra coins for fees; we pay those. We sync with your Booking.com and Airbnb calendars, so a room sold through us gets blocked there too. We check your calendar again right after each payment. If the dates are already taken, the booking isn't confirmed and the guest gets a full refund automatically. For the first 10 hotels in Tbilisi it's 0% until the end of the year, then 1.5%. You keep Booking.com; this is just an extra channel. We don't bring you guests."

## 4. Live demo (2–3 min, share screen or send the link)

Skip it if they are short on time. Send the link in the follow-up instead.

1. **Landing page** (`/`, `/ka` or `/ru`): "This is what a hotel sees. Here are the pilot terms and the Apply button."
2. **Demo hotel checkout** (`/h/{demo-slug}`): pick dates about 5 days out, so the cancellation shows a 50% refund → **See prices** → three contracts with different prices. "Your current policy costs exactly your normal rate. Flexible costs a bit more and non-refundable costs less, by as much as this guest's cancellation risk is worth, so you expect to earn the same whichever one they choose. It's a target, not a guarantee. You set how far prices can move." Pick **Standard**, then pay with the **Test wallet (devnet, not real money)**.
3. **Booking page** (`/b/{id}`): show status, the terms timeline, and "refund if you cancel now". Open the **Explorer link**: "That is the escrow account. It holds this booking's money and rules." Wait until the status shows **Confirmed**; a pending booking always refunds 100%.
4. **Cancel**: click Cancel → the refund arrives at once by the schedule. Standard gives 100% more than 7 days before check-in and 50% between 7 and 3 days. Show the transaction on Explorer: "The guest's refund and the hotel's share are paid in one transaction. Nobody had to approve it."

Say plainly that this is a devnet demo with test money. Real bookings start after our security review. Do not give a date that the founders have not confirmed.

## 5. Close (1 min)

> "Setting you up takes a 20-minute call. We connect your calendars, enter your rooms and prices, and help you install a wallet if you don't have one. Does {day} at {time} work?"

- Yes: confirm the time and channel (WhatsApp/Telegram/in person). Ask them to have ready: Booking.com/Airbnb extranet login (they log in themselves), room list with USD rates, check-in/out times. Then follow [onboarding-checklist.md](onboarding-checklist.md).
- Not now: "Can I send you a one-page summary?" Send the matching language from [one-pager.md](one-pager.md).
- No: thank them. Ask "Who else in Tbilisi might need this?" and log it.

## 6. Follow-up messages

Fill in `{…}` before sending. *Machine-drafted — RU and KA need native review.*

### After a "yes" (setup booked)

**EN**
> Hi {name}, thanks for the call! Confirming our 20-minute setup on {date} at {time}. Please have ready: your room types with nightly rates in USD, check-in/out times, and access to your Booking.com/Airbnb extranet (you log in, we never need your password). If you don't have a crypto wallet yet, we'll install Phantom together. Pilot terms: {offer_link}. — {your name}, Stumari

**RU**
> Здравствуйте, {name}! Спасибо за разговор. Подтверждаю 20-минутную настройку {date} в {time}. Пожалуйста, подготовьте: типы номеров с ценой за ночь в USD, время заезда и выезда и доступ к экстранету Booking.com/Airbnb (входите вы сами, пароль нам не нужен). Если криптокошелька ещё нет, вместе установим Phantom. Условия пилота: {offer_link}. — {your name}, Stumari

**KA**
> გამარჯობა, {name}! გმადლობთ საუბრისთვის. ვადასტურებ 20-წუთიან დაყენებას {date}-ს, {time}-ზე. გთხოვთ, მოამზადოთ: ოთახების ტიპები ღამის ფასით USD-ში, შესვლისა და გასვლის დრო და წვდომა Booking.com/Airbnb-ის ექსტრანეტზე (შედიხართ თქვენ, პაროლი ჩვენ არ გვჭირდება). თუ კრიპტოსაფულე ჯერ არ გაქვთ, Phantom-ს ერთად დავაყენებთ. პილოტის პირობები: {offer_link}. — {your name}, Stumari

### After "send me info"

**EN**
> Hi {name}, as promised, here is a short summary of Stumari: {one_pager_text}. You can see the live demo here: {demo_link} (test money, nothing real is charged). If it makes sense, reply with a time for a 20-minute setup call. — {your name}

**RU**
> Здравствуйте, {name}! Как договорились, вот краткое описание Stumari: {one_pager_text}. Живое демо здесь: {demo_link} (тестовые деньги, ничего реально не списывается). Если интересно, напишите удобное время для 20-минутной настройки. — {your name}

**KA**
> გამარჯობა, {name}! როგორც შევთანხმდით, აი Stumari-ს მოკლე აღწერა: {one_pager_text}. ცოცხალი დემო აქ არის: {demo_link} (სატესტო თანხა, რეალურად არაფერი ჩამოიჭრება). თუ დაგაინტერესებთ, მომწერეთ თქვენთვის მოსახერხებელი დრო 20-წუთიანი დაყენებისთვის. — {your name}

### No answer (second attempt, 2–3 days later)

**EN**
> Hi {name}, this is {your name} from Stumari (Tbilisi). We help hotels accept stablecoin payments from guests whose cards don't work, with automatic refunds and payouts to your own wallet. For the first 10 hotels, the Stumari fee is 0% until the end of 2026. Would a 5-minute call this week work?

**RU**
> Здравствуйте, {name}! Это {your name} из Stumari (Тбилиси). Мы помогаем отелям принимать оплату в стейблкоинах от гостей, у которых не работают карты: с автоматическим возвратом и выплатой на ваш собственный кошелёк. Для первых 10 отелей комиссия Stumari 0% до конца 2026 года. Удобно созвониться на 5 минут на этой неделе?

**KA**
> გამარჯობა, {name}! გწერთ {your name}, Stumari-დან (თბილისი). ვეხმარებით სასტუმროებს, მიიღონ სტეიბლქოინით გადახდა იმ სტუმრებისგან, ვისაც ბარათი არ უმუშავებს: თანხის ავტომატური დაბრუნებითა და ანაზღაურებით თქვენს საკუთარ საფულეზე. პირველი 10 სასტუმროსთვის Stumari-ს საკომისიო 0%-ია 2026 წლის ბოლომდე. ამ კვირაში 5-წუთიანი საუბარი მოგიხერხდებათ?
