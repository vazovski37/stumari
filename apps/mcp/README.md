# @stumari/mcp

MCP server that lets an AI agent use Stumari, the stablecoin checkout for hotels: search
availability, get a signed quote (a menu of cancellation contracts), book by paying USDC into the
per-booking escrow, cancel with the scheduled refund, and check a booking's status. It wraps the
public REST API of the web app (`docs/architecture/api.md`, "MCP server"); it has no database and
no RPC connection of its own.

Transport: stdio (`McpServer` + `StdioServerTransport`, `@modelcontextprotocol/sdk` 1.30). Logs go
to **stderr only**; stdout carries the protocol.

## Tools

| Tool | Input | Result |
|---|---|---|
| `search_availability` | `{ city?, hotel_slug?, checkin, checkout, adults, children? }` | available room types with base prices (never holds a room) |
| `get_quote` | `{ hotel_slug, room_type_id, checkin, checkout, adults, children?, wallet? }` | signed envelope, one plain-language line per option, and `verification` (signature, signer = `/api/config/public.quote_signer`, cluster/program, matches the request) |
| `book` | `{ quote_id, option_index, wallet? }` | agent key: `{ booking_id, signature, booking_url, explorer_url, status }`; otherwise `{ booking_id, tx, signer, last_valid_block_height, send_url, booking_url }` |
| `cancel` | `{ booking_id, wallet? }` | refund preview plus `signature` (agent key) or `tx` to sign |
| `booking_status` | `{ booking_id }` | status, terms, refund-if-cancel-now, `can_*` flags, booking URL, explorer link |

Every result carries `structuredContent` plus a short plain-language summary (and the JSON as a
second text block for clients without structured content). Failures are `isError` results with
`structuredContent.error = { code, message, http_status? }` — API codes (`UNAVAILABLE`,
`QUOTE_EXPIRED`, `NOT_ALLOWED`, …) pass through; the server adds its own (`QUOTE_UNVERIFIED`,
`WALLET_REQUIRED`, `AMOUNT_OVER_AGENT_CAP`, `FEE_PAYER_MISMATCH`, …). One exception: arguments that fail
the tool's input schema are rejected by the MCP SDK itself as `isError` with the text
`MCP error -32602: Input validation error: …` and no `structuredContent`.

Money is USDC base units as decimal strings (`"143000000"` = 143.00 USDC) with a display string
next to it. Without an agent key, the wallet signs the returned base64 v0 transaction
(`solana:signTransaction`) and posts it to `POST {STUMARI_API_URL}/api/tx/send { tx }`.

**Untrusted text.** Hotel names, addresses, room names, model version strings and API error
messages are stripped of control characters and length-limited before they reach the model
(security.md, prompt-injection row). Other free text the API returns (server-side term texts,
links, contact details) is not echoed; terms and explorer links are rebuilt locally.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `STUMARI_API_URL` | `http://localhost:3000` | base URL of the web app |
| `AGENT_SECRET_KEY` | unset | optional, **devnet demo only**: the agent's wallet, base58 of the 64-byte secret (Phantom export) or a JSON byte array (`solana-keygen` file contents) |
| `AGENT_MAX_AMOUNT_MINOR` | `500000000` (500 USDC) | largest amount the agent key signs for |

With `AGENT_SECRET_KEY`, `get_quote` defaults `wallet` to the agent address (the quote is then
payable only by it), and `book` / `cancel` sign and submit **only if all** of these hold:

- the quote verifies against `/api/config/public.quote_signer` and names the API's cluster and program (`book`);
- `/api/config/public.cluster` is not `mainnet-beta`, and its `program_id` is the fixed Stumari escrow program (ADR-0008);
- the amount at stake (option price, or the booking amount for a cancel) is ≤ `AGENT_MAX_AMOUNT_MINOR`;
- the decoded transaction is v0 without lookup tables, its fee payer is the configured quote signer, and the agent is one of its signers;
- it contains **exactly one** `stumari_escrow` instruction, of the expected kind (`create_booking` / `cancel_booking`), whose guest is the agent and whose booking account is the PDA of the expected booking id;
- `create_booking` escrows exactly the chosen option's price and records exactly the verified quote's terms: quote hash, option index, refund tiers, check-in/check-out, quote expiry, hotel PDA, mint and quote signer (`TERMS_MISMATCH` / `ACCOUNT_MISMATCH` otherwise — nothing on-chain ties the tiers to the quote hash, so this is the agent's own check). `cancel_booking`'s `min_refund` equals the API's refund preview, and a cancel response without `refund_minor` is refused (`REFUND_UNKNOWN`);
- every other instruction is a compute-budget instruction or an idempotent ATA creation paid by the fee payer.

The key is never logged; the process zeroes the raw bytes after importing them as a
non-extractable WebCrypto key.

## Run

```sh
pnpm --filter @stumari/mcp start                     # stdio; set STUMARI_API_URL first
pnpm --filter @stumari/mcp test                      # vitest: fake API, quote verification, signing guards, stdio smoke test
pnpm --filter @stumari/mcp typecheck
```

### Claude Desktop

`claude_desktop_config.json` (Windows: `%APPDATA%\Claude\`, macOS: `~/Library/Application Support/Claude/`).
Use absolute paths — Claude Desktop does not start the server in the repo. `tsx` runs the
TypeScript sources directly (the workspace has no build step for this app).

```json
{
  "mcpServers": {
    "stumari": {
      "command": "node",
      "args": [
        "C:/Users/User/Workspace/colosseum/apps/mcp/node_modules/tsx/dist/cli.mjs",
        "C:/Users/User/Workspace/colosseum/apps/mcp/src/index.ts"
      ],
      "env": {
        "STUMARI_API_URL": "http://localhost:3000",
        "AGENT_SECRET_KEY": "<devnet-only base58 secret, or omit to get transactions to sign>",
        "AGENT_MAX_AMOUNT_MINOR": "500000000"
      }
    }
  }
}
```

Fund a devnet agent wallet with the demo faucet (`POST /api/demo/faucet { wallet }`, demo mode
only). Never put a mainnet key in `AGENT_SECRET_KEY`: the server refuses to sign on mainnet, but
the key would still sit in a plain-text config file.

## Layout

| File | Role |
|---|---|
| `src/index.ts` | entry point: env → agent wallet → server → stdio |
| `src/server.ts` | tool registration, input schemas, result/error shaping |
| `src/tools.ts` | the five tools over the API client |
| `src/api.ts`, `src/schemas.ts` | typed REST client; every response is schema-checked |
| `src/agent.ts` | agent wallet and signing policy (cluster, program, cap) |
| `src/tx-guard.ts` | transaction decoding and the instruction-level guards |
| `src/env.ts`, `src/text.ts` | configuration parsing; clipping and plain-language terms |
| `test/fake-api.ts` | in-memory implementation of the API contract that builds real v0 transactions with Kit |
