# Webhooks Reference

Webhooks push data to your server when events occur — no polling needed. Each webhook subscribes to one event type with optional filters.

## Payload Format

Every webhook delivery is wrapped in an envelope:

```typescript
interface WebhookDelivery<T> {
	id: string;
	event: string;
	data: T;
	timestamp: number;
	webhook_id: string;
	attempt: number;
}
```

Example payload for `trader_whale_trade`:

```json
{
	"id": "2e346a40-87a6-4ebd-9aba-40fa7f0a6ade",
	"event": "trader_whale_trade",
	"data": {
		"trader": "0xb4D2499b...",
		"position_id": "0",
		"condition_id": "0x3939cfa...",
		"trade_id": "0xbf1b5eb...",
		"hash": "0x4973daa...",
		"block": 83952574,
		"confirmed_at": 1773025181,
		"amount_usd": 1041.83,
		"shares_amount": 1041.83,
		"side": "Sell",
		"price": 1.0,
		"exchange": "ConditionalTokens",
		"trade_type": "Merge"
	},
	"timestamp": 1773025181859,
	"webhook_id": "26cc4fb7-c62e-450c-a532-07196afd7b67",
	"attempt": 1
}
```

The `data` field shape varies by event type. The full payload schemas are in the webhook OpenAPI spec:

```
GET https://api.struct.to/webhookopenapi.json
```

The spec is large. Payload types are under `components.schemas` and named `<EventName>Payload` (e.g., `AssetPriceTickPayload`, `WhaleTradePayload`, `ProbabilitySpikePayload`). To find the schema for a specific event, search for the event name in PascalCase + "Payload" within the `components.schemas` object.

Payload name mapping:

| Event | Schema Name |
| ----- | ----------- |
| `trader_first_trade` | `FirstTradePayload` |
| `trader_new_market` | `FirstTradePayload` |
| `trader_whale_trade` | `WhaleTradePayload` |
| `trader_global_pnl` | `GlobalPnlPayload` |
| `trader_market_pnl` | `MarketPnlPayload` |
| `trader_event_pnl` | `EventPnlPayload` |
| `condition_metrics` | `ConditionMetricsPayload` |
| `event_metrics` | `EventMetricsPayload` |
| `position_metrics` | `PositionMetricsPayload` |
| `market_volume_milestone` | `VolumeMilestonePayload` |
| `event_volume_milestone` | `EventVolumeMilestonePayload` |
| `position_volume_milestone` | `PositionVolumeMilestonePayload` |
| `market_volume_spike` | `MarketVolumeSpikePayload` |
| `event_volume_spike` | `EventVolumeSpikePayload` |
| `position_volume_spike` | `PositionVolumeSpikePayload` |
| `probability_spike` | `ProbabilitySpikePayload` |
| `close_to_bond` | `CloseToBondPayload` |
| `market_created` | `MarketCreatedPayload` |
| `asset_price_tick` | `AssetPriceTickPayload` |
| `asset_price_window_update` | `AssetPriceWindowUpdatePayload` |
| `price_spike` | `PriceSpikePayload` |
| `trader_new_trade` | `NewTradePayload` |

## Creating a Webhook

```typescript
await client.webhooks.create({
	url: "https://your-app.com/webhooks/trades",
	event: "trader_whale_trade",
	secret: "optional-hmac-secret",
	description: "Whale trade alerts",
	filters: {
		condition_ids: ["0xabc..."],
		min_usd_value: 10000,
	},
});
```

### Parameters

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `url` | string | Yes | HTTPS endpoint to receive payloads |
| `event` | string | Yes | Event type to subscribe to |
| `secret` | string | No | HMAC secret for payload verification |
| `description` | string | No | Human-readable name for the webhook |
| `filters` | object | No | Event-specific filters (see below) |

## Events

### Trader Events

| Event | Description | Key Filters |
| ----- | ----------- | ----------- |
| `trader_first_trade` | Trader makes their first trade | `wallet_addresses`, `condition_ids`, `event_slugs` |
| `trader_new_market` | Trader enters a new market | `wallet_addresses`, `condition_ids`, `event_slugs` |
| `trader_whale_trade` | Large trade by a tracked trader | `wallet_addresses`, `min_usd_value`, `condition_ids` |
| `trader_global_pnl` | Global PnL update | `traders`, `min_realized_pnl_usd`, `min_win_rate`, `min_markets_traded` |
| `trader_market_pnl` | Market-level PnL update | `traders`, `condition_ids`, `min_realized_pnl_usd` |
| `trader_event_pnl` | Event-level PnL update | `traders`, `event_slugs`, `min_realized_pnl_usd` |
| `trader_new_trade` | Any new trade by a tracked trader | `wallet_addresses`, `condition_ids`, `event_slugs` |

### Metrics Events

| Event | Description | Key Filters |
| ----- | ----------- | ----------- |
| `condition_metrics` | Market metrics update | `condition_ids`, `timeframes`, `min_price_change_pct`, `min_unique_traders` |
| `event_metrics` | Event-level metrics update | `event_slugs`, `timeframes`, `min_volume_usd` |
| `position_metrics` | Position-level metrics update | `position_ids`, `timeframes`, `min_probability_change_pct` |

### Volume Events

| Event | Description | Key Filters |
| ----- | ----------- | ----------- |
| `market_volume_milestone` | Market hits volume milestone | `condition_ids`, `milestone_amounts`, `timeframes` |
| `event_volume_milestone` | Event hits volume milestone | `event_slugs`, `milestone_amounts`, `timeframes` |
| `position_volume_milestone` | Position hits volume milestone | `position_ids`, `milestone_amounts`, `timeframes` |
| `market_volume_spike` | Market volume spikes | `condition_ids`, `baseline_volume_usd`, `spike_ratio` |
| `event_volume_spike` | Event volume spikes | `event_slugs`, `baseline_volume_usd`, `spike_ratio` |
| `position_volume_spike` | Position volume spikes | `position_ids`, `baseline_volume_usd`, `spike_ratio` |

### Price & Market Events

| Event | Description | Key Filters |
| ----- | ----------- | ----------- |
| `probability_spike` | Dramatic probability change | `condition_ids`, `position_ids`, `min_probability_change_pct`, `timeframes` |
| `close_to_bond` | Price approaches bond value | `condition_ids`, `min_probability` |
| `market_created` | New market created | (none) |
| `price_spike` | Significant price movement in a market | `condition_ids`, `min_price_change_pct`, `timeframes`, `spike_direction`, `window_secs` |

### Asset Events

| Event | Description | Key Filters |
| ----- | ----------- | ----------- |
| `asset_price_tick` | Crypto price update | `asset_symbols` (BTC, ETH, SOL, XRP) |
| `asset_price_window_update` | Price window update (5m, 15m, 1h, 24h) | `asset_symbols` |

## Filters Reference

### Address Filters

| Filter | Type | Used By |
| ------ | ---- | ------- |
| `wallet_addresses` | string[] | first_trade, new_market, whale_trade |
| `traders` | string[] | PnL events |

### Market Filters

| Filter | Type | Description |
| ------ | ---- | ----------- |
| `condition_ids` | string[] | Filter by market condition IDs |
| `event_slugs` | string[] | Filter by event slugs |
| `position_ids` | string[] | Filter by position IDs |
| `outcomes` | string[] | Filter by outcome name (e.g., "Yes", "No") |
| `position_outcome_indices` | number[] | Filter by outcome index (0=Yes, 1=No) |

### Value Filters

| Filter | Type | Description |
| ------ | ---- | ----------- |
| `min_usd_value` | number | Minimum trade size (USD) |
| `min_probability` | number | Minimum probability (0.0-1.0) |
| `max_probability` | number | Maximum probability (0.0-1.0) |

### PnL Filters

| Filter | Type | Description |
| ------ | ---- | ----------- |
| `min_realized_pnl_usd` | number | Minimum realized PnL |
| `max_realized_pnl_usd` | number | Maximum realized PnL |
| `min_win_rate` | number | Minimum win rate (0.0-100.0) |
| `min_markets_traded` | number | Minimum markets traded |

### Volume Filters

| Filter | Type | Description |
| ------ | ---- | ----------- |
| `min_volume_usd` | number | Minimum total volume |
| `max_volume_usd` | number | Maximum total volume |
| `min_buy_usd` | number | Minimum buy volume |
| `min_sell_volume_usd` | number | Minimum sell volume |

### Metrics Filters

| Filter | Type | Description |
| ------ | ---- | ----------- |
| `min_fees` | number | Minimum fees (USD) |
| `min_txns` | number | Minimum transaction count |
| `min_unique_traders` | number | Minimum unique traders |
| `min_price_change_pct` | number | Minimum price change % |
| `min_probability_change_pct` | number | Minimum probability change % |

### Timeframe & Milestone Filters

| Filter | Type | Description |
| ------ | ---- | ----------- |
| `timeframes` | string[] | Valid: 1m, 5m, 30m, 1h, 6h, 24h, 7d, 30d |
| `milestone_amounts` | number[] | Volume milestones (USD) |

### Volume Spike Filters

| Filter | Type | Description |
| ------ | ---- | ----------- |
| `baseline_volume_usd` | number | User-defined baseline volume |
| `spike_ratio` | number | Spike multiplier (must be > 1.0) |

### Asset Filters

| Filter | Type | Description |
| ------ | ---- | ----------- |
| `asset_symbols` | string[] | BTC, ETH, SOL, XRP |

### Spike Filters

| Filter | Type | Description |
| ------ | ---- | ----------- |
| `spike_direction` | string | "up", "down", or "both" |
| `window_secs` | number | Observation window in seconds for spike detection |

### Other Filters

| Filter | Type | Description |
| ------ | ---- | ----------- |
| `exclude_shorterm_market_timeframes` | boolean | Exclude short-term markets |
| `exclude_shortterm_markets` | boolean | Exclude short-term/updown markets |

## Examples

### Whale Trade Alerts

```typescript
await client.webhooks.create({
	url: "https://your-app.com/webhooks/whale-trades",
	event: "trader_whale_trade",
	filters: {
		condition_ids: ["0xabc..."],
		min_usd_value: 10000,
	},
});
```

### Price Movement Alerts

```typescript
await client.webhooks.create({
	url: "https://your-app.com/webhooks/price-spikes",
	event: "probability_spike",
	filters: {
		condition_ids: ["0xabc..."],
		min_probability_change_pct: 5,
		timeframes: ["1h", "24h"],
	},
});
```

### Volume Spike Detection

```typescript
await client.webhooks.create({
	url: "https://your-app.com/webhooks/volume-spikes",
	event: "market_volume_spike",
	filters: {
		baseline_volume_usd: 50000,
		spike_ratio: 3,
	},
});
```

### Portfolio PnL Tracking

```typescript
await client.webhooks.create({
	url: "https://your-app.com/webhooks/pnl",
	event: "trader_global_pnl",
	filters: {
		traders: ["0xabc..."],
		min_realized_pnl_usd: 1000,
	},
});
```

### New Market Monitoring

```typescript
await client.webhooks.create({
	url: "https://your-app.com/webhooks/new-markets",
	event: "market_created",
});
```

### Crypto Asset Price Tracking

```typescript
await client.webhooks.create({
	url: "https://your-app.com/webhooks/asset-prices",
	event: "asset_price_window_update",
	filters: {
		asset_symbols: ["BTC", "ETH"],
	},
});
```

## Security

Use HMAC secrets to verify webhook payloads:

```typescript
const webhook = await client.webhooks.create({
	url: "https://your-app.com/webhooks/trades",
	event: "trader_whale_trade",
	secret: "your-hmac-secret",
});

await client.webhooks.rotateSecret({ webhookId: webhook.data.id });
```

## Signature Verification

Verify webhook deliveries using the `x-struct-signature` header:

```typescript
import { createHmac, timingSafeEqual } from "crypto";

function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
	const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
	const sig = signature.startsWith("sha256=") ? signature.slice(7) : signature;
	return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
}
```

The signature is sent in the `x-struct-signature` header (fallback: `x-webhook-signature`). It may include a `sha256=` prefix.

## Managing Webhooks

```typescript
const all = await client.webhooks.list();

const detail = await client.webhooks.getWebhook({ webhookId: "wh_123" });

await client.webhooks.update({
	webhookId: "wh_123",
	url: "https://new-url.com/webhook",
});

await client.webhooks.test({ webhookId: "wh_123" });

await client.webhooks.deleteWebhook({ webhookId: "wh_123" });

const availableEvents = await client.webhooks.listEvents();
```
