# Double booking, channel managers and "unified" integrations

Research of 2026-09-25: five researchers (the codebase, the Georgian market, channel-manager APIs, unified APIs, calendar latency), each web report fact-checked by an independent skeptic. Corrections from the fact-check are already applied below. Low-confidence items are marked.

## TL;DR

- **Today** Stumari prevents double booking with per-room iCal sync plus a *Pending → confirm* step ([inventory-ical.md](../architecture/inventory-ical.md)). It works for hotels **without** a channel manager whose rooms are listed **one unit per room type**. That is probably most small Tbilisi guesthouses and apartment hosts (estimate, low confidence), but not hotels that already use a channel manager.
- **Real gap found in our design:** we confirm seconds after payment, so an OTA can still sell the same night until it next reads our feed (**up to ~2 h on Booking.com, ~3 h+ on Airbnb**). After confirmation the escrow has no clean way to refund the guest in full before check-in. See [Gaps and fixes](#gaps-in-todays-design-and-fixes).
- **Channel managers:** Stumari never needs its own Booking.com/Airbnb connection. The right model is to **plug into the hotel's channel manager as one more sales channel**: we push the reservation, and the channel manager closes the room on every OTA within seconds to minutes, exactly as its own booking engine does.
- **No single "unified" API covers Georgia.** The two local incumbents are **OtelMS** (Tbilisi-based, no public API: needs a partnership) and **Exely** (ex-TravelLine, Tbilisi office, a documented *Exely Connect* API for sales channels: needs a partner key plus the hotel's consent). The closest things to "unified" internationally are **Channex** (as a channel via Open Channel, or as our white-label channel manager), **SiteMinder Channels Plus**, and the B2B marketplace **HyperGuest**. None covers OtelMS.
- **Direct OTA APIs are closed to us:** Booking.com is pausing new connectivity providers "until further notice"; Airbnb's API is invitation-only.

## How calendars propagate (why double bookings happen)

| Path | Latency | Source |
|---|---|---|
| Booking.com imports an external iCal | every **2 h** ("can take up to two hours"), manual "Import now" button | [Booking.com partner help](https://partner.booking.com/en-us/help/rates-availability/extranet-calendar/syncing-your-bookingcom-calendar-third-party-calendars) |
| Booking.com iCal **eligibility** | only properties with **≤ 20 room types, ≤ 1 unit per room type, and no XML connectivity provider** (channel manager/PMS) | same page |
| Airbnb imports an external iCal | every **3 h** (manual refresh rate-limited); Beds24 reports it can be as slow as daily | [Airbnb help 99](https://www.airbnb.com/help/article/99), [Beds24 wiki](https://wiki.beds24.com/index.php/Airbnb_iCal) |
| Agoda | "several times a day", only room types with exactly 1 room | [Agoda partner hub](https://partnerhub.agoda.com/how-do-i-connect-my-agoda-calendar-with-other-websites/) |
| Vrbo | every 30 min, only via the Vrbo Dashboard | [Vrbo help](https://help.vrbo.com/articles/How-do-I-import-my-iCal-or-Google-calendar) |
| Channel manager ↔ Booking.com (API) | seconds: providers pull reservations every 20 s; Booking.com's own overbooking example is a **25 s** gap | [Booking.com connectivity docs](https://developers.booking.com/connectivity/docs/con-faq-reservations-troubleshooting-overbookings) |
| Channel manager ARI push | seconds to a few minutes (Channex prioritises availability; batches every 30–60 s) | [Channex PMS guide](https://docs.channex.io/guides/pms-integration-guide) |

**Who pays for an overbooking.** On Booking.com the hotel must rehouse the guest at the same or better standard and pay for it, and commission is still charged ([handling overbookings](https://partner.booking.com/en-gb/help/reservations/manage-reservations/handling-overbookings)). On Airbnb, host cancellation fees are 10–50% (minimum $50), and double-booking is the host's responsibility ([Airbnb 990](https://www.airbnb.com/help/article/990); verify current figures). So when a collision happens, **Stumari is the cheapest channel to give way**, which is why we need a clean on-chain "walk" refund.

## Gaps in today's design, and fixes

| # | Gap (from the code) | Fix | Size |
|---|---|---|---|
| G1 | **Forward gap.** `autoConfirm` confirms seconds after payment (`lib/bookings/lifecycle.ts`), so the 2 h window only catches conflicts already visible in the OTA's export. An OTA sale in the next 2–3 h hits a *Confirmed* booking, and nothing detects it afterwards. | Confirm only after **every OTA connected to the unit has fetched our export feed since the booking**, then re-import once more. Issue **one export token per OTA per unit** so each fetch is attributable. Raise `confirm_window_secs` to about **4 h** (Airbnb 3 h + margin), with auto-void if an OTA never fetches. The guest sees "Reserved: the hotel's calendars are syncing" and can cancel for 100% meanwhile. | 1–3 days + spec/pricing update (a longer Pending means a longer free-cancel option, which `pricing-and-risk-model.md` does not price) |
| G2 | **No full refund of a Confirmed booking before check-in.** Admin can void only Pending bookings; the guest can cancel only by tiers; a dispute opens only at check-in. | New program instruction **signed by the hotel authority** (the hotel gives up its own receivable): full refund to the guest before check-in. Not admin-signed, to keep the trust property in security.md. Needs an ADR. | 1–2 days incl. Rust tests + vectors |
| G3 | **Fail-open confirm.** If an OTA feed fails to fetch during `autoConfirm`, we confirm on cached data. | Confirm only if every feed of the unit loaded in this sync; otherwise retry until the deadline, then void. | hours |
| G4 | **No conflict detection after confirmation.** | In the sync cron, compare new imported blocks with confirmed bookings, then flag them on the dashboard and alert the founders (Telegram). | hours |
| G5 | **Multi-unit room types and hotels on a channel manager cannot use Booking.com iCal at all** (eligibility rule above). | Channel-manager adapters (below). Interim: if the hotel's channel manager imports external iCal (Beds24 does, "multiple times per hour"), paste our feed **into the channel manager**, not into each OTA. OtelMS and Exely support is unknown: ask them. | per adapter |
| G6 | Stale availability: quotes use cached blocks; a lost hold is not moved to another free unit of the same type. | Re-pick a free unit of the same room type on `HOLD_LOST` or conflict. | hours |
| G7 | Self-echo: an OTA that re-exports imported dates under its own UID would bring our booking back as a block. | Match re-exported events against our bookings by dates; test with real Booking.com/Airbnb feeds. | needs a real listing to test |

Order-of-magnitude risk today (illustrative, not measured): about **0.1–0.4% of Stumari bookings** could collide through G1 on a busy unit. It is higher for last-minute dates and Airbnb-connected units.

## What Georgian properties use

| System | Evidence in Georgia | Third-party API for a sales channel |
|---|---|---|
| **OtelMS** | Tbilisi company since 2013, prices in GEL (free / 99 / 329 GEL a month), claims 4,000+ customers (global), 40+ OTAs incl. Ostrovok; Tbilisi hotels run booking engines on otelms.com | **None public** (the only "OtelMS API" on GitHub is an unofficial scraper; do not use). Partnership: partners@otelms.com / sales@otelms.com |
| **Exely** (ex-TravelLine) | Georgian-language site, office at 15 Chavchavadze Ave, claims 150+ Georgian clients; connects Booking.com, Agoda, Ostrovok/ETG, Sutochno; Airbnb via Kross Booking (new Airbnb bookings do sync) | **Exely Connect**: Search, Content and Reservation APIs for online sales channels (verify, create booking, cancellation penalty); OAuth2; the hotel grants access in "API connections"; partner key via welcome@exely.com. Terms and fees not published. Separately, a hotel-issued read-only Public API lets us read its bookings for conflict checks ([kb282643](https://exely.com/help/kb282643/), [dev portal](https://exely.com/dev-portal/docs/api)) |
| Cloudbeds | a few Tbilisi hostels and boutique hotels | Partner program (Connectivity Agreement, certification, 2–4 week limited release) |
| HotelRunner, Beds24, Smoobu, SiteMinder/Little Hotelier, Bnovo | no Georgian evidence found (absence of evidence) | see the table below |
| **No channel manager** | estimated **50–75% of properties under ~10 units and most apartment hosts** (low confidence; no survey exists) | iCal (today's path) |

Market size: Geostat counts 2,783 registered hotel-type establishments in 2025 (about 20 rooms each on average; about 580 in Tbilisi; 65.5% run by individual entrepreneurs). Tbilisi has about 6,100–6,600 active Airbnb listings. A 2024 World Bank study quotes 18–20% Booking.com commission among regional B&Bs. **The fastest way to real numbers is to ask every lead which system they use** (now in the call script and leads.csv).

## Integration routes

| Route | What Stumari gets | Access | Cost | Time | Fit in Georgia |
|---|---|---|---|---|---|
| **Exely Connect** | read availability, create/cancel bookings as a channel; Exely closes OTAs | partner key + hotel consent | unpublished | days–weeks of API work after the key | **high** (local incumbent) |
| **OtelMS partnership** | same, if they build or expose an API | business conversation | unknown | weeks–months | **high**, but not before 2026-10-12 |
| **Channex Open Channel** | Channex pushes ARI to us; we POST bookings; availability drops if the property setting is on (async, beta CRS: verify before confirming) | self-serve staging, then certification | **$300/year** | 1–2 weeks + certification | low (no Georgian PMS on Channex found) |
| **Channex WhiteLabel** | Stumari *becomes* the hotel's channel manager for Booking.com, Airbnb (Preferred+), Expedia, Agoda, Ostrovok/ETG and 68 channels | B2B; PMS certification (14 tests + live review, real-time ARI UI) | **$130/month + $7/hotel** | weeks; not realistic before Oct 12 | only hotels willing to leave OtelMS/Exely (Booking.com ARI and Airbnb API are single-provider) |
| **Beds24 API v2** | read calendar/offers; `POST /bookings` "closes availability at all other booking sources"; webhooks | hotel issues an invite code (expires in 24 h; scopes fixed); multi-hotel integrations get an org token via support | free within 100 credits/5 min | days | no evidence in Georgia, but a good **CM to recommend** to no-CM hotels (from €15.50/month, Airbnb Preferred+) |
| **Smoobu API** | availability, rates, create reservation (syncs to all channels) | contact Smoobu for keys; HMAC auth mandatory from 2026-10-31 | unpublished | days | apartment hosts |
| **HotelRunner Custom Apps** | read reservations; push availability/stop-sale (no create-reservation endpoint) | per-property token; PMS-partner sandbox | unpublished | days | unknown; can only *close* rooms |
| **SiteMinder Channels Plus** | REST, one integration for all opted-in SiteMinder hotels, billed per reservation (SiteConnect is SOAP, ~60 days) | partnership application | per reservation | weeks | unknown |
| **HyperGuest** | B2B marketplace over Exely, TravelLine, HotelRunner, SiteMinder, Channex, Cloudbeds… (not OtelMS) | commercial agreement | unpublished | unknown | reseller model; poor fit with USDC escrow paid to the hotel |
| Booking.com / Airbnb / Expedia direct | — | **closed** to new providers | — | — | — |
| Not relevant | Hapi (enterprise PMS hub), Impala (pivoted to reseller contracting), Nuitée/LiteAPI (supply aggregator), Rentals United / NextPax (vacation rentals), Mews (booking-engine API needs Enterprise), Apaleo (free API, rare in Georgia) | | | | |

## Recommended plan

**For the hackathon (by 2026-10-12)**
1. Fix the iCal design gaps G1–G4, starting with G2 (the walk instruction) and G3 (fail closed), which are small and remove the worst outcome.
2. Put an `InventoryAdapter` interface behind availability and confirm (`getAvailability`, `pushReservation`, `pushCancellation`, `parseWebhook`) with iCal as the first implementation.
3. Build **one** real channel-manager adapter for the demo: **Beds24** (no partnership, documented "close everywhere") or **Channex Open Channel** on free staging.
4. Be exact in the pitch: iCal for single-unit listings without a channel manager today; channel managers through adapters; Exely and OtelMS in conversation.

**Founders, this week**
- Ask every lead: *"Which system manages your calendar: OtelMS, Exely, Cloudbeds, Beds24, or none? Are your rooms listed one per listing on Booking.com?"* (call script, question 4; `channel_manager` column in leads.csv).
- Email **Exely** (welcome@exely.com) for an Exely Connect partner key, and **OtelMS** (partners@otelms.com) about a booking-channel API. Ask both whether they can import an external iCal feed per room, which would be a zero-integration bridge.

**After the pilot proves demand**
- Exely Connect adapter; OtelMS if they open an API.
- Offer Channex WhiteLabel or a recommended Beds24 setup to multi-unit hotels without a channel manager.
- Consider shrinking the confirm window for API-connected hotels (the on-chain window is global today; making it per-hotel is a program change).

## Open questions

- Do OtelMS and Exely accept an external iCal feed per room as a channel?
- Exely Connect terms, fees, and whether channel bookings decrement OTA inventory through its channel manager.
- Do Booking.com and Airbnb cache their iCal exports, and do they re-export imported dates under their own UIDs? This needs a test listing.
- Which PMS do the large Tbilisi apartment operators (Wehost 400+ units, Property Host 50+) use?
- Real per-unit OTA booking rates at pilot hotels, to replace the illustrative collision estimate.
