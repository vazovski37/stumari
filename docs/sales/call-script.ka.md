# სატელეფონო სკრიპტი (ქართული) — თბილისის დამოუკიდებელი სასტუმროები, 5–8 წუთი

> **DRAFT — founders confirm before use.** Georgian version of [call-script.md](call-script.md), written to be spoken, not read. Everything promised must be in [offer.md](offer.md); pushback answers are in [objections.ka.md](objections.ka.md); log every call in [leads.csv](leads.csv) (see [call-sheet.md](call-sheet.md)). Numbers are identical to the English sources. *Machine-drafted — a native speaker reads it aloud once before the first call and fixes anything that sounds stiff.*
>
> Stage directions are in English; everything in quotes is what you say.

**Goal:** book the free 20-minute setup/demo call. Don't onboard on this call.
**Before dialling:** landing page open (`/ka`), `{SITE}/model` (how prices are set), and the demo screenshots in [e2e-report.md](../plan/e2e-report.md). Guest checkout on the public site is not open yet, so there is no demo link to send; to show the checkout live, run it on your laptop (section 4).

## 1. გახსნა (30 წმ)

> „გამარჯობა, {სახელი} გაწუხებთ, Stumari-დან. პატარა თბილისური გუნდი ვართ. ორი წუთი გაქვთ? ერთი მოკლე კითხვა მაქვს იმ სტუმრებზე, ვინც კრიპტოვალუტით იხდის."

If no: „როდის დაგირეკოთ, უფრო მოსახერხებელი იქნება?" — log `next_date`, thank them, hang up.

## 2. გამოკითხვა (2 წთ) — ჰკითხეთ, მოუსმინეთ, ჩაიწერეთ

1. **OTA საკომისიო:** „დაახლოებით ჯავშნების რა ნაწილი მოდის Booking.com-იდან ან Airbnb-იდან, და რამდენ საკომისიოს უხდით?"
   *(Typical: 15–25% base, 25–30% with visibility boosters. Only say these if they ask.)*
2. **კრიპტოთი გადამხდელი სტუმრები:** „გყავთ სტუმრები, ვისაც ბარათი არ უმუშავებს — მაგალითად, რუსული ბარათებით — და USDT-ით ან სხვა კრიპტოთი გადახდას გთხოვენ? ახლა როგორ აგვარებთ?"
   - Listen for: *„USDT-ს ჩემს (ან ძმის) საფულეზე მირიცხავენ."* That is the day-one use case. Log `accepts_crypto` = `no` / `sometimes` / `often`.
3. **გაუქმებები:** „რა ხდება, როცა სტუმარი ბოლო წუთს აუქმებს ან საერთოდ არ მოდის? თქვენი გაუქმების წესი ყველა სტუმარს ერგება?"
4. **კალენდარი:** „კალენდარს რა სისტემით მართავთ — OtelMS, Exely, Mews, Cloudbeds, Beds24, სხვა რამე, თუ უბრალოდ Booking.com-ის ექსტრანეტით? Booking.com-ზე ყოველი ოთახი ცალკე განცხადებაა, თუ ერთი ტიპი გაქვთ რამდენიმე ოთახით?"
   Log `channel_manager` (e.g. `none`, `otelms`, `exely`, `mews`) and write `ical_single_unit=yes/no` in `notes`. Then answer by case:
   - **No system, one room per listing** → „მაშინ კალენდრებს iCal-ით პირდაპირ დავაკავშირებთ, დაყენების ზარზევე."
   - **„Mews / OtelMS / Exely გვაქვს"** →
     > „ავტომატურად ჯერ ვერ ვუკავშირდებით — ყოველი სისტემა ცალკე ინტეგრაციაა და მათთან ვსაუბრობთ. მანამდე ასე ვმუშაობთ: როცა სტუმარი Stumari-ზე იხდის, შეტყობინება მოგვდის, თქვენს სისტემაში თარიღებს ვამოწმებთ, ჯავშანს იქ ვწერთ და მერე ვადასტურებთ. ორიოდე წუთი სჭირდება. თუ ოთახი დაკავებული აღმოჩნდა, არ ვადასტურებთ და სტუმარს მთელი თანხა ავტომატურად უბრუნდება 2 საათში. დაბრუნებაზე თქვენ არაფრის გაკეთება არ მოგიწევთ."
   - **Several identical rooms as one type, no system** → „სანამ რამეს დაგპირდებით, ექსტრანეტს დაყენების ზარზე ერთად შევხედავთ." Do not promise iCal.
   - Never promise a date for an automatic integration.

## 3. მოკლე წარდგენა (30 წმ)

Lead with their answer to question 2. Say it, don't read it.

> „ახლა ეს სტუმრები პირად საფულეზე გიხდიან: ქვითარი არ არის, თანხის დაბრუნება ხელით ხდება. ამის ნაცვლად Stumari-ს ბმული გაუგზავნეთ. სტუმარი ირჩევს პირობას — მაგალითად, „მოქნილს" ან „დაბრუნების გარეშე" — და USDC-ით იხდის ესქროუში, სადაც თქვენი დაბრუნების წესებია ჩაწერილი. თუ გააუქმა, თანხა ავტომატურად ბრუნდება. თუ არა, ფული თქვენს საფულეში შემოდის შესვლიდან 24 საათში, თუ სტუმარი ამ დროში დავას არ გახსნის. Booking.com თქვენთან რჩება, სტუმრებს ჩვენ არ მოგიყვანთ. თბილისის პირველი 10 სასტუმროსთვის: 0% საკომისიო 2026 წლის ბოლომდე, მერე 1,5%."

Only if they ask:
- „სტუმარს SOL არ სჭირდება — ქსელის საკომისიოს ჩვენ ვიხდით."
- „კალენდრები Booking.com-თან და Airbnb-თან სინქრონდება, და ყოველი ჯავშანი მოლოდინის რეჟიმშია, სანამ კალენდარს ხელახლა არ შევამოწმებთ." ([ორმაგი ჯავშანი](objections.ka.md))

## 4. დემო (2–3 წთ — ეკრანის გაზიარებით, დამფუძნებლის ლეპტოპიდან)

Skip if they're short on time; offer the 15-minute demo instead (`{apply_link}`, section 6). Guest checkout on the public site is **not open yet** (`/h/*`, `/b/*`, `/my` show "Checkout is not open yet"), so **never send a demo checkout link**. Show it one of two ways:

- **Live on the local chain**, screen-shared from the founder's laptop. Before the call: `pnpm --filter @stumari/scripts bootstrap --cluster localnet`, then `pnpm dev` (and `pnpm --filter web cron` in a second terminal), open `http://localhost:3000/h/stumari-demo` ([runbook section 3](../plan/runbook.md#3-local-development)) and fund the test wallet ("Get 500 test USDC"). Share only that browser window.
- **Screenshots** from [e2e-report.md](../plan/e2e-report.md) ([e2e-screens/](../plan/e2e-screens/)), plus `{SITE}/model` for how prices are set.

> **Restore later:** once devnet has a public URL, put the live demo link (`{SITE}/h/stumari-demo`) back into this section and the "send me info" follow-up.

1. **Landing page** (`/ka`): „ასე ხედავს სასტუმრო. აქ პილოტის პირობებია და განაცხადის ღილაკი."
2. **Demo checkout** (`/h/stumari-demo`, local): pick dates ~5 days out (so cancelling shows a 50% refund) → **See prices** → three contracts.
   > „თქვენი ახლანდელი წესი ზუსტად თქვენს ჩვეულებრივ ფასად ღირს. „მოქნილი" ცოტა ძვირია, „დაბრუნების გარეშე" — იაფი, ამ სტუმრის გაუქმების შეფასებული რისკის მიხედვით. ფასი ისეა გათვლილი, რომ რომელიც არ უნდა აირჩიოს, მიზნად ისახავდეს თქვენს ამჟამინდელ მოსალოდნელ შემოსავალს. ეს მიზანია და არა გარანტია. რამდენად შეიძლება ფასი შეიცვალოს, თქვენ წყვეტთ."

   Pick **Standard**, pay with the **Test wallet** (not real money).
3. **Booking page** (`/b/{id}`): show status, the terms timeline, "refund if you cancel now". Open the **Explorer link** (local chain):
   > „ეს ესქროუ ანგარიშია. აქ ინახება ამ ჯავშნის ფული და მისი წესები."

   Wait for **Confirmed** (a pending booking always refunds 100%).
4. **Cancel**: the refund arrives at once by the schedule. Standard = 100% more than 7 days before check-in, 50% between 7 and 3 days. Show the transaction on Explorer:
   > „სტუმრის დაბრუნება და სასტუმროს წილი ერთ ტრანზაქციაში გადაიხადა. არავის არაფრის დადასტურება არ დასჭირდა."

Say plainly: „ეს სატესტო ქსელზე გაშვებული დემოა, სატესტო ფულით. სტუმრებისთვის გადახდა ჯერ არ არის გახსნილი; რეალური ჯავშნები უსაფრთხოების შემოწმების შემდეგ დაიწყება." Give no date the founders haven't confirmed.

## 5. დასრულება (1 წთ)

> „დაყენებას 20-წუთიანი ზარი სჭირდება: ვაკავშირებთ კალენდრებს, ვწერთ ოთახებსა და ფასებს, და თუ საფულე არ გაქვთ, დაყენებაში დაგეხმარებით. {დღე}, {საათზე} მოგიხერხდებათ?"

- **დიახ** → confirm time and channel (WhatsApp / Telegram / in person). Ask them to have ready: room types with nightly rates in USD, check-in/out times, their Booking.com/Airbnb extranet (they log in themselves). Send the confirmation below, then follow [onboarding-checklist.md](onboarding-checklist.md).
- **ახლა არა** → „მოკლე აღწერას ხომ არ გამოგიგზავნით, ერთ გვერდზე?" Send the Georgian [one-pager](one-pager.md#ქართული) plus the apply link.
- **არა** → „გმადლობთ. თბილისში ვის შეიძლება გამოადგეს, ხომ ვერ მირჩევთ?" Log it.

## 6. შემდგომი შეტყობინებები

Fill in `{…}` before sending. Send only the apply/demo link, never a checkout link. `{apply_link}` = `{SITE}/ka/apply?type=demo&utm_source=call&utm_medium=phone` (see [call-sheet.md](call-sheet.md#the-link-to-send)).

**„დიახ"-ის შემდეგ (დაყენება დაჯავშნილია)**
> გამარჯობა, {name}! გმადლობთ საუბრისთვის. ვადასტურებ 20-წუთიან დაყენებას {date}-ს, {time}-ზე. გთხოვთ, მოამზადოთ: ოთახების ტიპები ღამის ფასით USD-ში, შესვლისა და გასვლის დრო და წვდომა Booking.com/Airbnb-ის ექსტრანეტზე (შედიხართ თქვენ, პაროლი ჩვენ არ გვჭირდება). თუ კრიპტოსაფულე ჯერ არ გაქვთ, Phantom-ს ერთად დავაყენებთ. პილოტის პირობები: {SITE}/ka#pilot — {your name}, Stumari

**„გამომიგზავნეთ ინფორმაცია"-ს შემდეგ**
> გამარჯობა, {name}! როგორც შევთანხმდით, აი Stumari-ს მოკლე აღწერა: {one_pager_text}. თუ დაგაინტერესებთ, აქ დატოვეთ ნომერი და 15-წუთიანი დემოს დროზე შევთანხმდებით: {apply_link} — {your name}

**უპასუხოდ დარჩა (მეორე ცდა, 2–3 დღეში)**
> გამარჯობა, {name}! გწერთ {your name}, Stumari-დან (თბილისი). ვეხმარებით სასტუმროებს, მიიღონ სტეიბლქოინით გადახდა იმ სტუმრებისგან, ვისაც ბარათი არ უმუშავებს: თანხის ავტომატური დაბრუნებით და თანხის ჩარიცხვით თქვენს საკუთარ საფულეზე. პირველი 10 სასტუმროსთვის Stumari-ს საკომისიო 0%-ია 2026 წლის ბოლომდე. ამ კვირაში 5-წუთიანი საუბარი მოგიხერხდებათ?
