# Building with the Struct SDK

Practical patterns for building applications with prediction market data.

## Market Screening

Find markets matching specific criteria using filters and sorting.

### High-Volume Active Markets

```typescript
const markets = await client.markets.getMarkets({
	status: "open",
	sort_by: "volume",
	min_volume: 100000,
	include_metrics: true,
	limit: 20,
});
```

### Markets by Category

```typescript
const politicsMarkets = await client.markets.getMarkets({
	categories: "politics",
	status: "open",
	sort_by: "volume",
	include_tags: true,
});
```

### Search Across Markets and Events

```typescript
const results = await client.search.search({
	query: "bitcoin",
	sort_by: "relevance",
});
```

### Price Jump Detection

Find markets with recent significant price movements:

```typescript
const jumps = await client.markets.getPriceJumps({ limit: 20 });

for (const jump of jumps.data) {
	console.log(`${jump.question}: price moved significantly`);
}
```

## Trader Analytics

### Leaderboard

```typescript
const topTraders = await client.trader.getGlobalPnl({
	timeframe: "30d",
	sort_by: "pnl_usd",
	limit: 50,
});

for (const trader of topTraders.data) {
	console.log(`${trader.trader.name}: $${trader.pnl_usd} PnL, ${trader.market_win_rate_pct}% win rate`);
}
```

### Full Trader Breakdown

```typescript
const address = "0xabc...";

const profile = await client.trader.getTraderProfile({ address });
const pnl = await client.trader.getTraderPnl({ address, timeframe: "30d" });
const topMarkets = await client.trader.getTraderMarketPnl({
	address,
	sort_by: "realized_pnl_usd",
	sort_direction: "desc",
	limit: 10,
});
const recentTrades = await client.trader.getTraderTrades({ address, limit: 20 });
```

### PnL Over Time

```typescript
const candles = await client.trader.getTraderPnlCandles({
	address: "0xabc...",
	resolution: "1d",
	limit: 30,
});
```

## Trader Portfolio Composition

There is no single portfolio endpoint. Compose a full trader view from parallel calls:

```typescript
const address = "0xabc...";
const timeframe = "30d";

const [pnlRes, candlesRes, marketPnlRes, outcomePnlRes] = await Promise.all([
	client.trader.getTraderPnl({ address, timeframe }),
	client.trader.getTraderPnlCandles({ address }),
	client.trader.getTraderMarketPnl({ address, timeframe, limit: 100 }),
	client.trader.getTraderOutcomePnl({
		address,
		timeframe,
		limit: 200,
		sort_by: "buy_usd",
		sort_direction: "desc",
	}),
]);
```

## Market Deep Dive

### Full Market Analysis

```typescript
const conditionId = "0xabc...";

const market = await client.markets.getMarket({ conditionId });
const metrics = await client.markets.getMarketMetrics({ conditionId });
const chart = await client.markets.getMarketChart({ conditionId });
const holders = await client.holders.getMarketHolders({ conditionId });
const volume = await client.markets.getMarketVolumeChart({ conditionId });
```

### Candlestick Data for Charts

```typescript
const candles = await client.markets.getCandlestick({
	conditionId: "0xabc...",
	interval: "1h",
});

for (const bar of candles.data) {
	console.log(`O: ${bar.o} H: ${bar.h} L: ${bar.l} C: ${bar.c}`);
}
```

### Resolution Types

`getCandlestick` and `getEventChart` use different resolution values:

| Endpoint | Valid Resolutions |
| -------- | ----------------- |
| `getCandlestick` / `getPositionCandlestick` | `"1"`, `"5"`, `"15"`, `"30"`, `"60"`, `"240"`, `"D"`, `"1D"` |
| `getEventChart` | `"1H"`, `"6H"`, `"1D"`, `"1W"`, `"1M"`, `"ALL"` |

Both candlestick endpoints also accept `count_back` (number of candles, max 2500) and `from`/`to` (Unix seconds) for time range queries.

### Position-Level Analysis

```typescript
const positionId = "pos_123";

const posMetrics = await client.markets.getPositionMetrics({ positionId });
const posCandles = await client.markets.getPositionCandlestick({ positionId, interval: "1h" });
const posVolume = await client.markets.getPositionVolumeChart({ positionId });
const posHolders = await client.holders.getPositionHolders({ positionId });
```

### Order Book Data

```typescript
const marketBook = await client.orderBook.getMarketOrderBook({ condition_id: "0x..." });
const spread = await client.orderBook.getSpreadHistory({ condition_id: "0x..." });
```

## Batch Event Enrichment

When enriching positions with event metadata, batch-fetch by slug (max 50 per call):

```typescript
const slugs = ["us-election-2024", "bitcoin-100k", "fed-rate-cut"];

const batches: string[][] = [];
for (let i = 0; i < slugs.length; i += 50) {
	batches.push(slugs.slice(i, i + 50));
}

const results = await Promise.all(
	batches.map((batch) =>
		client.events.getEvents({ event_slugs: batch.join(","), include_metrics: false })
	)
);

const eventBySlug = new Map();
for (const res of results) {
	if (!res.success) continue;
	for (const event of res.data) {
		eventBySlug.set(event.event_slug, event);
	}
}
```

Pass `include_metrics: false` to reduce response size during enrichment.

## Paginating Large Datasets

Use the `paginate` helper when you need all results:

```typescript
import { paginate } from "@structbuild/sdk";

const allMarkets: MarketMetadata[] = [];
for await (const market of paginate((params) => client.markets.getMarkets(params), { status: "open" })) {
	allMarkets.push(market);
}

for await (const trade of paginate((params) => client.trader.getTraderTrades({ address: "0x...", ...params }))) {
	console.log(trade);
}
```

## Error Handling Patterns

### Retry-Aware Client Setup

```typescript
const client = new StructClient({
	apiKey: process.env.STRUCT_API_KEY!,
	retry: {
		maxRetries: 3,
		initialDelayMs: 1000,
		maxDelayMs: 30000,
	},
});
```

### Graceful Error Handling

```typescript
import { HttpError, TimeoutError, NetworkError } from "@structbuild/sdk";

try {
	const market = await client.markets.getMarket({ conditionId: "0x..." });
} catch (error) {
	if (error instanceof HttpError) {
		if (error.status === 404) {
			console.log("Market not found");
		} else if (error.status === 429) {
			console.log("Rate limited — SDK retries automatically with retry config");
		} else {
			console.log(`HTTP ${error.status}: ${error.statusText}`);
		}
	} else if (error instanceof TimeoutError) {
		console.log(`Request timed out after ${error.timeout}ms`);
	} else if (error instanceof NetworkError) {
		console.log("Network error:", error.message);
	}
}
```
