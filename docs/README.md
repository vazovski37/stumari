# Stumari docs

## Product
- [Vision and positioning](product/vision-and-positioning.md) — problem, insight, what we do not claim, Colosseum positioning
- [MVP scope](product/mvp-scope.md) — the six-step loop, stubs, cuts, definition of done

## Architecture (specs = contracts)
- [Overview](architecture/overview.md) — components, keys, flows, environments, layout
- [Escrow program](architecture/escrow-program.md) — accounts, state machine, instructions, money math, tests
- [Quote protocol](architecture/quote-protocol.md) — signed quote format, canonicalization, lifecycle
- [Pricing and risk model](architecture/pricing-and-risk-model.md) — hazard model, features, artifact format, templates, pricing formula
- [Data model](architecture/data-model.md) — DB tables, availability rule, wallet history features
- [API](architecture/api.md) — REST, auth, dashboard, admin, cron, MCP tools
- [Configuration](architecture/configuration.md) — environment variables, on-chain config, demo data
- [Inventory and iCal](architecture/inventory-ical.md) — import/export, confirmation safety
- [Mews inventory](architecture/mews-inventory.md) — Mews as an inventory provider: availability rule, confirm/cancel, idempotency
- [Security](architecture/security.md) — key custody, threats, mainnet checklist

## Decisions
- [ADRs](decisions/README.md)

## Plan
- [Roadmap to 12 Oct](plan/roadmap.md) — milestones, build order, what only founders can do
- [Runbook](plan/runbook.md) — setup, local chain, program deploy, devnet bootstrap, Vercel + Turso, cron, MCP, troubleshooting
- [Backlog](plan/backlog.md) — open follow-ups from builds and reviews, by component
- [Go live with the landing](plan/go-live-landing.md) — put the landing + apply/demo forms on a public URL before devnet (Vercel + Turso, env vars, Telegram alerts, pixel)
- [E2E report](plan/e2e-report.md) — the full loop on localnet (20 steps), screenshots, demo-recording checklist

## Model
- [Model report](../ml/reports/metrics.md) — held-out 2017 metrics: AUC 0.713 vs 0.634 for lead time alone, Brier 0.1917 vs 0.2136 base rate, expected calibration error 0.038

## Go-to-market
- [Pilot offer](sales/offer.md) — the single source of what we promise hotels (ADR-0013)
- [Call sheet](sales/call-sheet.md) — one page for phone calls (pitch EN/KA/RU, qualifying questions, links to send)
- [Facebook kit](sales/facebook-kit.md) — page texts, organic posts, ads (EN/KA/RU), targeting, UTM links, Meta crypto-ad policy notes; ad images at `/ads`
- [Call script](sales/call-script.md) ([ქართ.](sales/call-script.ka.md), [рус.](sales/call-script.ru.md)) · [Objections](sales/objections.md) ([ქართ.](sales/objections.ka.md), [рус.](sales/objections.ru.md)) · [One-pager](sales/one-pager.md) (EN/RU/KA) · [Onboarding checklist](sales/onboarding-checklist.md) · [Lead tracker](sales/leads.csv)

## Colosseum submission
- [Status tracker](submission/status.md) — filled and missing fields, final check
- [Weekly update 2026-09-28](submission/weekly-update-2026-09-28.md) — 1-minute video script
- [Georgian community form](submission/georgia-community-form.md) — answers given to the Georgian Colosseum group (Build Station Oct 5–13, promised materials)
- [Demo video script](submission/demo-video-script.md) (≤ 3:00, live product) · [Pitch video script](submission/pitch-video-script.md) (≤ 2:00)

## Research
- [Mews](research/mews.md) — connecting a Mews hotel: private integration (Enterprise or Connectivity Add-on, certification), demo environment, Connector API operations; never automate a staff login
- [Double booking and channel managers](research/channel-managers.md) — iCal latency and eligibility, gaps in today's design, Georgian PMS/CM market (OtelMS, Exely), integration routes (Exely Connect, Channex, Beds24, SiteMinder), no unified API
- [Competitive landscape](research/landscape.md) — Copilot API data: win rates by cluster, tag lift, precedents, threats
