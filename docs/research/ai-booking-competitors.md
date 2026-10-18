# Competitors: AI booking for hotels

Research date: 2026-10-14. Public web only; most sources are vendor press releases repeated by trade press, so treat feature and adoption claims as the vendors' own. Complements [landscape.md](landscape.md) (2026-09-22), which covers the hackathon corpus and cancellation-pricing competitors.

Why this exists: the live pitch now leads with "guests ask AI where to stay" ([live-pitch-3min.md](../submission/live-pitch-3min.md)). That space filled up fast in 2026, so the pitch must not imply that making a hotel AI-bookable is new.

## Summary

Making a hotel visible and bookable inside ChatGPT, Claude and Gemini is now a crowded category. Channel managers (SiteMinder), revenue platforms (Lighthouse), booking engines (Mirai, RateGain, Zucchetti), PMSs (Apaleo) and startups (Agentic Hospitality) all ship MCP connectors. The OTAs (Booking.com, Expedia) and Google are there too.

Where Stumari is still different:

1. **Payment and the contract happen inside the agent conversation.** Most hotel-direct tools hand the guest a link to the hotel's own booking engine to finish (Lighthouse, SiteMinder Direct Booking MCP). Stumari's agent returns a transaction the AI's wallet signs; the money and the refund terms sit in escrow.
2. **Per-guest cancellation terms.** None of these tools price the cancellation policy per request. They expose the hotel's existing rate plans.
3. **Small hotels without the stack.** Every competitor plugs into an existing channel manager, CRS, booking engine or PMS. Most Tbilisi independents run OtelMS, Exely or nothing; neither OtelMS nor Exely shows any AI-booking product (search 2026-10-14).
4. **Agent-native money.** The only stablecoin agent-booking product found is Travala (USDC on Base), which is an OTA reselling aggregated inventory, not hotel-direct.

**AI booking is still small.** Booking Holdings said AI-chatbot referrals were under 1% of its room nights in Q2 2026. Use it honestly in Q&A: the channel is early, which is why the window for independents is now.

## Competitor table

| Name | Type | What it does (2026) | Payment / booking completion | Pricing | Threat to Stumari |
|---|---|---|---|---|---|
| **SiteMinder** Demand Plus / Direct Booking MCP + Channels Plus MCP | Channel manager, 53,000 hotels | Announced mid-April 2026: hotels appear in ChatGPT and Claude (Gemini listed) with live rates and availability via MCP; first AI demand partner DirectBooker. Channels Plus MCP serves agentic OTAs | Guest clicks through to the hotel's booking engine | Commission only on completed stays for the OTA route; direct route not published | **High.** Same pitch ("your hotel inside ChatGPT, no OTA"), huge distribution |
| **Lighthouse – The Hotels Network** ChatGPT app | Revenue / direct-booking platform | Live since 2026-03-04, "first direct booking app for hotels in ChatGPT", worldwide | Click-through to the hotel website; falls back to an OTA link if the hotel isn't indexed | Flat subscription, zero booking commission | **High.** Direct counter to "AI will just be another 15–25%" |
| **Agentic Hospitality** TravelOS MCP + ChatGPT app | Startup | Launched 2026-03-05; connects CRS/PMS to AI platforms; claims the first hotel booked via MCP (a small island rental, hotel as merchant of record) | PayPal / Braintree partners | Custom by scale | **Medium-high.** Closest startup narrative ("Daniel vs Goliath" for independents) |
| **Mirai** | Booking engine (Spain) | Booking engine "MCP-ready" for ChatGPT and other agents | Through Mirai's engine | n/a | Medium (Europe chains/independents on Mirai) |
| **RateGain** UNO Booking Engine | Booking engine | Native MCP for ChatGPT and Claude bookings | Through its engine | n/a | Medium |
| **Zucchetti** | PMS / hotel software | June 2026 MCP connector for direct bookings via Claude and ChatGPT | Through Zucchetti | n/a | Low-medium |
| **Apaleo** | Cloud PMS | MCP server since Sep 2025 for agents to read and act on hotel data | PMS-level | n/a | Low (infrastructure for others) |
| **Booking.com, Expedia** ChatGPT apps | OTAs | In ChatGPT since Oct 2025; browse in chat, finish on the OTA. Not available in the EU | OTA checkout, normal commission | OTA commission | **High** for attention: they're the default answer in ChatGPT and Gemini |
| **Google AI Mode** agentic hotel booking | Search | US test from Aug 2026 with Amadeus, then rolled into AI Mode; partners include Booking.com, Expedia, Hilton, IHG, Marriott, Wyndham, Choice, Priceline. Google says the hotel or platform stays merchant of record | In-chat or redirect (unclear) | Google says the commercial model stays like today's | High long-term; US and big brands only for now |
| **Perplexity + Selfbook / Tripadvisor** | AI search | Bookable hotels in Perplexity since 2025 (~140,000 properties per one source) | Selfbook checkout | n/a | Medium |
| **Travala Travel MCP** | Crypto OTA | June 2026: agents in Claude Desktop search, reserve and pay for 2.2M+ hotels in USDC on Base via x402; traveller signs with ERC-7715 session keys; 10% cbBTC rebate | Gasless USDC, ~$0.01 per booking | OTA margin | **High for the crypto angle.** "AI agent pays a hotel in stablecoins" already exists, OTA-side |
| **Jinko, Gondola** | Aggregator MCP servers | Hotel booking APIs for agents (Jinko: ~2M hotels) | Aggregator | n/a | Low-medium |
| **Sabre + PayPal + Mindtrip** | GDS + payments | End-to-end agentic booking pipeline announced for Q2 2026 | PayPal | n/a | Low (corporate/chain inventory) |

Not found (2026-10-14): any hotel or PMS accepting x402 or stablecoin payments directly from agents on Solana; any AI-booking product from OtelMS or Exely; any competitor pricing cancellation terms per request inside an agent flow.

## Georgia: payments and stablecoins

| Item | What it is | Relevance |
|---|---|---|
| **Keepz** | Georgian QR payments, says 20,000 merchants; advertises taking USDT, BTC, ETH and open banking | Possible licensed settlement partner, and a competitor if it adds hotel booking |
| **CityPay, Binance Pay** | Crypto acceptance for Georgian merchants; Radisson Tbilisi is the usual hotel example. The "200+ businesses" figure is an estimate, still unsourced | Shows demand; most merchants settle in lari, not crypto |
| **NBG Order No. 52/04 (2026-03-06)** | Rules for stablecoin issuance by registered VASPs: 1:1 segregated reserves, capital from GEL 500,000, redemption at par in 3–5 business days, NBG consent before an offering | Issuer rules only. Says nothing about merchants accepting stablecoins, so it does **not** resolve the Art. 39¹ question in [crypto-legality-georgia.md](crypto-legality-georgia.md) |
| **GEL₮ / GELT** (Tether with the Georgian government, announced 2026-05-25) | Planned lari-pegged stablecoin; no launch date, chain or reserve details published | Watch it. If it launches under NBG rules, a lari stablecoin could become the natural settlement asset for Georgian hotels. Don't mention it as available |

## What this means for the pitch

- **Don't say or imply that putting a hotel inside ChatGPT is new.** SiteMinder, Lighthouse and Agentic Hospitality all pitch "be bookable in AI without an OTA". The hook "If an AI can't book you, you don't exist" still works; the claim "small hotels can't be booked by AI" needs the qualifier "directly, and paid on the spot".
- **Differentiate on what they don't do:** the AI pays and the deal is done in the conversation (no click-out to a booking engine), each guest gets their own cancellation terms, refunds run automatically, and it works for small hotels that have no channel manager or booking engine.
- **Be ready for "Isn't this SiteMinder / Lighthouse / Travala?"**
  - SiteMinder and Lighthouse: "They show your hotel in ChatGPT and send the guest to your booking engine. Most small Georgian hotels don't have one, and the AI still can't pay. We close the booking and the payment inside the conversation."
  - Travala: "Travala is a crypto OTA reselling big-chain inventory, with its own margin. We're the hotel's own agent; the hotel sets the terms and keeps the margin."
  - Booking.com and Expedia in ChatGPT: "Same 15–25%, now inside the chat."
- **Adoption question:** under 1% of Booking Holdings' room nights came from AI chatbots in Q2 2026. Answer: early channel, and the big players are moving now; independents need a way in before the defaults are set.

## Sources

- Agentic Hospitality: [Hospitality Net launch](https://www.hospitalitynet.org/news/4131210), [first hotel MCP booking](https://www.hospitalityupgrade.com/news/agentic-hospitality-announces-industrys-first-hotel-mcp-booking-a-daniel-vs-goliath-story), [ChatGPT app](https://www.hospitalitynet.org/news/4132086/), [TravelOS pricing listing](https://www.hospitalitynet.org/ai/snapshot/travel-os-distribution-hub)
- SiteMinder: [PhocusWire](https://www.phocuswire.com/news/technology/siteminder-links-hotel-inventory-ai-booking-channels-mcp), [eCommerceNews](https://ecommercenews.com.au/story/siteminder-expands-hotel-bookings-into-ai-channels), [AI distribution page](https://www.siteminder.com/ai-distribution/)
- Lighthouse / The Hotels Network: [Hotel Management](https://www.hotelmanagement.net/tech/lighthouse-launches-hotel-direct-booking-app-chatgpt), [AltexSoft](https://www.altexsoft.com/travel-industry-news/lighthouse-adds-hotel-booking-in-chatgpt-for-direct-sales), [Hotel Dive press release](https://www.hoteldive.com/press-release/20260304-the-first-direct-booking-app-for-hotels-launches-in-chatgpt-powered-by-lig/)
- Mirai: [blog](https://www.mirai.com/blog/mcp-the-layer-that-connects-your-hotel-to-the-new-generation-of-ai-agents/). Apaleo: [MCP server](https://apaleo.com/blog/apaleo-news/apaleo-launches-mcp-server). Jinko: [MCP Market](https://mcpmarket.com/server/jinko). Gondola: [blog](https://www.gondola.ai/blog/best-travel-mcp-server). RateGain and Zucchetti via [RateGain](https://rategain.com/blog/7-best-cloudbeds-alternatives-2026/) and the [PMS API scorecard](https://rapideyeinspections.com/blog/hotel-pms-open-api-comparison/)
- OTAs in ChatGPT: [Skift](https://skift.com/2025/10/06/expedia-booking-chatgpt-apps-openai/), [Hospitality Today](https://www.hospitality.today/article/how-expedia-and-booking-com-now-work-inside-chatgpt)
- Google AI Mode: [Skift](https://skift.com/es/2026/08/27/googles-agentic-hotel-booking-tool-comes-to-ai-mode/), [Hospitality Net](https://www.hospitalitynet.org/news/4134140/google-ships-agentic-booking-and-puts-a-points-price-beside-your-rate-hvs-holds-45-for-2026-98-of-ready-buyers-abandon-anyway), [PhocusWire on IHG](https://www.phocuswire.com/news/online/ihg-google-agentic-ai-booking-pilot), [Hospitality ON](https://hospitality-on.com/en/distribution/google-launches-ai-agent-hotel-booking-test-united-states)
- Booking Holdings under 1%: [Travelers Today](https://www.travelerstoday.com/articles/60754/20260805/hotel-bookings-via-ai-chatbots-stay-below-1-booking-holdings-confirms.htm)
- Agentic payments context: [Hotel Online](https://www.hotel-online.com/news/from-search-to-settlement-why-hotels-need-infrastructure-for-agentic-commerce), [Hotel Tech Update](https://www.hoteltechupdate.com/travel-tech/agentic-ai-booking-bots-are-now-transacting-on-otas-what-it-means-for-hotel-distribution), [Solana on x402](https://solana.com/news/webinar-recap-agentic-payments)
- Travala: [The Block](https://theblock.co/post/402860/travala-debuts-agentic-ai-travel-protocol-with-gasless-usdc-payments-on-base), [Cointelegraph](https://cointelegraph.com/news/travala-ai-agents-book-hotels-usdc-base?rand=6792), [Let's Data Science](https://letsdatascience.com/news/travala-launches-ai-hotel-booking-with-claude-integration-3b974c9c)
- Georgia: [Cointelegraph Tbilisi guide](https://cointelegraph.com/magazine/crypto-is-used-for-payments-in-georgia-not-to-get-rich-tbilisi-crypto-city-guide/), [Georgia Today on Keepz](https://georgiatoday.ge/a-fintech-pioneer-from-georgia-country/), [NBG Order 52/04 (PDF)](https://nbg.gov.ge/fm/%E1%83%A1%E1%83%90%E1%83%92%E1%83%90%E1%83%93%E1%83%90%E1%83%AE%E1%83%93%E1%83%9D/vasps/initial-coin-offering-stablecoin-final-eng.pdf), [Interfax](https://interfax.com/newsroom/top-stories/116531/), [Cointelegraph on GELT](https://cointelegraph.com/news/tether-georgia-government-plan-lari-backed-stablecoin-gelt), [Decrypt](https://decrypt.co/368961/central-bank-georgia-tether-stablecoin)
