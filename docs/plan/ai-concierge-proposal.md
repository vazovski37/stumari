# Proposal: AI concierge website (next hackathon)

Status (2026-10-18): **decided and built for seat B** (the guest's own AI app over a remote MCP endpoint), recorded as [ADR-0020](../decisions/README.md) and specified in [api.md](../architecture/api.md) ("AI concierge"). Seats A (paste-your-key chat), C (wallet-paid inference) and D (judge demo mode) are **not built**. The deadline is 2026-10-19 and the demo is devnet only.

What exists in the repo: hotel attributes and requirement search, the remote MCP endpoint with six tools, the wallet-linked connector token and the `/connect-ai` page, checkout opened from the assistant's link, four seeded Tbilisi hotels, tests (316 pass), typecheck and lint clean. Verified locally over HTTP and in the browser up to the pay button; the on-chain payment itself was not run because this laptop has no operator key and the escrow program is **not deployed on devnet** (checked 2026-10-18). See "Go-live for the demo" below.

## What we want

A guest website where the guest:

1. links a Solana wallet,
2. chats with an AI that finds a hotel for specific requirements ("quiet, near Rustaveli, breakfast, under 150 USDC a night, free cancellation if my visa slips"),
3. books the room and pays on the website,

and **we pay for no AI inference**.

## Core idea

Keep the existing engine (signed quotes, cancellation menu, escrow, refund schedule). Add a thin guest-facing layer made of three parts:

- one **tool layer** (the five MCP tools plus a requirements search),
- several **ways to supply the AI** that all call that same tool layer,
- one **checkout page** that is the only place money moves.

The AI never holds money authority. It finds, compares and prepares. The guest confirms and signs on the website.

## What "link your own AI" can and cannot mean

| Option | Works? | Notes |
|---|---|---|
| Paste an API key (Anthropic, OpenAI, Gemini, OpenRouter) | **Yes** | The user pays their provider. Standard "bring your own key". |
| Sign in with a Claude subscription | **No** | Anthropic banned subscription OAuth in third-party apps (Feb 2026, enforced Apr 2026). Do not build on it. |
| Sign in with a ChatGPT plan | **Unconfirmed** | One Oct 2026 article describes a "ChatGPT plan usage" OAuth scope; others say it only exists inside Codex. Check OpenAI's own docs before relying on it. |
| The user's AI app connects to **our** remote MCP server | **Yes** | The user's Claude or ChatGPT does the thinking on their subscription. We only serve tools. |
| The wallet pays an x402 inference gateway in USDC | **Yes, stretch** | BridgeNode and Ambient JumpGate advertise pay-per-request Solana USDC inference. Status and prices unverified. |
| Free in-browser or free-tier model | **Partly** | Fine for a capped demo, weak at tool calling. |

## Four seats for the AI, one tool layer

### Seat A. Paste your key (the "integrated AI" on the site)

- Chat UI in `apps/web`. The browser calls the provider directly with the user's key. Our server never sees it.
- Key lives in memory by default; "remember on this device" stores it encrypted in IndexedDB. No third-party scripts, strict CSP, because an XSS would leak the key.
- The tool loop runs in the browser against our public REST API.
- Cost to us: zero.
- Verify before building: each provider's browser-direct (CORS) rules. Anthropic needs a specific opt-in header. If one provider blocks browsers, drop it from the list.

### Seat B. Connect your own AI app (remote MCP)

- Deploy `apps/mcp` as a **Streamable HTTP** server with OAuth, next to the web app.
- The OAuth login screen is **Sign In With Solana**. Linking the wallet and connecting the AI become one step, and the MCP session knows which wallet it serves.
- `book` returns a **checkout URL** on our site instead of a transaction. The guest opens it, reviews the terms and signs. This satisfies "payment on the website".
- Cost to us: zero. The user's subscription pays for inference.
- Risk: custom connectors are not available on every plan, and ChatGPT's connector mode may be limited. Check current availability for both.

### Seat C. Wallet-paid inference (stretch, Solana-native)

- On first use the browser creates an **AI allowance wallet**, a throwaway keypair the user funds with about 1 USDC. It pays an x402 inference gateway per message, with a hard spending cap, so no wallet popup per message.
- Strong story for a Solana hackathon: "your wallet pays for the AI that books the hotel".
- Only attempt after A and B work. Confirm the gateway is live, its models handle tool calls, and its terms allow this.

### Seat D. Zero-setup demo mode (for judges)

Judges will not paste keys. Two layers:

1. **Guided mode, no AI at all.** Same page, structured form (dates, guests, area, amenities, budget) calling the same tools. The product works with no model.
2. **Capped demo chat.** A free-tier model behind our server with per-IP and global daily limits and a kill switch. If the hackathon gives sponsor credits, use them here only.

## Wallet link

- Wallet Standard connect, then a Sign In With Solana message, then a session cookie. The hotel dashboard already does this.
- A guest account is just the wallet address plus preferences and booking history (`/my` already exists).
- Optional later: the wallet's history feeds the pricing model, as the data model already allows.

## Booking and payment flow

1. Guest asks for a hotel in chat (seat A, B, C or D).
2. The AI calls requirements search, then `get_quote`. Results come from signed quotes, so prices and cancellation menus are the server's, not the model's.
3. The AI shows options and recommends one.
4. The AI calls `book`. The site opens the **checkout card** with hotel, dates, total, chosen cancellation contract and refund schedule. The card is rendered from the verified quote, never from model text.
5. The guest signs in their wallet. The server builds the v0 transaction and pays fees, as today (ADR-0009).
6. Booking page shows status, refund-if-cancel-now and cancel button. The cancel flow already exists.

Safety rules carried over from `apps/mcp`:

- port the transaction guard (`tx-guard.ts`) so the browser checks the transaction against the verified quote before the wallet prompt;
- hotel and room text is stripped and length-limited before it reaches the model (prompt injection);
- amount cap per booking;
- the AI cannot sign. In seat B it has no key at all.

## What is new to build

| Piece | Effort | Notes |
|---|---|---|
| Requirements search: hotel attributes (area, amenities, tags, nightly price band) and a filter API | M | Seed 8 to 12 richer demo hotels. Free-text matching can be done by the model over structured results. |
| Shared tool package used by the browser loop and the MCP server | S | Extract from `apps/mcp/src/tools.ts` and `api.ts`. |
| Chat UI with provider and key settings, tool-call cards, checkout card | M | |
| Guided (no-AI) search page | S | Reuses the same filters. |
| Remote MCP: HTTP transport, OAuth with SIWS, checkout-URL `book` | M | |
| Capped demo model proxy | S | Rate limits and kill switch matter more than the model. |
| Wallet-paid inference (seat C) | M | Stretch. |

Suggested order: requirements search, shared tools, guided page, seat A, checkout card, seat D, seat B, seat C.

## Decisions (answered by the founders, 2026-10-18)

1. **Deadline:** 2026-10-19. Seat B only; everything else is cut.
2. **Devnet only, demo only.** No mainnet.
3. **Hotel side stays** (iCal and Mews inventory, admin onboarding, dashboard). It is also what makes the Solana escrow necessary in the idea. Hotels can now set description, area and amenities in the admin onboarding.
4. **AI credits:** the guest's own AI app pays. No Stumari key, no key in the browser.
5. **Legal framing** is unchanged: devnet demo with demo hotels; do not claim hotels can lawfully accept USDC ([crypto-legality-georgia.md](../research/crypto-legality-georgia.md)).

## Go-live for the demo (founders: needs the laptop with the Rust/WSL toolchain and the keys)

Checked on 2026-10-18: the program id `6Y17gFD9...U6nf` has **no account on devnet**, the live Azure site is landing-only, and the keys under `onchain/keys/` are not on the laptop used for this change.

1. Pull this change and run `pnpm install`.
2. Follow [runbook.md](runbook.md) section 4 and 5: deploy the program to devnet and run `pnpm --filter @stumari/scripts bootstrap --cluster devnet`. It now registers **four** demo hotels (it needs a funded devnet operator).
3. Run the web app somewhere public over HTTPS ([runbook.md](runbook.md) section 6, Vercel and Turso, is the path where the bootstrap can seed the live database; the Azure SQLite file is not reachable from the bootstrap). Set `NEXT_PUBLIC_SITE_URL` to the real public URL, because connector links and payment links are built from it, and set a stable `AUTH_SECRET` (rotating it revokes every connector link).
4. Open `/connect-ai`, sign in with the test wallet or Phantom (devnet), press **Create my link**, and add it to Claude as a custom connector (Settings, Connectors, Add custom connector, no authentication). Custom connectors are not on every plan; if yours lacks them, use another MCP client or Claude Desktop with the stdio server in `apps/mcp`.
5. Fund the paying wallet: the checkout's **Get 500 test USDC** button works in demo mode.

Demo script (about 2 minutes): link wallet, paste the link into Claude, ask for "a quiet hotel with air conditioning near Sololaki, 14 to 16 November, 2 adults, under 90 USDC a night", watch Claude call the tools and compare cancellation options, open the payment link, approve in the wallet, then show the booking page and its refund-if-cancel-now. Say plainly that the AI never pays: the wallet does.

## Sources checked (2026-10-18)

- [Anthropic bans third-party subscription authentication](https://gigazine.net/gsc_news/en/20260220-anthropic-third-party-block), [Winbuzzer](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/)
- [WorkOS on Sign in with ChatGPT plan usage](https://workos.com/blog/sign-in-with-chatgpt-plan-usage-scope) (unconfirmed against OpenAI docs)
- [Ambient x402 docs](https://ambient.xyz/docs/build/x402), [BridgeNode](https://mcpservers.org/servers/bridgenode-cc) (not verified live)
- [Remote MCP client connection notes](https://docs.redpanda.com/agentic-data-plane/connect/remote-mcp-clients/) (community docs, not the vendors' own requirements)
