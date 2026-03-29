# Polymarket Telegram Bot

Open-source Telegram bot for Polymarket prediction markets. Look up real-time odds, trader P&L, and top holders directly in Telegram. Built with the [Struct API](https://www.struct.to) and [grammY](https://grammy.dev). Fork it, customize it, deploy your own.

---

## Features

- **Market Lookup** — Send any Polymarket URL to get live odds, volume, liquidity, and outcome prices
- **Event Overview** — Paste an event link to see all markets within it, with paginated navigation
- **Trader Profiles** — Send a wallet address (`0x...`) to view a trader's lifetime P&L, win rate, and stats
- **Top Holders** — Tap the inline button on any market to see the top 5 holders per outcome
- **Deep Links** — Share bot links with embedded market slugs or condition IDs that auto-load on open

## How It Works

```
User sends Polymarket URL or wallet address
  → Bot parses input type (market, event, or trader)
  → Fetches data from Struct API
  → Formats and replies with rich Telegram messages + inline buttons
```

## Prerequisites

- [Bun](https://bun.sh) (v1.3.8+) or Node.js (v18+)
- A [Telegram Bot Token](https://core.telegram.org/bots#botfather)
- A [Struct API Key](https://www.struct.to)

## Setup

1. **Clone the repo**

```bash
git clone https://github.com/structbuild/polymarket-telegram-bot.git
cd polymarket-telegram-bot
```

2. **Install dependencies**

```bash
bun install
```

3. **Configure environment variables**

```bash
cp .env.example .env
```

Edit `.env` with your keys:

```
BOT_TOKEN=your-telegram-bot-token
STRUCT_API_KEY=your-struct-api-key
```

4. **Run the bot**

```bash
# Development (watch mode)
bun run dev

# Production
bun run start

# Or with Node.js
bun run start:node
```

## Project Structure

```
src/
├── index.ts               # Entry point — bot runner & graceful shutdown
├── bot.ts                 # Bot setup, middleware, command routing
├── env.ts                 # Environment variable validation
├── struct.ts              # Struct SDK client initialization
├── polymarket-url.ts      # URL parsing & input classification
├── format/
│   ├── market.ts          # Market card formatting
│   ├── event.ts           # Event overview formatting
│   ├── trader.ts          # Trader profile formatting
│   ├── holders.ts         # Top holders formatting
│   ├── outcomes.ts        # Outcome & probability extraction
│   ├── shared.ts          # Shared formatting utilities
│   └── types.ts           # TypeScript types
└── handlers/
    ├── polymarket-link.ts # Main message handler
    ├── polymarket-link.service.ts  # Route by input type
    ├── polymarket-link.fetch.ts    # Struct API calls
    ├── polymarket-link.reply.ts    # Reply utilities
    ├── polymarket-link.errors.ts   # Error handling
    ├── event-pagination.ts         # Paginated event navigation
    ├── top-holders.ts              # Top holders callback handler
    └── trader.fetch.ts             # Trader data fetching
```

## Built With

- [Struct SDK](https://www.struct.to) — Polymarket data API (markets, events, traders, holders)
- [grammY](https://grammy.dev) — Telegram Bot framework for TypeScript
- [Bun](https://bun.sh) — JavaScript runtime & package manager
- [TypeScript](https://www.typescriptlang.org)

## License

MIT — see [LICENSE](LICENSE) for details.
