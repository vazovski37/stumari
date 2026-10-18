---
name: project-ai-concierge
description: Second hackathon (deadline 2026-10-19, devnet demo): guest's own AI app books via remote MCP link; built 2026-10-18, devnet not yet live
metadata:
  type: project
---

Second hackathon, submission deadline **2026-10-19**, devnet demo only, hotel side kept (Solana escrow is why the idea needs a chain). Guests link a wallet, their **own AI app** (Claude/ChatGPT custom connector) finds a hotel by requirements and prepares a booking; payment happens on the website with the guest's wallet. Stumari pays no AI credits.

Built 2026-10-18 (ADR-0020): `/connect-ai` mints a wallet-linked connector URL, remote MCP at `/api/mcp/{token}` in `apps/web/lib/mcp` (find_hotels, get_quote, book, booking_status, my_bookings, cancel; none pays), hotel attributes (migration 0005), four demo hotels in `scripts/lib/demo.ts`, checkout opens from `/h/{slug}?quote=&option=`. Not built: in-site chat with own API key, x402 inference, OAuth.

**Why:** Anthropic bans Claude subscription OAuth in third-party apps, so "link your own AI" has to mean an MCP connector (or an API key).
**How to apply:** see docs/plan/ai-concierge-proposal.md "Go-live for the demo". On 2026-10-18 the escrow program had no account on devnet, the live Azure site was landing-only, and the laptop used had no operator keys or WSL toolchain, so the on-chain payment was never run end to end. Do not claim it was. Related: [[project-stumari]].