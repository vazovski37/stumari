# Facebook / Instagram kit — page, first posts, first ads

> **DRAFT — founders confirm before publishing.** Everything here must match [offer.md](offer.md) and the landing page (`apps/web/messages/{en,ka,ru}.json`). Statistics are copied exactly from the landing page. Positioning: "stablecoin checkout for merchants", never "travel app" or "escrow app" ([vision-and-positioning.md](../product/vision-and-positioning.md)). `{SITE}` = the landing domain. The founders create the page, the Business portfolio and the ad account themselves; nothing here was created by an agent. KA and RU copy is *machine-drafted — one native read-through before publishing*.

## 0. Order of work

1. **Page** (section 1), profile and cover image (section 2), then publish the three organic posts (section 3) so the page doesn't look empty when ads send people to it.
2. **Business portfolio + ad account** in the founders' names, with two-factor authentication on. If Meta asks for business verification, do it yourselves.
3. **Pixel:** create a dataset/Pixel in Events Manager. **Before** you set the variable, open the pixel's settings in Events Manager and turn **OFF "Automatic advanced matching"**: the privacy page says the pixel never reads form fields, and that is only true with it off. Then put the id (digits only) in `NEXT_PUBLIC_META_PIXEL_ID` on the deployment and **redeploy** (it is inlined at build time; see [go-live-landing.md](../plan/go-live-landing.md#4-the-environment-variables)). The pixel loads only after the visitor accepts the consent banner. Check in Events Manager → **Test events** that a test application fires **Lead**.
4. **Domain verification** for `{SITE}` in Business Settings → Brand safety → Domains (helps with event configuration and link-ownership).
5. **Read the compliance checklist (section 7) before creating the first ad.**
6. Launch ads (sections 4–6): all three variants, **usdc**, **contracts** and **founding**.

## 1. The page

| Field | Value |
|---|---|
| Page name | **Stumari** |
| Username | `@stumari` (fallback `@stumari.ge` or `@stumarihq`) |
| Category | **Software** (optionally add **Information Technology Company**). Don't pick "Financial Service", "Bank" or "Cryptocurrency": Stumari is checkout software for hotels, and a finance category invites the wrong review. |
| Website | `{SITE}/ka?utm_source=facebook&utm_medium=organic&utm_campaign=page_profile` |
| Action button | **Sign up** → `{SITE}/ka/apply?utm_source=facebook&utm_medium=organic&utm_campaign=page_button` |
| Contact | Team WhatsApp number and Telegram (the same ones the apply form promises replies from). No personal email. |
| Location | Tbilisi, Georgia (service area, no street address) |

### Bio / Intro (max 101 characters; the page has one, use KA)

- **KA (use this):** სტეიბლქოინით გადახდა დამოუკიდებელი სასტუმროებისთვის. პილოტი თბილისის 10 სასტუმროსთვის.
- RU: Оплата в стейблкоинах для независимых отелей. Пилот для 10 отелей Тбилиси.
- EN: Stablecoin checkout for independent hotels. Founding-hotel pilot for 10 hotels in Tbilisi.

### About / description (put all three in the page's details, KA first)

**KA**
> Stumari (სტუმარი) — სტეიბლქოინით გადახდა დამოუკიდებელი სასტუმროებისთვის. სტუმარი იხდის USDC-ით ესქროუში Solana-ზე, სადაც თქვენი პირობებია ჩაწერილი: გაუქმებისას თანხა ავტომატურად ბრუნდება სტუმრის არჩეული კონტრაქტით, თქვენ კი თანხას საკუთარ საფულეში იღებთ შესვლიდან 24 საათში, თუ სტუმარი ამ დროში დავას არ გახსნის. გაუქმების პირობები თითოეული მოთხოვნისთვის ცალკე ითვლება. დამფუძნებელი სასტუმროების პილოტი თბილისის პირველი 10 სასტუმროსთვის: 0% საკომისიო 2026 წლის 31 დეკემბრამდე, შემდეგ 1,5%. სტუმრებს არ მოგიყვანთ და იურიდიულ, საგადასახადო ან ფინანსურ რჩევებს არ ვიძლევით.

**RU**
> Stumari (по-грузински «гость») — оплата в стейблкоинах для независимых отелей. Гость платит в USDC на эскроу в Solana, где записаны ваши условия: при отмене деньги возвращаются автоматически по выбранному гостем контракту, а вы получаете оплату на свой кошелёк через 24 часа после заезда, если гость не откроет спор за это время. Условия отмены рассчитываются под каждый запрос. Пилот для первых 10 отелей Тбилиси: 0% комиссии до 31 декабря 2026 года, затем 1,5%. Мы не приводим гостей и не даём юридических, налоговых или финансовых консультаций.

**EN**
> Stumari (Georgian for "guest") is a stablecoin checkout for independent hotels. Guests pay in USDC into an escrow on Solana that holds your terms: if they cancel, the refund follows the contract they chose, automatically; otherwise you're paid to your own wallet 24 hours after check-in, unless the guest opens a dispute in that window. Cancellation terms are priced for each request. Founding-hotel pilot for the first 10 hotels in Tbilisi: 0% fee until 31 December 2026, then 1.5%. We don't bring you guests, and we don't give legal, tax or financial advice.

## 2. Profile and cover images (the landing brand)

Brand tokens from `apps/web/app/globals.css`: paper `#faf6ef`, sand `#f2eadd`, ink `#1f1a17`, wine `#7a1f30`, wine-deep `#4e121d`, amber `#d99a2b`, vine `#2f6a4e`. Headlines in **Literata** (Latin/Cyrillic) or **Noto Serif Georgian**; body in **Inter** / **Noto Sans Georgian** (all free on Google Fonts).

- **Profile picture:** the site mark from `apps/web/app/icon.svg` (a cream arch doorway `#faf6ef` with an amber dot `#d99a2b` on wine `#7a1f30`). Export a square PNG of at least 720×720 with a full-bleed wine background (no rounded corners: Facebook crops to a circle) and scale the arch to about 60% of the width so nothing touches the circle's edge.
- **Cover:** upload 1640×624. Paper background, a thin wine arch motif on one side, and the landing headline in wine: KA „თანხა — სტუმრის შესვლიდან 24 საათში." with the subline „გაუქმების პირობები — ყველა სტუმრისთვის ცალკე." (RU: «Деньги — через 24 часа после заезда.» / «Условия отмены — под каждого гостя.»). Keep all text in the middle two-thirds: phones crop the sides. No prices, no coin imagery, no charts.
- **Ad images** come from the site: the gallery at `{SITE}/ads` lists them all. Files are `{SITE}/ads/{lang}/{usdc|contracts|founding}.png` (1080×1080, feed and Stories) and `…-wide.png` (1200×630, link ads), named after the three ad variants **usdc**, **contracts** and **founding** (section 4). Every image carries a demo button (EN "Book a 15-minute demo", RU equivalent, KA „დემოს დანიშვნა"), so the ads point at the demo form (section 6). Open each image before uploading and check it says the same as the ad text.

## 3. First organic posts (3 per language)

Publish each post once, bilingual: Georgian first, then a line `—`, then Russian. English only if you want the page to look international. Attach the matching ad image or a screenshot of the landing page. Links use `utm_medium=organic`. Guest checkout is not open yet, so every post says so and its link goes to the demo form (posts 1–2) or the pilot application (post 3), never to a checkout page.

### Post 1 — who we are

**KA**
> გამარჯობა! ჩვენ Stumari ვართ — პატარა თბილისური გუნდი. სახელი ქართული სიტყვიდან „სტუმარი" მოდის.
> ვაკეთებთ სტეიბლქოინით გადახდას დამოუკიდებელი სასტუმროებისთვის. რატომ? რუსეთში გაცემული ბარათები საზღვარგარეთ არ მუშაობს, 2025 წელს კი საქართველოს რუსეთიდან 1 579 764 ვიზიტორი ეწვია. ბევრი ასეთი სტუმარი პატარა სასტუმროებს უკვე USDT-ით უხდის — პირდაპირ მფლობელის პირად საფულეში, ქვითრისა და დაბრუნების წესის გარეშე.
> Stumari ამას ნორმალურ ჯავშნად აქცევს: წერილობითი პირობებით, ავტომატური დაბრუნებით და გადახდით თქვენს საფულეში. სტუმრებისთვის გადახდა უსაფრთხოების შემოწმების შემდეგ გაიხსნება; ახლა პილოტის სასტუმროებს ვეძებთ.
> 15-წუთიანი დემო: {SITE}/ka/apply?type=demo&utm_source=facebook&utm_medium=organic&utm_campaign=post_1

**RU**
> Здравствуйте! Мы Stumari — небольшая команда из Тбилиси. Название от грузинского слова «სტუმარი» — «гость».
> Мы делаем оплату в стейблкоинах для независимых отелей. Зачем? Карты российских банков за рубежом не работают, а в 2025 году в Грузию приехали 1 579 764 гостя из России. Многие из них уже платят небольшим отелям в USDT — прямо на личный кошелёк владельца, без чека и без правил возврата.
> Stumari превращает это в нормальное бронирование: с прописанными условиями, автоматическим возвратом и выплатой на ваш кошелёк. Оплата для гостей откроется после проверки безопасности; сейчас мы ищем отели для пилота.
> Демо на 15 минут: {SITE}/ru/apply?type=demo&utm_source=facebook&utm_medium=organic&utm_campaign=post_1

**EN**
> Hi! We're Stumari, a small team in Tbilisi. The name comes from სტუმარი, Georgian for "guest".
> We build stablecoin checkout for independent hotels. Why? Russian-issued cards don't work abroad, and Georgia had 1,579,764 visitors from Russia in 2025. Many of them already pay small hotels in USDT, straight to the owner's personal wallet, with no receipt and no refund rule.
> Stumari turns that into a proper booking: written terms, automatic refunds, and payouts to your own wallet. Guest checkout opens after our security review; right now we're looking for pilot hotels.
> Book a 15-minute demo: {SITE}/apply?type=demo&utm_source=facebook&utm_medium=organic&utm_campaign=post_1

### Post 2 — how one booking works (use the landing's example card)

**KA**
> როგორ მუშაობს ერთი ჯავშანი — მაგალითი:
> ორადგილიანი ოთახი, 3 ღამე, შესვლა 14 ნოემბერს, 14:00. სტუმარი ირჩევს „სტანდარტულ" კონტრაქტს და იხდის 240.00 USDC-ს — თანხა ამ ჯავშნის ესქროუში ინახება.
> • 7 ნოემბრამდე გააუქმა → სრული დაბრუნება
> • 11 ნოემბრამდე → 50% სტუმარს, 50% თქვენ
> • 11 ნოემბრის შემდეგ → დაბრუნების გარეშე
> • 15 ნოემბერს, 14:00 → 240.00 USDC თქვენს საფულეში, თუ სტუმარი დავას არ გახსნის
> ინვოისის გაგზავნა და ფულის მოთხოვნა აღარ გიწევთ. პირობები სტუმრის გადახდამდე იწერება და პროგრამის წესები მათ შეცვლას არავის აძლევს. (პილოტის დროს Stumari-ს ჯერ კიდევ შეუძლია თავად პროგრამის განახლება — ამას ღიად ვწერთ საიტზე.)
> სტუმრებისთვის გადახდა უსაფრთხოების შემოწმების შემდეგ გაიხსნება. 15-წუთიანი დემო: {SITE}/ka/apply?type=demo&utm_source=facebook&utm_medium=organic&utm_campaign=post_2

**RU**
> Как работает одно бронирование — пример:
> Двухместный номер, 3 ночи, заезд 14 ноября в 14:00. Гость выбирает контракт «Стандартный» и платит 240.00 USDC — деньги лежат в эскроу этой брони.
> • Отмена до 7 ноября → полный возврат
> • До 11 ноября → 50% гостю, 50% вам
> • После 11 ноября → без возврата
> • 15 ноября, 14:00 → 240.00 USDC на ваш кошелёк, если гость не откроет спор
> Никаких счетов и напоминаний. Условия записываются до оплаты, и правила программы никому не дают их изменить. (Во время пилота Stumari ещё может обновить саму программу — мы открыто пишем об этом на сайте.)
> Оплата для гостей откроется после проверки безопасности. Демо на 15 минут: {SITE}/ru/apply?type=demo&utm_source=facebook&utm_medium=organic&utm_campaign=post_2

**EN**
> How one booking works, an example:
> Double room, 3 nights, check-in 14 Nov at 14:00. The guest picks the Standard contract and pays 240.00 USDC, held in this booking's escrow.
> • Cancels before 7 Nov → full refund
> • Before 11 Nov → 50% back, 50% to you
> • After 11 Nov → no refund
> • 15 Nov, 14:00 → 240.00 USDC paid to your wallet, unless the guest opens a dispute
> No invoice, no chasing. The terms are written before the guest pays and the program's rules let nobody change them. (During the pilot Stumari can still upgrade the program itself; we say so on the site.)
> Guest checkout opens after our security review. Book a 15-minute demo: {SITE}/apply?type=demo&utm_source=facebook&utm_medium=organic&utm_campaign=post_2

### Post 3 — the pilot offer

**KA**
> ვეძებთ თბილისის პირველ 10 დამოუკიდებელ სასტუმროს:
> • Stumari-ს 0% საკომისიო ყველა ჯავშანზე 2026 წლის 31 დეკემბრამდე, შემდეგ 1,5%
> • გადახდა USDC-ით თქვენს საფულეში, შესვლიდან 24 საათში (თუ სტუმარი დავას არ გახსნის)
> • უფასო 20-წუთიანი დაყენება, ექსკლუზიურობის გარეშე; პილოტის დატოვება ნებისმიერ დროს შეგიძლიათ
> • ლიმიტი 1 500 USDC ერთ ჯავშანზე პილოტის განმავლობაში
> რას არ ვაკეთებთ: სტუმრებს არ მოგიყვანთ, ლარში არ ვიხდით და იურიდიულ, საგადასახადო ან ფინანსურ რჩევებს არ ვიძლევით.
> სტუმრებისთვის გადახდა უსაფრთხოების შემოწმების შემდეგ გაიხსნება.
> განაცხადი: {SITE}/ka/apply?utm_source=facebook&utm_medium=organic&utm_campaign=post_3

**RU**
> Ищем первые 10 независимых отелей Тбилиси:
> • 0% комиссии Stumari с каждого бронирования до 31 декабря 2026 года, затем 1,5%
> • Выплата в USDC на ваш кошелёк через 24 часа после заезда (если гость не откроет спор)
> • Бесплатная настройка за 20 минут, без эксклюзивности, уйти можно в любой момент
> • Лимит 1 500 USDC на одно бронирование во время пилота
> Чего мы не делаем: не приводим гостей, не выплачиваем в лари и не даём юридических, налоговых или финансовых консультаций.
> Оплата для гостей откроется после проверки безопасности.
> Заявка: {SITE}/ru/apply?utm_source=facebook&utm_medium=organic&utm_campaign=post_3

**EN**
> We're looking for the first 10 independent hotels in Tbilisi:
> • 0% Stumari fee on every booking until 31 December 2026, then 1.5%
> • Paid in USDC to your wallet 24 hours after check-in (unless the guest opens a dispute)
> • Free 20-minute setup, no exclusivity, leave anytime
> • 1,500 USDC limit per booking during the pilot
> What we don't do: bring you guests, pay out in lari, or give legal, tax or financial advice.
> Guest checkout opens after our security review.
> Apply: {SITE}/apply?utm_source=facebook&utm_medium=organic&utm_campaign=post_3

## 4. Ads — 3 variants per language

Meta shows about 125 characters of primary text before "See more", so the first sentence carries the ad. The CTA button label is localised by Meta automatically. All three send people to the "Book a 15-minute demo" form in their language, which is what the images promise (links in section 6).

| Variant | Image | Angle | CTA |
|---|---|---|---|
| **usdc** | `usdc.png` | Guests who pay in USDT → take USDC with automatic refund rules | Learn more |
| **contracts** | `contracts.png` | One cancellation policy for everyone → a menu of contracts priced per guest | Learn more |
| **founding** | `founding.png` | First 10 Tbilisi hotels: 0% Stumari fee until end of 2026 | Sign up |

The variant name is also the `utm_content` value (section 6) and the image file name. The **usdc** image no longer carries a swap note, so it runs in ads like the other two. Open it before uploading and check that it has no line about swapping USDT.

Guest checkout is not open yet. Every ad says that checkout opens after the security review, and the call to action is the demo form, never a booking link.

### Georgian (KA)

**usdc**
- Primary: ზოგიერთი სტუმარი, ვისაც ბარათი საზღვარგარეთ არ უმუშავებს, თბილისის პატარა სასტუმროებს უკვე USDT-ით უხდის — პირდაპირ მფლობელის პირად საფულეზე, ქვითრისა და დაბრუნების წესის გარეშე. Stumari-თ სტუმარი იხდის USDC-ით — დოლარის სტეიბლქოინით — ესქროუში, სადაც თქვენი პირობებია ჩაწერილი. გაუქმებისას თანხა ავტომატურად ბრუნდება სტუმრის არჩეული კონტრაქტით. თანხას საკუთარ საფულეში იღებთ შესვლიდან 24 საათში, თუ სტუმარი ამ დროში დავას არ გახსნის. სტუმრებისთვის გადახდა უსაფრთხოების შემოწმების შემდეგ გაიხსნება — დაჯავშნეთ 15-წუთიანი დემო.
- Headline: სტეიბლქოინით გადახდა, გასაგები დაბრუნების წესით
- Description: დამფუძნებელი სასტუმროების პილოტი · თბილისი
- CTA: Learn more

**contracts**
- Primary: ერთი გაუქმების წესი ყველა სტუმრისთვის? 119 390 სასტუმროს ჯავშნის საჯარო მონაცემებში ჩვეულებრივი ჯავშნების 27% გაუქმდა (საერთო ჯამში 37%, გამოუცხადებლობისა და ჯგუფური ბლოკების ჩათვლით). Stumari ყოველ სტუმარს მოკლე მენიუს აჩვენებს — „მოქნილი", „სტანდარტული", „დაბრუნების გარეშე" — და თითოეულის ფასი ამ სტუმრის მოთხოვნისთვის ისეა გათვლილი, რომ მიზნად ისახავდეს თქვენს ამჟამინდელ მოსალოდნელ შემოსავალს. სტუმარი USDC-ით იხდის, დაბრუნება მისი კონტრაქტით ავტომატურად ხდება. კონტრაქტებსა და ფასის საზღვრებს თქვენ ირჩევთ. სტუმრებისთვის გადახდა უსაფრთხოების შემოწმების შემდეგ გაიხსნება.
- Headline: გაუქმების პირობები — ყველა სტუმრისთვის ცალკე
- Description: ფასის საზღვრებს თქვენ ადგენთ
- CTA: Learn more

**founding**
- Primary: დამფუძნებელი სასტუმროების პილოტი თბილისის პირველი 10 დამოუკიდებელი სასტუმროსთვის: Stumari-ს 0% საკომისიო ყველა ჯავშანზე 2026 წლის 31 დეკემბრამდე, შემდეგ 1,5%. სტუმარი USDC-ით იხდის, თქვენ კი თანხას თქვენს საფულეში იღებთ შესვლიდან 24 საათში, თუ სტუმარი დავას არ გახსნის. უფასო 20-წუთიანი დაყენება. ექსკლუზიურობის გარეშე, პილოტის დატოვება ნებისმიერ დროს შეგიძლიათ. სტუმრებს ჩვენ არ მოგიყვანთ — ეს გადახდის გვერდია იმ სტუმრებისთვის, ვინც უკვე გყავთ. სტუმრებისთვის გადახდა უსაფრთხოების შემოწმების შემდეგ გაიხსნება.
- Headline: Stumari-ს 0% საკომისიო 2026 წლის ბოლომდე
- Description: 10 ადგილი · თბილისი
- CTA: Sign up

### Russian (RU)

**usdc**
- Primary: Некоторые гости, у которых карты не работают за границей, уже платят небольшим отелям Тбилиси в USDT — прямо на личный кошелёк владельца, без чека и без правил возврата. Со Stumari гость платит в USDC — долларовом стейблкоине — на эскроу, где записаны ваши условия. При отмене деньги возвращаются автоматически, по контракту, который выбрал гость. Вы получаете оплату на свой кошелёк через 24 часа после заезда, если гость не откроет спор за это время. Оплата для гостей откроется после проверки безопасности — запишитесь на демо на 15 минут.
- Headline: Оплата в стейблкоинах с понятными правилами возврата
- Description: Пилот для отелей-основателей · Тбилиси
- CTA: Learn more

**contracts**
- Primary: Одно правило отмены на всех гостей? В открытых данных по 119 390 бронированиям отелей отменились 27% обычных бронирований (37% в целом, с учётом неявок и групповых блоков). Stumari показывает каждому гостю короткое меню — «Гибкий», «Стандартный», «Невозвратный», — и цена каждого варианта рассчитана под его запрос так, чтобы быть нацеленной на ваш текущий ожидаемый доход. Гость платит в USDC, возврат идёт автоматически по его контракту. Контракты и границы цен выбираете вы. Оплата для гостей откроется после проверки безопасности.
- Headline: Условия отмены — под каждого гостя
- Description: Границы цен задаёте вы
- CTA: Learn more

**founding**
- Primary: Пилот для первых 10 независимых отелей Тбилиси: 0% комиссии Stumari с каждого бронирования до 31 декабря 2026 года, затем 1,5%. Гость платит в USDC, вы получаете деньги на свой кошелёк через 24 часа после заезда, если гость не откроет спор. Бесплатная настройка за 20 минут. Без эксклюзивности, уйти можно в любой момент. Гостей мы не приводим — это оплата для гостей, которые у вас уже есть. Оплата для гостей откроется после проверки безопасности.
- Headline: 0% комиссии Stumari до конца 2026 года
- Description: 10 мест · Тбилиси
- CTA: Sign up

### English (EN, optional small ad set)

**usdc**
- Primary: Some guests whose cards don't work abroad already pay small Tbilisi hotels in USDT, straight to the owner's personal wallet: no receipt, no refund rule. With Stumari, they pay in USDC, a dollar stablecoin, into an escrow that holds your terms. Refunds follow the contract they chose, automatically. You're paid to your own wallet 24 hours after check-in, unless the guest opens a dispute in that window. Guest checkout opens after our security review; book a 15-minute demo.
- Headline: Stablecoin payments with clear refund rules
- Description: Founding-hotel pilot · Tbilisi
- CTA: Learn more

**contracts**
- Primary: One cancellation policy for every guest? In a public dataset of 119,390 hotel bookings, 27% of ordinary bookings were cancelled (37% overall, including no-shows and group blocks). Stumari shows each guest a short menu, Flexible, Standard or Non-refundable, each priced for their request to target the same expected revenue as your current policy. Guests pay in USDC; refunds follow their contract automatically. You choose the contracts and the price bounds. Guest checkout opens after our security review.
- Headline: Cancellation terms priced per guest
- Description: You set the price bounds
- CTA: Learn more

**founding**
- Primary: Founding-hotel pilot for the first 10 independent hotels in Tbilisi: 0% Stumari fee on every booking until 31 December 2026, then 1.5%. Guests pay in USDC; you're paid to a wallet you control 24 hours after check-in, unless the guest opens a dispute. Free 20-minute setup. No exclusivity, leave anytime. We don't bring you guests: it's a checkout for the guests you already have. Guest checkout opens after our security review.
- Headline: 0% Stumari fee until the end of 2026
- Description: 10 places · Tbilisi
- CTA: Sign up

## 5. Campaign, audience and budget

**Campaign:** `Stumari – Pilot – Tbilisi`. Special Ad Categories: **none**. Meta's Advertising Standards (<https://transparency.meta.com/policies/ad-standards/>) require financial products and services, housing and employment ads to declare a Special Ad Category when the advertiser is in the United States or targets the United States, Canada or some European countries; the fourth category is social issues, elections or politics. A Georgian team targeting only Tbilisi is outside that scope. If Ads Manager nevertheless says the category applies to Georgia, declare **Financial products and services** and accept its limited targeting (fixed age range, broad location, fewer detailed options) rather than working around it.

**Objective:**
- **Week 1: Traffic** (optimise for landing page views), because the Pixel may not be live yet and it only fires after consent, so Meta will see few events.
- **Then: Leads** (conversion location *Website*, event **Lead**), once `NEXT_PUBLIC_META_PIXEL_ID` is set and a test application shows up as Lead in Events Manager → Test events. Meta's optimisation wants dozens of events a week; a 10-hotel pilot won't produce that, so if Leads under-delivers, go back to Traffic. The real measure is applications in `/admin` by `utm_content` (`usdc`, `contracts`, `founding`), and setup calls booked.

**Ad sets (one per language, each with the ads usdc, contracts, founding):**

| Setting | KA ad set | RU ad set | EN ad set (optional) |
|---|---|---|---|
| Location | Tbilisi, Georgia: "People living in this location" (not "recently in", which adds tourists). City, or a pin on the centre with ~15 km radius if Meta allows that minimum | same | same |
| Age | 25–65+ | 25–65+ | 25–65+ |
| Languages | Georgian, English (many owners use Facebook in English) | Russian | English |
| Detailed targeting (any of) | Behaviour: *Small business owners*. Interests: *Hotel*, *Hospitality industry*, *Hotel management*, *Bed and breakfast*, *Guest house*, *Hostel*, *Vacation rental*, *Booking.com*, *Airbnb*. Job titles: *Owner*, *Hotel manager*, *General manager* | same | same |
| Placements | Facebook + Instagram feeds, Stories, Reels. Exclude Audience Network (low-quality clicks for a B2B lead) | same | same |

Meta has removed and merged many detailed-targeting options over the years, and some of the above may be missing or tiny for Georgia; use what exists. If the audience is too small to deliver, drop job titles first, then let Advantage+ audience expand. Don't target people by nationality or any sensitive attribute.

**Test budget (a starting assumption, not a benchmark: we have no cost data for this audience):**
- KA ad set **20 GEL/day**, RU ad set **15 GEL/day**, EN ad set off or 5 GEL/day.
- Run **7 days ≈ 245 GEL** (280 GEL with EN), then decide.
- Day 3: pause any ad with fewer than half the clicks per impression of the best one in its ad set (once each has ~1,000 impressions).
- Day 7: keep the variant with the most **applications** per GEL, not the most clicks. If frequency passes ~3 per person, the audience is saturated: refresh the image or pause.
- Every Monday, write spend, impressions, clicks, applications and calls booked per variant into the lead notes, so the pitch video can quote real numbers.

## 6. Links with UTM parameters

```
# Paid ads usdc, contracts, founding → the 15-minute demo form
{SITE}{prefix}/apply?type=demo&utm_source=facebook&utm_medium=paid&utm_campaign=pilot_tbilisi_{lang}&utm_content=usdc
{SITE}{prefix}/apply?type=demo&utm_source=facebook&utm_medium=paid&utm_campaign=pilot_tbilisi_{lang}&utm_content=contracts
{SITE}{prefix}/apply?type=demo&utm_source=facebook&utm_medium=paid&utm_campaign=pilot_tbilisi_{lang}&utm_content=founding

# Organic posts 1 and 2 → the 15-minute demo form
{SITE}{prefix}/apply?type=demo&utm_source=facebook&utm_medium=organic&utm_campaign=post_{n}

# The page's website field → landing
{SITE}{prefix}?utm_source=facebook&utm_medium=organic&utm_campaign=page_profile

# Page "Sign up" button and post 3 → pilot application (20-minute setup call)
{SITE}{prefix}/apply?utm_source=facebook&utm_medium=organic&utm_campaign=page_button
{SITE}{prefix}/apply?utm_source=facebook&utm_medium=organic&utm_campaign=post_3
```

`{prefix}` = `/ka` or `/ru`, and empty for English (English pages are served without a prefix: `{SITE}/`, `{SITE}/apply`). `{lang}` = `ka`, `ru` or `en`. Paste the part after `?` into the ad's **URL parameters** field rather than the website URL, so Meta keeps them when you duplicate ads. Optional: `&utm_term={{placement}}` (a Meta dynamic parameter) to see Facebook vs Instagram placements.

**Check before launch:** open one ad link yourself, submit a test demo request, and check that `/admin` shows it with `utm_content`. The site keeps the first visit's `utm_*` and `ref` for the browser tab (session storage), so a visitor who lands on the landing page and then opens Apply still arrives tagged; paid ads still go straight to the demo form, one step shorter.

## 7. Compliance checklist (read before the first ad)

### Meta's cryptocurrency ads policy, and how it applies to Stumari

Source: Meta Advertising Standards → Restricted goods and services → **Cryptocurrency Products and Services**, <https://transparency.meta.com/policies/ad-standards/restricted-goods-services/cryptocurrency-products-and-services/> (read 2026-09-27; its changelog's latest dated entry is Apr 15, 2026). Our summary:

- **Needs Meta's prior written permission:** ads for crypto exchanges or trading platforms, crypto borrowing or lending, wallets that also let people buy, sell, swap or stake, mining software, and solicitation to invest in crypto. The policy's opening rule also covers services and products "that enable monetisation, reselling, swapping or staking of cryptocurrencies".
- **How permission is granted:** through Business Suite → Authorizations and Verifications, by submitting a recognised regulatory licence or registration. The jurisdictions on Meta's list (27 on the date we read it) do **not** include Georgia, and do not list the EU/MiCA as such. **Stumari holds no such licence, so written permission is not available to us.**
- **No permission needed:** events, education or news about crypto or blockchain; products built on blockchain that are not a virtual currency; storage-only wallets; tax services for crypto companies; mining hardware; and crypto products and services that cannot be used to buy, sell or trade.
- **Payments, stablecoins and checkouts are not mentioned anywhere in the policy.**

**What applies to us (our reading, not legal advice and not a Meta ruling):** Stumari is B2B checkout software for hotels. It does not offer an exchange, trading, swapping, staking, lending, a wallet or an investment, and nobody can buy or sell crypto through it; the payment currency is simply USDC. So it matches none of the listed categories that need permission. But the opening rule is broad, Meta reviews the **ad together with its landing page** (Advertising Standards introduction, <https://transparency.meta.com/policies/ad-standards/>), and the landing page names USDC, USDT and swapping inside Phantom. **Expect a real chance that some ads are rejected or classed as crypto ads.** Plan the budget and the calls so the pilot does not depend on ads.

**How we write ads so they stay about hotel payments, without misleading:**
- Lead with the hotel problem (cancellations, payouts, card-blocked guests), not with crypto.
- Name USDC plainly at least once. Never hide or disguise that payment is in a stablecoin: that would mislead hotel owners and would count as evading Meta's review.
- Keep trading words out of ads: *buy, sell, trade, swap, exchange, invest, earn, profit, yield, price of*, coin or chart imagery, "crypto" as a hook. (The **usdc** variant names USDT in its headline, so if Meta rejects one ad it is the likeliest; the other two keep running.)
- Don't mention swapping USDT to USDC in ads.

**If an ad is rejected:** request one review in Account Quality with a factual note, for example:
> "Stumari is B2B checkout software for hotels in Tbilisi. Hotels receive booking payments from guests in USDC, a dollar stablecoin. Stumari does not offer exchange, trading, swapping, staking, lending, wallets or investment products, and does not let anyone buy or sell cryptocurrency. This ad invites hotel owners to apply to a payments pilot."

If the rejection stands, stop. Don't resubmit lightly edited copies again and again, don't send reviewers to a different page than users (cloaking), and don't open new ad accounts: Meta prohibits helping anyone evade its enforcement, and repeated rejections can restrict the ad account and the page. Fall back to calls, organic posts and referrals.

### Every ad, every time

- [ ] Numbers exactly as on the landing page: 27% of ordinary bookings, 37% overall including no-shows and group blocks (with the 119,390-booking dataset named); 1,579,764 visitors from Russia in 2025, never rounded; 0% until 31 December 2026, then 1.5%; 1,500 USDC per-booking cap; payout 24 h after check-in unless the guest opens a dispute.
- [ ] No promise of new guests, more bookings, guaranteed or higher revenue, lari payouts, or legal/tax compliance. Prices "target" expected revenue.
- [ ] No "travel app" or "escrow app". Say "stablecoin checkout".
- [ ] "0% fee" always means the **Stumari** fee.
- [ ] No claim that real-money bookings are live today; it is a pilot you apply to. Guest checkout opens after the security review, the call to action is the demo or pilot form, and no ad or post links to a checkout page (`/h/…`).
- [ ] Don't address the viewer's personal characteristics ("Are you a Russian…", "Struggling with debt?"). "For hotel owners in Tbilisi" is fine. ("Privacy Violations and Personal Attributes", under Objectionable content in the same Advertising Standards.)
- [ ] The landing page loads, is in the ad's language, and says the same thing as the ad.
- [ ] The Pixel fires only after the visitor accepts the consent banner, the privacy page names the Meta Pixel, and **Automatic advanced matching is OFF** for the pixel in Events Manager.
- [ ] KA/RU copy read once by a native speaker.
