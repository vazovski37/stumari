# Can a Georgian hotel take USDC/USDT as payment?

Research of 2026-10-01. Primary sources: matsne.gov.ge (consolidated texts fetched on this date), nbg.gov.ge, Revenue Service and Ministry of Finance acts. Secondary sources: law-firm and accounting-firm notes from 2025–2026, plus news. Every source and its date is in the list at the end. Sources older than 2023 are marked **(pre-2023)**.

**This is research, not legal, tax or financial advice.** Several points below are unsettled. A Georgian lawyer and the hotel's accountant should confirm them before anyone relies on them.

Labels used below: **Law** (what a statute or regulation says, with the article), **Practitioners** (what firms or market participants say), **Unclear** (no guidance found).

## Bottom line

- **On the plain text of the law, a hotel taking USDC or USDT straight into its own wallet as payment for a room is a prohibited payment.** Organic Law on the National Bank of Georgia (NBG), Art. 39¹, in force since 2023-01-01, says a virtual asset is not legal tender and that payments with virtual assets are prohibited. The only exceptions are cases the NBG defines as necessary for virtual-asset services. The NBG treats stablecoins as virtual assets. The rule applies the same way to an LLC, an individual entrepreneur (IE) and a small-business status holder.
- **We found no merchant-specific penalty and no enforcement against a merchant, and crypto acceptance is openly marketed in Georgia. That is not the same as legality.** A breach can still have consequences: the payment term could be void (Civil Code Art. 54), and banks or VASPs could refuse to convert or receive the funds.
- **The structure practitioners describe as lawful:** an NBG-registered VASP takes the guest's crypto, exchanges it, and pays the hotel in GEL through an acquirer (NBG Order 94/04, Art. 1(7)). In that structure the hotel never receives crypto.
- A hotel that only sells its own rooms is not a VASP and not an AML "accountable person". It must not exchange, hold or forward crypto for guests.
- Tax does not depend on how the guest pays. The booking is taxable income: VAT at 18% once taxable supplies pass GEL 100,000 in any 12 months; LLC profit tax of 15% only when profit is distributed; 1% turnover tax for an IE with small-business status. No official GEL rate exists for USDC.
- **Ask the accountant:** how to value USDC in GEL and on which date, the VAT invoice, small-business treatment, and what records to keep. **Ask a lawyer:** whether any structure that complies with Art. 39¹ fits the booking flow, before accepting USDC.

## 1. Legal tender, currency rules, pricing

**Law**
- Lari is the only legal tender on the territory of Georgia. The exceptions are free industrial zones, duty-free points and cases the NBG defines (Organic Law on the NBG, Art. 34(2)).
- **Pricing.** Since 2017-07-01, an entrepreneur offering or advertising goods or services in Georgia must state the price only in lari (Art. 34(2¹), added by Organic Law No 238 of 2016-12-29). The NBG may set different rules (Art. 34(2²)).
- NBG Order No 93/04 (2017-06-22, in force 2017-07-01) **(pre-2023; latest consolidation 2018-02-23)** lists the exceptions. Three of them are relevant to hotels:
  - Art. 1(a): sale of air tickets, **hotel and tourist services "if this is carried out in a foreign language"** (`ავიაბილეთების რეალიზაციასთან, სასტუმროს და ტურისტულ მომსახურებასთან, თუ აღნიშნული ხორციელდება უცხოურ ენაზე`).
  - Services provided **to a non-resident** (`არარეზიდენტისათვის მომსახურების გაწევასთან`).
  - Services paid **in foreign currency through a foreign payment system**.
- Breaking the lari-pricing rule is an administrative offence (Code of Administrative Offences, Art. 153⁷). The first breach gets a warning, the second a GEL 1,000 fine, and each later breach a GEL 5,000 fine. A 2017 news report says the Revenue Service enforces it **(pre-2023)**.
- **Crypto-specific rule.** Art. 39¹ was added by Organic Law No 1790 of 2022-09-09 and has been in force since 2023-01-01:
  > 1. ვირტუალური აქტივი არ წარმოადგენს გადახდის კანონიერ საშუალებას. 2. აკრძალულია ვირტუალური აქტივით გადახდების განხორციელება, გარდა საქართველოს ეროვნული ბანკის სამართლებრივი აქტით განსაზღვრული იმ შემთხვევებისა, რომლებიც საჭიროა ვირტუალური აქტივის მომსახურების განსახორციელებლად.
  >
  > (1. A virtual asset is not legal tender. 2. Payments with virtual assets are prohibited, except for cases set by a legal act of the NBG that are necessary to provide virtual-asset services.)
- The NBG's own FAQ restates the prohibition. The only exception it names is a VASP taking its fee in the same virtual asset.
- **Is USDC a "virtual asset"?** The statutory definition (Art. 2) excludes "digital representations of fiat currencies". A 2023 PMC Research paper argued that this made fiat-backed stablecoins ambiguous, while NBG staff told its author that stablecoins are covered. Since March 2026 the question looks settled in practice: NBG Order 52/04 defines a "stable virtual asset" as a *convertible virtual asset* pegged to a fiat currency or another asset. So the NBG treats USDC and USDT as virtual assets.
- Organic Law No 1141 of 2025-12-09 amended the definitions and VASP supervision. It did not change Art. 34 or Art. 39¹.

**Pricing in practice.** A hotel can probably show a USD price on a foreign-language page, or to non-resident guests, under Order 93/04. A price "in USDC" is not a price in a currency, and Order 93/04 does not cover it. The safe approach is to show the GEL price, and the USD price where an exception applies.

**Payment, barter, or something else?**
- **Law, NBG Act:** the NBG Act calls it a "payment with a virtual asset", which Art. 39¹ prohibits.
- **Law, Tax Code:** crypto is not "goods" (Art. 160(2)). Transferring ownership of money or crypto is not a "service" (Art. 160¹(4)(b)). For VAT there is therefore one supply, the room, and the crypto is the consideration. It is not two supplies swapped as in a barter.
  - The Revenue Service may use the market price for an exchange of goods or services (Art. 73(8)). Whether it would do so for crypto consideration: **Unclear**.
  - MoF Public Ruling No 201 (2019) **(pre-2023)** treats exchanging crypto for money like a transfer of money for VAT.
- **Unclear, civil law:** we found no crypto-specific rule. Civil Code Art. 54 makes a transaction void if it breaks a statutory prohibition. Nobody we found has analysed whether that voids the payment term of a booking, the whole booking, or nothing.

**Unclear: territorial reach.** Does Art. 39¹ catch a non-resident guest who pays on-chain from abroad to a Georgian company's wallet for a stay in Georgia? On the plain text, probably yes. The text has no territorial limit, and the service and the recipient are both in Georgia. No guidance was found.

## 2. Crypto-asset regulation (VASPs)

**Law**
- A VASP is a person that provides a virtual-asset service *for the benefit of another person* (Organic Law on the NBG, Art. 2; the AML Law mirrors this).
- After the 2025-12-09 amendment, virtual-asset services cover:
  - exchanging convertible virtual assets for fiat, other virtual assets or financial instruments;
  - **transfer**;
  - **safekeeping or administration that gives control over the asset**;
  - portfolio management, running a trading platform, lending, initial offerings, and other services the NBG defines.
- **Registration and supervision**
  - Registration with the NBG has been mandatory since 2023. The registration rule is NBG Order 94/04 of 2023-06-13, in force 2023-07-01, consolidated to 2026-08-26.
  - A VASP must be a Georgian LLC or JSC (Art. 1(5)). Providing virtual-asset services without registration is prohibited (NBG statement of 2025-10-07).
  - Since 2026-01-01, VASPs must display their NBG registration act.
  - NBG statement of 2026-09-08: minimum capital applies from 2027-09-01 (GEL 150,000 for exchange or transfer), and risk-management rules from 2027-07-01.
- **The only published exceptions to Art. 39¹** are in Order 94/04:
  - Art. 1(7): a VASP may, on the customer's instruction, send the GEL or foreign-currency proceeds of an exchange, non-cash, to the payee's payment service provider, intermediary or acquirer (including a sub-acquirer) in the service scheme.
  - Art. 1(8): a VASP may take its fee in the virtual asset it services.
  - **There is no exception for merchants.**

**Practitioners**
- LLC Law (Zurab Loria, 2026-08-25): merchants cannot accept crypto "as a direct payment". The lawful model is a registered VASP gateway that exchanges the crypto, with an acquirer settling the merchant in fiat under Art. 1(7).
- Andersen Georgia (2025-08-03) also reads the text as a prohibition. It calls applying it to goods and services impractical, but leaves the point open.

**Does a business holding crypto in its own wallet count as a VASP?**
- **Law:** no, as long as it acts only for itself. Holding crypto is not prohibited. Companies and individuals buy and sell through registered VASPs, and TBC Bank has offered crypto trading with Bybit since May 2026.
- It becomes VASP activity if the hotel does any of these for guests: exchanges their crypto for cash, keeps crypto deposits for them, or forwards crypto on their behalf.
- Enforcement is real for unregistered VASPs. On 2026-08-12 the Investigation Service of the Ministry of Finance arrested the manager of an unregistered crypto-cash exchange (Criminal Code Art. 192, illegal entrepreneurship; reported by Crypto Briefing).

**NBG statements about merchants:** we found none specific to merchants. The FAQ restates the payment prohibition. The NBG has also issued:
- a general warning on virtual currencies (2017) **(pre-2023)**;
- a warning against unregistered VASPs (2025-10-07);
- a crypto-pyramid warning (2026-07-31).

**Direction of travel**
- NBG Order 52/04 (2026-03-06) lets registered VASPs issue stablecoins, including GEL-pegged ones.
- Tether and the government announced a lari stablecoin, "GELT", on 2026-05-25. It was described as supporting "digital payments in Georgia".
- Art. 39¹ was still unchanged in the texts we read. Watch for an NBG act or a law that creates a payment exception.

## 3. Tax

**Law (Tax Code, consolidated 2026-09-30)**
- **Crypto in VAT.** Crypto is not goods (Art. 160(2)). Transferring crypto is not a service (Art. 160¹(4)(b)).
- **VAT on the room**
  - Registration is mandatory once taxable supplies exceed **GEL 100,000 in any continuous 12 months** (Art. 165(1)). The rate is **18%** (Art. 166).
  - Hotel accommodation is supplied in Georgia. For property-related services the place of supply is where the property is (Art. 162¹(4)). For non-business guests it is where the supplier is established (Art. 162¹(3)(b)).
  - So a foreign guest does not turn the stay into an export.
- **LLC profit tax ("Estonian model").** The rate is 15% (Art. 98(1)). It is charged on distributed profit, on expenses unrelated to the business, on free supplies, and on excess representation costs (Art. 97(1)). Retained profit is not taxed. Andersen (2026) adds that dividends to individuals carry a 5% withholding tax.
- **Valuation.** Foreign-currency operations are converted at the NBG official rate on the day of the operation (Art. 73(10)). **USDC is not a foreign currency, and the NBG publishes no crypto rate.** Income received in non-monetary form is recognised at the same moment as monetary income (Art. 136(10)).
- **Individual entrepreneur**
  - General income tax is 20% (Art. 81(1)).
  - **Small-business status** is available only to an individual entrepreneur (Art. 88(1)). The rate is 1% of Georgian-source turnover up to GEL 500,000 a year, and 3% above that (Art. 90).
  - The status is lost after two years over GEL 500,000. It is also lost after **three cash-register fines in a calendar year** (Art. 89(2)(d)).
  - The holder keeps a special journal (Art. 91(1)) and files and pays monthly by the 15th (Art. 93(1¹)).
  - **Micro business:** turnover up to GEL 30,000, no employees, exempt from income tax (Arts. 84, 86).
- **Activities excluded from small-business status** (Government Resolution No 415 of 2010-12-29, Annex 4; consolidated to 2025-01-27): activities needing a licence or permit, currency operations, medical, legal, audit and consulting work, gambling, staffing, and excise production.
  - Hotel or accommodation services are **not** on the list.
  - **But** Annex 5 puts "leasing out property" outside the 1% regime. Whether a guesthouse is selling an accommodation service or leasing property therefore matters.
  - Separately, an individual renting out residential space for living purposes can pay a flat 5% with no deductions (Art. 81(2)). Whether short-term guest stays qualify is a question for the accountant.
- **Individuals selling crypto.** MoF Public Ruling No 201 of 2019-06-28 **(pre-2023)** says an individual's income from supplying crypto is not Georgian-source income, so no personal income tax. It also says exchanging crypto for money is outside VAT.
  - This rests on the ruling, not on a Tax Code article. The Tax Code mentions crypto only in Arts. 160 and 160¹.
  - It covers selling crypto. It does not cover income from selling rooms that happens to be paid in crypto.
- **Advance ruling.** The Revenue Service can issue an advance ruling on a planned or completed operation, on application (Art. 47).

**Practitioners**
- Gegidze (accounting firm), 2025-11-26 and 2025-12-03:
  - Crypto earned from business is IE turnover or LLC income, declared like fiat.
  - It is valued on the day it reaches the wallet.
  - They say to use an "official Revenue Service exchange rate". **We found no Revenue Service rate for crypto; treat this as unverified.**
- Andersen Georgia (2026-04-01): crypto income retained in a company is not taxed until distributed. Buying, selling and exchanging crypto is outside VAT.

**Unclear / no guidance found**
- No Revenue Service ruling on a business receiving crypto for goods or services.
- No approved valuation source. A common working approach is the USD amount times the NBG USD/GEL rate on the day of receipt. That is the accountant's call, not a rule.
- How to treat the gain or loss when the USDC is later sold for GEL.
- Whether an IE's crypto gain counts as small-business turnover.
- Accounting classification. The IFRS Interpretations Committee (June 2019) **(pre-2023)** treats crypto holdings as intangible assets or inventory, not cash. Whether that applies to a given hotel's books is for the accountant.

## 4. AML/KYC and sanctions

**Law**
- **AML.** The AML Law (No 5226 of 2019, consolidated 2026) lists the "accountable persons" in Art. 3:
  - financial institutions, including banks, payment service providers, currency exchange offices and **VASPs**;
  - lawyers, notaries, accountants and auditors;
  - gambling and lottery organisers;
  - dealers in precious stones and metals;
  - two public bodies.
- **Hotels are not on the list.** The customer-due-diligence triggers, such as the GEL 15,000 occasional-transaction threshold (Art. 11), bind accountable persons, not hotels. General criminal law on money laundering applies to everyone.
- **Effect at conversion time.** VASPs must attach originator and beneficiary information to transfers (Art. 17¹). When the hotel converts through a VASP, that VASP will run KYC on the hotel and check where the USDC came from.
- **Georgia's sanctions position**
  - Georgia has not adopted national sanctions against Russia. This is widely reported; we did not find or check a Georgian sanctions act.
  - The NBG makes the institutions it supervises (banks, VASPs and others) apply US, EU and UK financial sanctions (NBG Order 208/04 of 2023-08-04). NBG statement of 2023-06-28: the financial sector "complies with all regulations".
  - On 2023-09-19, Order 253/04 added a carve-out for Georgian citizens without a Georgian court conviction. FNF reported (September 2023) that the commercial banks said they would keep applying international sanctions anyway.
  - The hotel is not NBG-supervised, but its bank and its VASP are.

**Sanctions exposure in practice**
- **Russian citizens are not sanctioned as such.** The risk comes from listed persons and from tainted sources of funds.
- In 2026 the EU (21st package, July) and the UK (May) sanctioned Georgia-registered, Russia-focused crypto exchanges: Aifory, Abcex, Rapira and Arvix (Exnode). The NBG says none of them was registered with it.
- EU rules bind EU persons and EU crypto-asset service providers, not a Georgian hotel. They ban crypto-asset services to Russian nationals and residents, and transactions in the A7A5 ruble stablecoin (Baker McKenzie, 2026-09-22). A Georgian hotel's counterparties may be bound by them.
- **Issuers can freeze tokens**
  - Circle's USDC Terms (2025-12-12): Circle may block addresses and freeze USDC linked to illegal activity, and may have to freeze on a valid legal order. Sanctioned persons are restricted.
  - Tether's terms (2026-02-26): Tether may freeze tokens and blacklist addresses.
  - A frozen hotel wallet means lost revenue. Funds from a sanctioned exchange can also lead a VASP to refuse to convert them.
- **Banks**
  - Practitioner and exchange sources (2026) report that Bank of Georgia and TBC do not ban crypto-origin funds. They ask for source-of-funds documents, and an unexplained transfer can get an account frozen.
  - We found no published primary bank policy. Treat these reports as practitioner claims.
  - TBC launched in-app crypto trading with Bybit on 2026-05-09, so regulated crypto flows are not taboo for the bank.
- **Practical controls:** screen the payer's wallet, keep the guest's identity from check-in, refuse funds from sanctioned exchanges, and keep a record per booking that links the on-chain payment to the guest.

## 5. Fiscal receipts, cash registers, documentation

**Law**
- **Cash registers.** A cash register must record cash settlements with consumers (Tax Code Art. 259(2)).
  - Exemptions include settlements where a tax invoice or a strict-accounting document is issued (Art. 259(4)(a)), and micro-business holders (Art. 259(4)(c)).
  - Working without a cash register costs a GEL 200 fine (Art. 281). Three fines in a year cost an IE its small-business status (Art. 89(2)(d)).
- **Tax invoices.** A VAT payer issues a tax invoice to taxable buyers, and to final consumers on request. It can be on paper or electronic through rs.ge (Art. 180).
- **Coming change.** A unified system combining cash register and card terminal starts registering new devices from 2027-01-01. It is mandatory from **2028-05-01** and will cover cash and card payments (Georgia Today, 2026-06-23).

**Unclear:** whether a crypto payment counts as a "cash settlement" for Art. 259. The text speaks of cash. We found no Revenue Service guidance on crypto.

**How a hotel would likely document a crypto-paid booking** (practice, not a legal requirement; the accountant decides):
- a booking confirmation or invoice in GEL that names the guest (USD may be shown alongside where Order 93/04 allows);
- the on-chain transaction signature, the sender and receiving addresses, the token and the amount;
- the GEL value and the rate source used on the day of receipt;
- a VAT invoice on request, if the hotel is a VAT payer;
- an entry in the special journal, if the owner is an IE with small-business status;
- the VASP statement for the later conversion to GEL.

## 6. Precedent

**Processor models that settle the merchant in GEL** (these match Order 94/04 Art. 1(7); the merchant does not hold crypto):
- **CityPay.io** (Tbilisi). Tether invested around 2021 **(pre-2023)**. It reports 600+ merchants, including hotels and restaurants.
  - In 2023, Binance Pay (Radisson in Georgia, 2023-04-06) and Gate Pay (2023-04-19) partnered with CityPay.
  - Third parties describe GEL settlement. We did not verify it with CityPay itself.
- **Keepz / AEON Pay.** Since 2025-10-15, AEON Pay has run crypto QR payments on the Keepz standard, which has 20,000+ merchants. AEON states that merchants are settled in GEL.
- **Revenue Service.** Taxes can be paid with crypto through Keepz (pilot 2024-12, announced 2025-03-25).
- **TBC Bank.** In-app crypto trading with Bybit (2026-05-09).

**Direct acceptance**
- Real-estate marketing pages (for example 1tab, 2026, and Batumi agencies) say developers accept BTC or USDT directly and call it legal. None of them discusses Art. 39¹.
- We found no Tbilisi hotel publicly advertising direct crypto acceptance.

**Enforcement and warnings found**
- Arrest of an unregistered VASP manager (2026-08-12).
- NBG warnings: 2017 **(pre-2023)**, 2025-10-07 and 2026-07-31.
- EU and UK sanctions on Georgia-registered Russia-focused exchanges (2026).

**Not found:** any enforcement against a hotel, restaurant or developer for taking crypto under Art. 39¹, or any NBG statement aimed at merchants. That absence is not evidence of legality.

## What Stumari can say on a sales call

- "We don't give legal, tax or financial advice. Georgian law says crypto-assets are not legal tender, and as written it restricts paying for goods and services with them (Organic Law on the National Bank, Article 39¹). Please confirm your setup with a lawyer before you accept USDC."
- "However a guest pays, the booking is taxable income for your business. Your accountant decides how to value it in lari and how to record it."
- "If you convert USDC to lari, use a provider on the National Bank of Georgia's register of virtual-asset service providers."

Do not say any of these: "crypto payments are legal in Georgia", "tax-free", "no VAT", "the 1% tax covers this", "it works like a foreign-currency payment", or "Georgia has no sanctions, so Russian guests are fine".

## Open questions for a Georgian lawyer

1. Does Art. 39¹ apply when a non-resident guest pays a Georgian hotel on-chain from abroad? Does it apply to an IE as well as an LLC? Is there any reading under which a hotel receiving USDC as consideration is not "a payment with a virtual asset"?
2. What happens if a merchant breaches Art. 39¹?
   - Is there any administrative or criminal sanction? We found none in the Code of Administrative Offences.
   - Is the payment term void under Civil Code Art. 54, and could a guest reclaim the payment?
   - Could the NBG or the Revenue Service act against the hotel or its bank?
3. Would a flow where the guest's USDC goes to an NBG-registered VASP, which pays the hotel in GEL under Order 94/04 Art. 1(7), comply with the law?
   - Can the funds sit in a smart-contract escrow before that happens?
   - Who must be the VASP's customer: the guest or the hotel?
4. **Stumari's own status.** Under Art. 2 as amended on 2025-12-09 ("transfer", and "safekeeping/administration that gives control"), is Stumari a VASP? The answer depends on whether its operator key can move or redirect escrowed funds, and on how refunds work. Does Stumari face any liability for facilitating payments that Art. 39¹ prohibits?
5. Can the checkout show prices in USD, or "USDC", under NBG Order 93/04 (foreign-language hotel services; services to non-residents)? Must a GEL price always be shown too?
6. If a hotel refunds a cancelled guest in USDC, could that count as the hotel providing a "transfer" for another person?
7. **Tax** (with the accountant):
   - Which valuation source and tax point would the Revenue Service accept?
   - Is crypto consideration subject to the barter market-price rule (Art. 73(8))?
   - For an IE with small-business status: are rooms an accommodation service or "leasing property" (Resolution 415, Annex 5)? Does a later crypto gain count as turnover?
   - Is it worth applying for an advance ruling (Tax Code Art. 47)?
8. **Sanctions:** does a Georgian hotel have any screening duty under Georgian law? Which EU or UK rules reach Stumari through any EU or UK staff, entity or service provider?
9. Is any draft NBG act or bill expected that would create a payment exception for stablecoins (for example around GELT)?

## Sources

**Georgian statutes and regulations** (matsne.gov.ge, consolidated texts read 2026-10-01)
1. Organic Law of Georgia on the National Bank of Georgia: Art. 2 (definitions), Art. 34 (lari, pricing), Art. 39¹ (virtual assets). Latest consolidation listed 2026-04-01. English: https://matsne.gov.ge/en/document/view/101044 · Georgian: https://matsne.gov.ge/ka/document/view/101044
2. Organic Law No 1790 of 2022-09-09 (added the virtual-asset definitions and Art. 39¹; in force 2023-01-01). https://matsne.gov.ge/ka/document/view/5562437
3. Organic Law No 1141-IVმს-XIმპ of 2025-12-09, published 2025-12-12 (new definition of virtual-asset service; Art. 52⁵; Arts. 34 and 39¹ unchanged). https://matsne.gov.ge/ka/document/view/6691908
4. NBG Order No 94/04 of 2023-06-13, VASP registration rule, Art. 1(5), 1(7), 1(8). Consolidated 2026-08-26. https://matsne.gov.ge/ka/document/view/5829496
5. NBG Order No 52/04 of 2026-03-06 (stablecoin initial offering), published and in force 2026-03-09. https://matsne.gov.ge/ka/document/view/6807568
6. NBG Order No 93/04 of 2017-06-22, exceptions to lari-only pricing; consolidated 2018-02-23 **(pre-2023)**. https://matsne.gov.ge/ka/document/view/3709140
7. Code of Administrative Offences, Art. 153⁷ (added by Law No 241 of 2016-12-29, in force 2017-07-01); consolidated 2026-09-17. https://matsne.gov.ge/ka/document/view/28216 · amending law: https://matsne.gov.ge/ka/document/view/3532484
8. Tax Code of Georgia, consolidated 2026-09-30: Arts. 47, 73, 81, 84–95, 97–98, 136, 160, 160¹, 162¹, 165, 166, 180, 259, 281. https://matsne.gov.ge/ka/document/view/1043717
9. Government Resolution No 415 of 2010-12-29 (special tax regimes; prohibited activities), consolidated to 2025-01-27. https://matsne.gov.ge/ka/document/view/1164635
10. Minister of Finance Public Ruling No 201 of 2019-06-28 (taxation of crypto-assets) **(pre-2023)**. https://matsne.gov.ge/ka/document/view/4601215
11. Law of Georgia on Facilitating the Prevention of Money Laundering and the Financing of Terrorism (No 5226), Arts. 3, 11, 17¹; consolidated 2026. https://matsne.gov.ge/ka/document/view/4690334
12. Civil Code of Georgia, Art. 54; consolidated 2026-06-25. https://matsne.gov.ge/en/document/view/31702
13. NBG Order No 253/04 of 2023-09-19, amending Order 208/04 (sanctions regimes for NBG-supervised accountable persons). https://www.matsne.gov.ge/ka/document/view/5922870

**National Bank of Georgia statements**
14. FAQ: virtual asset service providers (undated; read 2026-10-01). https://nbg.gov.ge/en/faq/125
15. "NBG has approved the Rule of Virtual Asset Service Provider Registration" (2023). https://nbg.gov.ge/en/media/news/the-national-bank-of-georgia-has-approved-the-rule-of-virtual-asset-service-provider-regis
16. "NBG urges citizens not to engage in virtual asset services with unregistered entities" (2025-10-07). https://nbg.gov.ge/en/media/news/national-bank-of-georgia-urges-citizens-not-to-engage-in-virtual-asset-services-with-unreg
17. "NBG develops regulation on virtual asset services" (stablecoins, 2026-03-10). https://nbg.gov.ge/en/media/news/the-national-bank-of-georgia-develops-regulation-on-virtual-asset-services
18. "NBG expands the supervisory framework for VASPs" (2026-09-08). https://nbg.gov.ge/en/media/news/the-national-bank-of-georgia-expands-the-supervisory-framework-for-virtual-asset-service-p
19. Warning on virtual currencies (2017-12-20) **(pre-2023)**. https://nbg.gov.ge/media/news/%E1%83%94%E1%83%A0%E1%83%9D%E1%83%95%E1%83%9C%E1%83%A3%E1%83%9A%E1%83%98-%E1%83%91%E1%83%90%E1%83%9C%E1%83%99%E1%83%98%E1%83%A1-%E1%83%92%E1%83%90%E1%83%A4%E1%83%A0%E1%83%97%E1%83%AE%E1%83%98%E1%83%9A%E1%83%94-2
20. "Natia Turnava: Actions taken by NBG are in full compliance with international sanctions" (2023-06-28). https://nbg.gov.ge/en/media/news/natia-turnava-actions-taken-by-nbg-are-in-full-compliance-with-international-sanctions

**Law-firm, accounting and policy notes**
21. LLC Law (Zurab Loria), "Crypto Payment Gateways in Georgia: VASP Registration and Fiat Settlement" (2026-08-25). https://www.llclaw.ge/en/news/crypto-payment-gateway-georgia
22. Andersen Georgia, "Georgia's Legal Framework for Virtual Asset Services" (2025-08-03). https://ge.andersen.com/georgia-virtual-asset-services/
23. Andersen Georgia, "Taxation of Crypto for Businesses in Georgia" (2026-04-01). https://ge.andersen.com/?p=7928
24. Andersen Georgia, "Small-Business Status (1% Tax Regime)" (2026-09-22). https://ge.andersen.com/1-tax-regime/
25. Gegidze, "Tax Reporting Requirements for Georgian IEs and LLCs Receiving Crypto Payments" (2025-12-03). https://www.gegidze.com/post/tax-reporting-requirements-for-georgian-ies-and-llcs-receiving-crypto-payments-declaration-guide
26. Gegidze, "How to Legally Accept Crypto Payments as a Georgian IE with 1% Tax Status" (2025-11-26). https://www.gegidze.com/post/how-to-legally-accept-crypto-payments-as-a-georgian-individual-entrepreneur-ie-with-1-tax-status
27. PMC Research Center (I. Nachkebia), "Stablecoins in Georgia" policy paper (2023). https://www.pmcresearch.org/policypapers_file/3f626437eaa96f467.pdf
28. Baker McKenzie, "European Union sanctions compliance for crypto-assets" (2026-09-22). https://www.bakermckenzie.com/en/insight/publications/2026/09/european-union-sanctions-compliance-for-crypto-assets
29. IFRS Interpretations Committee, agenda decision on holdings of cryptocurrencies (June 2019) **(pre-2023)**. https://www.ifrs.org/projects/completed-projects/2019/holdings-of-cryptocurrencies/
30. FNF South Caucasus, "Attempt to circumvent international sanctions" (September 2023). https://www.freiheit.org/south-caucasus/attempt-circumvent-international-sanctions

**Issuer terms**
31. Circle, USDC Terms (last updated 2025-12-12). https://www.circle.com/legal/usdc-terms
32. Tether, Terms of Service (last updated 2026-02-26). https://tether.to/en/legal/

**News and market**
33. Civil.ge, "National Bank Says EU-Sanctioned Georgia-Based Crypto Firms Not Under Its Regulation" (2026-07-24). https://civil.ge/archives/745745
34. Georgia Today, "National Bank: Sanctioned crypto companies not licensed by NBG" (2026-07-24). https://georgiatoday.ge/national-bank-sanctioned-crypto-companies-not-licensed-by-nbg/
35. Crypto Briefing, "Georgia's Investigation Service arrests manager of unregistered VASP" (2026-08-12). https://cryptobriefing.com/georgia-arrests-unregistered-vasp-manager/
36. Georgia Today, "Crypto Trading Now Available in TBC Mobile Banking" (2026-05-09). https://georgiatoday.ge/crypto-trading-now-available-in-tbc-mobile-banking/
37. Georgia Today, universal cash register system (2026-06-23). https://georgiatoday.ge/georgia-to-introduce-universal-cash-register-system-under-draft-amendments/
38. Batumelebi, rules on lari-only pricing (2017-06-23) **(pre-2023)**. https://batumelebi.netgazeti.ge/news/84604/
39. crypto.news, "Radisson hotel to accept Shiba Inu payments in Georgia" (Binance Pay + CityPay, 2023-04-06). https://crypto.news/radisson-hotel-to-accept-shiba-inu-payments-in-georgia/
40. crypto.news, "Gate Pay and City Pay partner…" (2023-04-19). https://crypto.news/gate-pay-and-city-pay-partner-to-allow-georgian-merchants-to-make-crypto-payments/
41. CBW, "Tether expands its presence in Georgia with investment in CityPay.io" (about 2021) **(pre-2023)**. https://cbw.ge/startup/tether-expands-its-presence-in-georgia-with-investment-in-citypayio
42. ChainCatcher, AEON Pay expands to Georgia on the Keepz QR standard, GEL settlement (2025-10-15). https://www.chaincatcher.com/en/article/2212751
43. The Fintech Times, "Keepz facilitates using digital currencies to pay for taxes in Georgia" (2025-03-25). https://thefintechtimes.com/keepz-facilitates-using-digital-currencies-to-pay-for-taxes-in-georgia/
44. Cointelegraph, Tether and the government of Georgia plan the lari-backed GELT (2026-05-25). https://cointelegraph.com/news/tether-georgia-government-plan-lari-backed-stablecoin-gelt
45. 1tab, "How to buy real estate in Georgia with crypto" (undated, 2026 footer). https://1tab.co/en/blog/georgia-real-estate/
