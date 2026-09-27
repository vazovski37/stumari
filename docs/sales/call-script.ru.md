# Скрипт звонка (русский) — независимые отели Тбилиси, 5–8 минут

> **DRAFT — founders confirm before use.** Russian version of [call-script.md](call-script.md), written to be spoken, not read. Everything promised must be in [offer.md](offer.md); pushback answers are in [objections.ru.md](objections.ru.md); log every call in [leads.csv](leads.csv) (see [call-sheet.md](call-sheet.md)). Numbers are identical to the English sources. *Machine-drafted — a native speaker reads it aloud once before the first call and fixes anything that sounds stiff.*
>
> Stage directions are in English; everything in quotes is what you say. Use «вы». Most Tbilisi owners who answer in Russian are Georgian: keep it simple and friendly, no sales jargon.

**Goal:** book the free 20-minute setup/demo call. Don't onboard on this call.
**Before dialling:** landing page open (`/ru`), `{SITE}/model` (how prices are set), and the demo screenshots in [e2e-report.md](../plan/e2e-report.md). Guest checkout on the public site is not open yet, so there is no demo link to send; to show the checkout live, run it on your laptop (section 4).

## 1. Начало (30 с)

> «Здравствуйте! Меня зовут {имя}, я из Stumari. Мы небольшая команда из Тбилиси. Есть пара минут? У меня короткий вопрос про гостей, которые платят криптовалютой.»

If no: «Когда вам удобнее, чтобы я перезвонил(а)?» — log `next_date`, thank them, hang up.

## 2. Вопросы (2 мин) — спросите, послушайте, запишите

1. **Комиссия OTA:** «Примерно какая часть бронирований у вас идёт через Booking.com или Airbnb, и какую комиссию вы им платите?»
   *(Typical: 15–25% base, 25–30% with visibility boosters. Only say these if they ask.)*
2. **Гости, которые платят криптой:** «Бывают гости, у которых не проходит карта — например, с российскими картами, — и они просят оплатить в USDT или другой криптовалютой? Как вы сейчас с этим поступаете?»
   - Listen for: *«Скидывают USDT мне (или брату) на кошелёк.»* That is the day-one use case. Log `accepts_crypto` = `no` / `sometimes` / `often`.
3. **Отмены:** «А что происходит, когда гость отменяет в последний момент или просто не приезжает? Ваше правило отмены подходит всем гостям?»
4. **Календарь:** «В какой системе вы ведёте календарь: OtelMS, Exely, Mews, Cloudbeds, Beds24, что-то другое — или просто в экстранете Booking.com? На Booking.com каждый номер — отдельное объявление или один тип номера на несколько комнат?»
   Log `channel_manager` (e.g. `none`, `otelms`, `exely`, `mews`) and write `ical_single_unit=yes/no` in `notes`. Then answer by case:
   - **No system, one room per listing** → «Тогда подключим календари напрямую через iCal, прямо на звонке-настройке.»
   - **«У нас Mews / OtelMS / Exely»** →
     > «Автоматически пока не подключаемся — каждая система это отдельная интеграция, мы с ними на связи. А пока работаем так: когда гость платит через Stumari, нам приходит уведомление, мы проверяем даты в вашей системе, заводим там бронь и подтверждаем. Это пара минут. Если номер оказался занят, мы не подтверждаем, и гость автоматически получает все деньги обратно в течение 2 часов. Вам с возвратом ничего делать не нужно.»
   - **Several identical rooms as one type, no system** → «Прежде чем что-то обещать, давайте на звонке-настройке вместе посмотрим ваш экстранет.» Do not promise iCal.
   - Never promise a date for an automatic integration.

## 3. Коротко о Stumari (30 с)

Lead with their answer to question 2. Say it, don't read it.

> «Сейчас такие гости платят вам на личный кошелёк: ни чека, ни нормального возврата — всё вручную. Вместо этого отправьте им ссылку Stumari. Гость выбирает условия — например, "Гибкий" или "Невозвратный" — и платит в USDC на эскроу, где записаны ваши правила возврата. Если он отменяет, деньги возвращаются автоматически. Если нет — они приходят вам на кошелёк через 24 часа после заезда, если только гость не откроет спор за это время. Booking.com остаётся, гостей мы вам не приводим. Для первых 10 отелей Тбилиси — 0% комиссии до конца 2026 года, потом 1,5%.»

Only if they ask:
- «Гостю не нужен SOL — сетевую комиссию платим мы.»
- «Календари синхронизируются с Booking.com и Airbnb, и каждая бронь сначала висит в ожидании, пока мы заново не проверим календарь.» ([двойные брони](objections.ru.md))

## 4. Демо (2–3 мин — демонстрация экрана с ноутбука основателя)

Skip if they're short on time; offer the 15-minute demo instead (`{apply_link}`, section 6). Guest checkout on the public site is **not open yet** (`/h/*`, `/b/*`, `/my` show "Checkout is not open yet"), so **never send a demo checkout link**. Show it one of two ways:

- **Live on the local chain**, screen-shared from the founder's laptop. Before the call: `pnpm --filter @stumari/scripts bootstrap --cluster localnet`, then `pnpm dev` (and `pnpm --filter web cron` in a second terminal), open `http://localhost:3000/h/stumari-demo` ([runbook section 3](../plan/runbook.md#3-local-development)) and fund the test wallet ("Get 500 test USDC"). Share only that browser window.
- **Screenshots** from [e2e-report.md](../plan/e2e-report.md) ([e2e-screens/](../plan/e2e-screens/)), plus `{SITE}/model` for how prices are set.

> **Restore later:** once devnet has a public URL, put the live demo link (`{SITE}/h/stumari-demo`) back into this section and the "send me info" follow-up.

1. **Landing page** (`/ru`): «Вот что видит отель. Здесь условия пилота и кнопка заявки.»
2. **Demo checkout** (`/h/stumari-demo`, local): pick dates ~5 days out (so cancelling shows a 50% refund) → **See prices** → three contracts.
   > «Ваше текущее правило всегда стоит ровно вашу обычную цену. "Гибкий" чуть дороже, "Невозвратный" дешевле — на оценённый риск отмены именно этого гостя. Цена рассчитана так, чтобы быть нацеленной на ваш текущий ожидаемый доход, что бы он ни выбрал. Это цель, а не гарантия. Насколько цена может отклоняться, решаете вы.»

   Pick **Standard**, pay with the **Test wallet** (not real money).
3. **Booking page** (`/b/{id}`): show status, the terms timeline, "refund if you cancel now". Open the **Explorer link** (local chain):
   > «Это эскроу-счёт. На нём лежат деньги этой брони и её правила.»

   Wait for **Confirmed** (a pending booking always refunds 100%).
4. **Cancel**: the refund arrives at once by the schedule. Standard = 100% more than 7 days before check-in, 50% between 7 and 3 days. Show the transaction on Explorer:
   > «Возврат гостю и доля отеля ушли одной транзакцией. Никому ничего не пришлось подтверждать.»

Say plainly: «Это демо в тестовой сети, на тестовых деньгах. Оплата для гостей пока не открыта; реальные брони начнутся после проверки безопасности.» Give no date the founders haven't confirmed.

## 5. Договорённость (1 мин)

> «Настройка — это звонок на 20 минут: подключаем календари, заносим номера и цены, а если кошелька нет — поможем установить. {день}, в {время} вам удобно?»

- **Да** → confirm time and channel (WhatsApp / Telegram / in person). Ask them to have ready: room types with nightly rates in USD, check-in/out times, their Booking.com/Airbnb extranet (they log in themselves). Send the confirmation below, then follow [onboarding-checklist.md](onboarding-checklist.md).
- **Не сейчас** → «Можно, я пришлю короткое описание на одну страницу?» Send the Russian [one-pager](one-pager.md#русский) plus the apply link.
- **Нет** → «Спасибо! А кому в Тбилиси это могло бы пригодиться?» Log it.

## 6. Сообщения после звонка

Fill in `{…}` before sending. Send only the apply/demo link, never a checkout link. `{apply_link}` = `{SITE}/ru/apply?type=demo&utm_source=call&utm_medium=phone` (see [call-sheet.md](call-sheet.md#the-link-to-send)).

**После «да» (настройка назначена)**
> Здравствуйте, {name}! Спасибо за разговор. Подтверждаю 20-минутную настройку {date} в {time}. Пожалуйста, подготовьте: типы номеров с ценой за ночь в USD, время заезда и выезда и доступ к экстранету Booking.com/Airbnb (входите вы сами, пароль нам не нужен). Если криптокошелька ещё нет, вместе установим Phantom. Условия пилота: {SITE}/ru#pilot — {your name}, Stumari

**После «пришлите информацию»**
> Здравствуйте, {name}! Как договорились, вот краткое описание Stumari: {one_pager_text}. Если интересно, оставьте номер здесь, и мы договоримся о времени демо на 15 минут: {apply_link} — {your name}

**Не ответили (вторая попытка через 2–3 дня)**
> Здравствуйте, {name}! Это {your name} из Stumari (Тбилиси). Мы помогаем отелям принимать оплату в стейблкоинах от гостей, у которых не работают карты: с автоматическим возвратом и выплатой на ваш собственный кошелёк. Для первых 10 отелей комиссия Stumari 0% до конца 2026 года. Удобно созвониться на 5 минут на этой неделе?
