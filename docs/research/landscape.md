# Stumari — Competitive Landscape

Research date: 22 September 2026. Colosseum Crypto World's Fair, submissions due 12 October 2026.
Sources: Colosseum Copilot API (project corpus and archives) plus public web research for commercial competitors, which the Copilot corpus does not cover.

## 1. Run status

**Auth: OK.** `/status` returned `authenticated: true`, scope `colosseum_copilot:read`, expiring 21 December 2026.

**Corpus covers four hackathons, not Frontier or this season.** Renaissance (1,076 projects / 85 winners), Radar (1,360 / 58), Breakout (1,416 / 85), Cypherpunk (1,576 / 65). Total **5,428 projects, 293 winners — a 5.40% baseline win rate.**

Every one of the ten `/search/projects` queries returned 15 results (`totalFound` 16, `hasMore` true), for **113 distinct projects**. Both `/search/archives` calls succeeded (8 and 6 documents). `/analyze`, `/compare` and four `/clusters` calls succeeded. Eleven `/projects/by-slug` fetches succeeded.

Two notes. Cloudflare blocks non-curl user agents with error 1010, so calls must go through curl. The `winnersOnly` filter works only nested as `{"filters":{"winnersOnly":true}}`.

## 2. Overlap table — the 12 most relevant

C = Colosseum corpus (API). W = commercial/web.

| Name | Origin | Placement | Sim. | What it does | Overlap type | Won? |
|---|---|---|---|---|---|---|
| TradeRooms / TradeRooms.Fun | C — Cypherpunk + Breakout | none | 0.077 | Buy, hold and trade hotel room reservations as assets | Supply-side hotel tool | **No** |
| TripFlip | C — Radar | none | 0.054 | PMS-integrated hotel receivables financing, "a bank for hotels" | Supply-side hotel tool | **No** |
| BlockTrips | C — Radar | none | 0.074 | Travel marketplace with booking resale and verified reviews | Demand-side OTA | **No** |
| Globees | C — Breakout | none | 0.071 | Turns accommodation bookings into yield-bearing tokenized assets | Demand-side OTA | **No** |
| NeuraStay | C — Cypherpunk | none | 0.039 | Discover and book stays, paid in PYUSD or fiat | Demand-side OTA | **No** |
| AI Economy Protocol | C — Cypherpunk | none | 0.056 | Agents discover services, **negotiate prices**, settle via escrow | Agent-to-agent negotiation | **No** |
| Trustless Work | C — Breakout | none | 0.078 | Stablecoin escrow infrastructure, milestone payments | Escrow marketplace | **No** |
| MCPay | C — Cypherpunk | **Track prize #1, Stablecoins** | 0.050 | Monetize MCP tools via HTTP 402 micro-payments | Agent payments | **Yes** |
| XAAM | C — Breakout | **Honorable mention, AI** | 0.048 | Marketplace for agents to hire and monetize agents over MCP | Agent payments | **Yes** |
| Hopper / HTS CFAR for Hotels | W — via Cloudbeds, Nov 2025 | live product | — | AI sets refund amount and flexibility window per offer | Model-set terms | n/a |
| Dtravel / Nite Protocol | W — since 2021 | 200k listings, then pivoted | — | Host is merchant of record, per-listing escrow | Escrow + same positioning | n/a |
| Travala Travel MCP | W — June 2026 | 2.2M properties | — | Agent reserves and pays for a hotel in USDC on Base | Agent payments | n/a |

## 3. Direct precedents

**The headline finding, now from primary data: of 19 distinct travel, hotel and booking projects surfaced across the ten queries, zero have ever won anything.** Not a track prize, not an honorable mention. Running the same search restricted to winners returns no travel project at all — the top matches degrade to WayFi (Wi-Fi hotspots), Trekn (social mapping) and Shadow Book (FHE infrastructure), with similarity collapsing to 0.055 and below. The nineteen: TradeRooms, TradeRooms.Fun, TripFlip, BlockTrips, Globees, NeuraStay, Tripon, Tourpium, Dynamic Maps, Booking Hotel x Blockchain, roomie.sol, Crypto Airlines, Cyb3rliving, ZKP Hotel, TourCoin, Wings, Booking Plane Ticket, Menupay, Ledger & Pay.

**Every one of them does one of three things, and none does yours.** They tokenize bookings for resale liquidity (TradeRooms, BlockTrips, Globees, TripFlip), run NFT loyalty (Booking Hotel x Blockchain, Tripon), or bolt crypto onto checkout (NeuraStay, roomie.sol, Crypto Airlines). **Not one underwrites cancellation risk or sets terms per booking.**

**Hotel-side selling tool — one precedent, and it lost.** TripFlip is the closest thing to Stumari's shape in Colosseum history: it "integrates seamlessly with Property Management Systems (PMS), manages all the receivables of a hotel," targets hotel operators, and assesses credit per hotel. It is a lender, not a pricing engine, and it won nothing.

**Agent-to-agent negotiation with settlement — precedent exists inside Colosseum, and it lost.** AI Economy Protocol: "Fully autonomous AI agents that discover services, negotiate prices, and execute payments without human intervention," with "smart contract-based escrow." Cypherpunk, no prize. Your RFQ-and-counter-offer loop is not new here, and on this evidence it is not what wins.

**Model-set cancellation terms — no Colosseum precedent, but a decisive commercial one.** Hopper/HTS states verbatim: "Our AI adapts UX, pricing, refund amounts, and flexibility windows in real-time," and since November 2025 it reaches independent hoteliers through Cloudbeds. Booking.com Smart Flex does the same at scale. This is the claim that must be reworded.

**What has no precedent in either corpus.** Nothing sets the **seller's** deposit and refund schedule per request from a calibrated model, prices it jointly with the rate in one signed quote, **lets the hotel keep the risk premium**, and encodes it in an escrow a machine can settle against. Every commercial precedent sits on the buyer's side and sells the guest an option, with a third party keeping the spread.

## 4. Archive precedents

The agentic-commerce query returned eight documents; the cancellation-risk query returned **nothing on topic** — its best hits were Solana circuit breakers, Satoshi forum posts and Jupiter docs. **There is no crypto literature on pricing cancellation risk.** That is a real gap, and worth one line in the pitch.

1. **[Tourists in the bazaar: why agents need B2B payments](https://a16zcrypto.com/posts/article/against-b2b-payments-stablecoins)** (a16z, top hit at 0.049) — agents need "a unified view of proposed purchases across multiple vendors."
2. **[Shopping is Dead, AI is Taking Over](https://alliance.xyz/essays/shopping-is-dead-ai-is-taking-over)** (Alliance) — uses your exact scenario: "a travel agent could issue itself a card limited to $1,500 for your hotel."
3. **[Agentic Payments and Crypto's Role in the AI Economy](https://www.galaxy.com/insights/research/x402-ai-agents-crypto-payment)** (Galaxy) — "x402 is built for software paying other software."
4. **[Agency by design](https://a16zcrypto.com/posts/article/preserving-user-control-ai-agents)** (a16z) — agent policy-signing authority and verifiable on-chain execution.
5. **[Return of the L1 wars](https://blog.superteam.fun/p/layer-1-wars-its-about-ai-agents)** (Superteam) — agents need a substrate handling "authentication and dispute resolution."

## 5. What wins, from `/analyze` and `/compare`

Cohort: 293 winners against all 5,428 projects.

**Win rate by cluster.** This is the single most actionable table in the report.

| Cluster | Win rate | Projects / winners |
|---|---|---|
| Stablecoin Payment Rails and Infrastructure | **9.9%** | 202 / 20 |
| Solana Real Estate Tokenization | 5.9% | 204 / 12 |
| *Corpus baseline* | *5.4%* | *5,428 / 293* |
| Solana AI Agent Infrastructure | 4.3% | 325 / 14 |
| Simplified Solana Payment Solutions | 4.0% | 223 / 9 |
| Gamified Web3 Travel and Tourism | 3.8% | 78 / 3 |
| Solana-Based Decentralized E-commerce | 2.2% | 184 / 4 |
| Decentralized Freelance Marketplaces | 0.7% | 149 / 1 |
| NFT-Based Event Ticketing | 0.0% | 70 / 0 |

**Solution-tag lift among winners.** Positive: **depin +1.44**, **stablecoin payments +1.16**, **ai agents +0.74**, real-world asset tokenization positive. Negative: **smart contract escrow −0.68** (58 projects, 1 winner), rwa tokenization negative, fractional ownership negative, and nft ticketing, learn-to-earn and copy trading all at −1.0 with zero winners.

**Problem-tag lift.** Positive: **high payment processing fees +0.54**, capital inefficiency positive. Negative: **cross-border payment friction −0.60** (46 projects, 1 winner). At −1.0 with zero winners: information asymmetry, creator monetization, complex web3 onboarding, web3 onboarding friction.

**Winner target users.** DeFi traders 16.0%, Solana developers 7.2%, liquidity providers 5.1%, dapp developers 4.8%, DAO operators 4.4%, **merchants 3.1%**. Travelers, hotel operators and hospitality providers appear **nowhere** among winners.

**Winner tracks.** Consumer Apps ~19%, DeFi ~15%, Infrastructure ~12%, DeFi & Payments ~11%, Stablecoins ~8.5%.

## 6. Threat assessment

**The biggest threat to the insight score is Hopper/HTS CFAR through Cloudbeds.** It refutes your headline sentence from a judge's phone, through the exact system you list as a future integration, and it kills two claims at once: that model-written cancellation terms are new, and that independent hotels cannot get them.

**Neutralising wording, placed above the architecture:**

> "Models already price cancellation risk. Hopper, Booking.com Smart Flex and Cover Genius all ship it, and Hopper reaches independent hotels through Cloudbeds. In every one the model sits on the **buyer's** side and sells the guest an option, while a third party underwrites it and keeps the spread. The hotel's own exposure is still one blanket policy it wrote by hand. Stumari inverts the direction: the seller's model prices the seller's risk, the hotel keeps the premium, and the counterparty can be a machine that cannot click 'I accept'."

**Runners-up.** (2) **Dtravel**, a viability threat rather than a novelty one: it shipped this positioning, took 200,000 listings in 30 days, and pivoted anyway. (3) **Travala MCP and Google AI Mode**, which kill any "first agent-payable booking" claim. (4) **TripFlip**, because a judge who remembers it will ask why hotel-side tooling lost last time. (5) **AI Economy Protocol**, which already did agent negotiation plus escrow and lost. (6) **x402Resolve**, model-scored refunds from a Solana escrow, making "enforced by code" your weakest differentiator.

## 7. Seven implications

1. **Tag it as stablecoin payments infrastructure, never as travel or escrow.** Stablecoin Payment Rails wins at 9.9%, nearly twice baseline; the escrow-heavy Freelance Marketplaces cluster wins at 0.7%, and "smart contract escrow" carries −0.68 lift on 58 projects with one winner. Escrow is your mechanism, not your label.
2. **Set target users to merchants, not travelers or hotel operators.** Merchants appear in 3.1% of winners. Travelers, hotel operators and hospitality providers appear in none. Say "merchants who sell a perishable, cancellable inventory," and let the hotel be the example.
3. **Frame the problem as high payment processing fees, not cross-border friction.** Processing fees carry +0.54 lift; cross-border friction carries −0.60 on 46 projects with one winner. The OTA's 15–25% commission is a processing fee. Lead with it and keep the Russian-card story as color, not as the thesis.
4. **Cut the tagline to one clause and drop every "first" touching escrow or agent payments.** Your current one-liner fails on the "AND" and is falsifiable in one tab.
5. **Name Hopper, Smart Flex and Cover Genius on slide one, and delete "independent hotels are locked out."** Cloudbeds shipped CFAR to independents in November 2025, so that line is a verifiable error.
6. **Fix two more claims before a judge does.** "An AI agent cannot pay a hotel at all" is false since Travala shipped in June 2026. "Cards don't work in Georgia" is false, since Tbilisi and Batumi accept cards normally; the true claim is that Russian-issued cards don't, and Russia sent 1,579,764 of Georgia's 5.5M visitors in 2025. Your OTA commission stat holds; state cancellations as "27% of ordinary bookings (37% overall incl. no-shows and group blocks)" — the 37% figure alone is inflated by group blocks (pricing review, 2026-09-25).
7. **Cut the ML stack to one calibrated survival model, and demote the pooled label set to roadmap.** No winner in this corpus was rewarded for model depth, six model families cannot be real by 12 October, and labels only resolve after arrival dates pass. Spend that space on a live, timed Channex connection on stage, and on tour operators, the only near-term buyer whose money does not wait on agent adoption.

## 8. Revised tagline and description

**Tagline (93 characters):**

> The hotel's own model writes each booking's cancellation contract; Solana escrow enforces it.

**Description (120 words):**

> Stumari is a stablecoin checkout for merchants selling perishable inventory, starting with independent hotels. It is not an OTA and brings no guests. Each merchant gets a seller agent, with inventory connected in about 15 minutes over iCal or the Channex Open Channel API, returning one signed quote: a price and a deposit-and-refund schedule written per request by a calibrated time-to-cancel model, bounded by the merchant's own policy. Acceptance funds a per-booking Solana USDC escrow encoding those terms. Refunds are a pure function of cancellation time and arrival date, so that path needs no oracle and no claims desk. Guests pay with Phantom, tour operators negotiate group terms, agents buy over MCP. Georgia first. The merchant keeps the risk premium Hopper currently keeps.

## 9. Caveats

- **This season is invisible.** The corpus stops at Cypherpunk. Frontier and Crypto World's Fair are absent, so live competitors cannot be checked, and public search found one already running: HashLock Compute, same escrow-with-terms architecture in GPU compute.
- **Similarity scores are low in absolute terms** (best 0.082). Treat rankings as ordinal, not as strong matches.
- **A correction to your brief.** Nomadz does not appear in the Copilot corpus with any prize, and public listings show a null prize on all three of its submissions with two conflicting side-track names. Do not call it a hackathon winner.
- **Georgia.** The "200+ businesses accept crypto at POS" figure is not traced to a primary source. Verified and more useful: 710 independent hotels in Tbilisi against 27 chain hotels.
