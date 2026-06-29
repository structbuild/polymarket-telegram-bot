# Polymarket Telegram Bot

Open-source Telegram bot for Polymarket prediction markets. Look up real-time odds, trader P&L, and top holders directly in Telegram. Built with the [Struct API](https://www.struct.to) and [grammY](https://grammy.dev). Fork it, customize it, deploy your own.

---

## Features

### Lookup & search
- **Market Lookup** — Send any Polymarket URL to get live odds, volume, liquidity, and outcome prices
- **Event Overview** — Paste an event link to see all markets within it, with paginated navigation
- **Event Search** — `/search` or `/s` finds events and markets; inline mode via `@YourBot query`
- **Trader Profiles** — Send a wallet address or `polymarket.com/profile/0x…` URL
- **Deep Links** — Share bot links with embedded market slugs or condition IDs

### Discovery
- **`/trending`** — Top open markets by 24h volume
- **`/tags`** — Browse markets by tag/category
- **`/bonds`** — Near-resolution bond markets with APY
- **`/series`** — Recurring market series
- **`/jumps`** — Global price jump scanner across top markets
- **`/leaderboard`** — Top traders by P&L (24h / 7d / 30d / all-time)
- **`/compare`** — Side-by-side two markets or two traders
- **`/crypto`** — Active crypto up/down markets by window (5m, 15m, 1h, 4h, 1d) with spot prices and deep links

### Market analytics (inline buttons on any market)
- Top holders, top traders, recent trades
- **Order book** — Bid/ask depth and spread
- **Holder history** — Holder count trend (72h)
- **Outcome breakdown** — Holders per Yes/No side
- Price jumps, timeframe metrics, refresh

### Trader analytics
- Open/closed positions, activity, categories, markets traded, top wins/losses
- **PnL calendar** — Daily P&L history
- Positions enriched with event metadata via batch Struct lookups

### Event insights (inline buttons on event views)
- **Volume chart** — Top markets by volume over 1D / 1W / 1M
- **Resolved outcomes** — Historical outcome map

### Crypto
- **`/crypto`** — Live up/down windows for BTC, ETH, SOL, and more with Polymarket market links
- BTC/ETH spot price footer on crypto-linked market cards

## How It Works

```
User sends a URL, wallet, /search, /trending, /leaderboard, etc.
  → Bot parses input or command
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

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome & usage |
| `/search`, `/s` | Search events and markets |
| `/trending` | Top markets by volume |
| `/tags` | Browse by tag |
| `/bonds` | Bond screener |
| `/series` | Market series list |
| `/jumps` | Global price jumps |
| `/leaderboard` | Top traders |
| `/compare` | Compare two markets or traders |

## Deep links from alerts bot

Your alerts bot can deep-link into this scanner:

```
https://t.me/YourScannerBot?start=m_{market_slug}
https://t.me/YourScannerBot?start=e_{event_slug}
https://t.me/YourScannerBot?start={40_char_wallet_hex}
```

## Project Structure

```
src/
├── index.ts               # Entry point — bot runner & graceful shutdown
├── bot.ts                 # Bot setup, middleware, command routing
├── env.ts                 # Environment variable validation
├── struct.ts              # Struct SDK client initialization
├── polymarket-url.ts      # URL parsing & input classification
├── format/                # Message formatters
└── handlers/              # Commands, callbacks, API fetch wrappers
```

## Built With

- [Struct SDK](https://www.struct.to) — Polymarket data API
- [grammY](https://grammy.dev) — Telegram Bot framework
- [Bun](https://bun.sh) — JavaScript runtime

## License

MIT — see [LICENSE](LICENSE) for details.
