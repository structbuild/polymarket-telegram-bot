# API Reference

Complete method reference for all SDK namespaces. Every method accepts an optional `venue` parameter as its last argument and returns `Promise<HttpResponse<T>>`.

## Response Format

```typescript
interface HttpResponse<T> {
	data: T;
	message: string | null;
	success: boolean;
	info?: ApiResponseInfo;
	pagination?: PaginationInfo;
}

interface ApiResponseInfo {
	version: string;
	credits_consumed: number;
	time_taken_ms?: number;
	compute_time_ms?: number;
}

interface PaginationInfo {
	has_more: boolean;
	pagination_key: string | number | null;
}
```

## Markets Namespace

```typescript
client.markets.getMarkets(params?, venue?)
// params: { limit?, pagination_key?, sort_by?, ascending? }
// returns: HttpResponse<MarketMetadata[]>

client.markets.getMarket({ conditionId }, venue?)
// returns: HttpResponse<MarketMetadata>

client.markets.getMarketBySlug({ slug }, venue?)
// returns: HttpResponse<MarketMetadata>

client.markets.getMarketChart({ conditionId, ...query }, venue?)
// returns: HttpResponse<PositionChartOutcome[]>

client.markets.getMarketMetrics({ conditionId, ...query }, venue?)
// returns: HttpResponse<ConditionMetricsResponse>

client.markets.getTrades(params?, venue?)
// params: { conditionId?, limit?, pagination_key? }
// returns: HttpResponse<Trade[]>

client.markets.getCandlestick({ conditionId, interval, ...query }, venue?)
// interval: "1m" | "5m" | "15m" | "1h" | "4h" | "1d"
// returns: HttpResponse<CandlestickResponse>

client.markets.getPositionCandlestick({ positionId, interval, ...query }, venue?)
// returns: HttpResponse<CandlestickResponse>

client.markets.getPositionMetrics({ positionId, ...query }, venue?)
// returns: HttpResponse<PositionMetricsResponse>

client.markets.getMarketVolumeChart({ conditionId, ...query }, venue?)
// returns: HttpResponse<MarketVolumeChartResponse>

client.markets.getPositionVolumeChart({ positionId, ...query }, venue?)
// returns: HttpResponse<PositionVolumeChartResponse>

client.markets.getPriceJumps(params?, venue?)
// returns: HttpResponse<PriceJump[]>
```

## Events Namespace

```typescript
client.events.getEvents(params?, venue?)
// params: { limit?, pagination_key?, sort_by?, ascending? }
// returns: HttpResponse<Event[]>

client.events.getEvent({ identifier, ...query }, venue?)
// returns: HttpResponse<Event>

client.events.getEventBySlug({ slug, ...query }, venue?)
// returns: HttpResponse<Event>

client.events.getEventChart({ eventId, ...query }, venue?)
// returns: HttpResponse<EventMarketChartOutcome[]>

client.events.getEventMetrics({ eventId, ...query }, venue?)
// returns: HttpResponse<EventMetricsResponse>

client.events.getEventOutcomes({ eventId, ...query }, venue?)
// returns: HttpResponse<Record<string, string>>
```

## Trader Namespace

```typescript
client.trader.getTraderTrades({ address, ...query }, venue?)
// returns: HttpResponse<Trade[]>

client.trader.getTraderProfile({ address }, venue?)
// returns: HttpResponse<UserProfile>

client.trader.getTraderProfilesBatch({ addresses }, venue?)
// addresses: comma-separated string of wallet addresses
// returns: HttpResponse<UserProfile[]>

client.trader.getTraderVolumeChart({ address, ...query }, venue?)
// returns: HttpResponse<TraderVolumeChartResponse>

client.trader.getTraderPnl({ address, ...query }, venue?)
// returns: HttpResponse<GlobalPnlTrader>

client.trader.getTraderOutcomePnl({ address, ...query }, venue?)
// returns: HttpResponse<TraderOutcomePnlEntry[]>

client.trader.getTraderMarketPnl({ address, ...query }, venue?)
// returns: HttpResponse<PnlListResponse<TraderMarketPnlEntry>>

client.trader.getTraderEventPnl({ address, ...query }, venue?)
// returns: HttpResponse<PnlListResponse<TraderEventPnlEntry>>

client.trader.getTraderPnlCandles({ address, resolution?, start_ts?, end_ts?, limit? }, venue?)
// resolution: "1h" | "4h" | "1d" | "1w"
// returns: HttpResponse<PnlCandlesResponse>

client.trader.getTraderPnlCalendar({ address, ...query }, venue?)
// returns: HttpResponse<PnlCalendarResponse>

client.trader.getGlobalPnl(params?, venue?)
// returns: HttpResponse<GlobalPnlTrader[]>
```

## Holders Namespace

```typescript
client.holders.getMarketHolders({ conditionId, ...query }, venue?)
// returns: HttpResponse<MarketHoldersResponse>

client.holders.getPositionHolders({ positionId, ...query }, venue?)
// returns: HttpResponse<PositionHoldersResponse>

client.holders.getMarketHoldersHistory({ conditionId, ...query }, venue?)
// returns: HttpResponse<HolderHistoryCandle[]>

client.holders.getPositionHoldersHistory({ positionId, ...query }, venue?)
// returns: HttpResponse<HolderHistoryCandle[]>
```

## Series Namespace

```typescript
client.series.getSeriesList(params?, venue?)
// returns: HttpResponse<Series[]>

client.series.getSeriesOutcomes({ seriesId, ...query }, venue?)
// returns: HttpResponse<Record<string, string>>
```

## Search Namespace

```typescript
client.search.search({ query, ...params }, venue?)
// returns: HttpResponse<SearchResponse>
```

## Tags Namespace

```typescript
client.tags.getTags(params?, venue?)
// returns: HttpResponse<Tag[]>

client.tags.getTag({ identifier }, venue?)
// returns: HttpResponse<Tag>
```

## Bonds Namespace

```typescript
client.bonds.getBonds(params?, venue?)
// returns: HttpResponse<BondMarket[]>
```

## OrderBook Namespace

```typescript
client.orderBook.getOrderBook({ position_id, ...query }, venue?)
// returns: HttpResponse<unknown>

client.orderBook.getOrderBookHistory(params?, venue?)
// params: { position_id?, condition_id?, market_slug?, limit?, pagination_key? }
// returns: HttpResponse<unknown>

client.orderBook.getMarketOrderBook(params?, venue?)
// params: { condition_id?, market_slug? }
// returns: HttpResponse<unknown>

client.orderBook.getSpreadHistory(params?, venue?)
// params: { position_id?, condition_id?, market_slug?, limit?, pagination_key? }
// returns: HttpResponse<unknown>
```

## Assets Namespace

```typescript
client.assets.getAssetHistory({ asset, interval, ...query }, venue?)
// returns: HttpResponse<AssetPriceHistoryRow[]>
```

## Webhooks Namespace

Platform-level (not venue-scoped):

```typescript
client.webhooks.list(params?)
// returns: HttpResponse<WebhookListResponseBody>

client.webhooks.create({ url, event, ...body })
// returns: HttpResponse<WebhookResponse>

client.webhooks.getWebhook({ webhookId })
// returns: HttpResponse<WebhookResponse>

client.webhooks.update({ webhookId, ...body })
// returns: HttpResponse<WebhookResponse>

client.webhooks.deleteWebhook({ webhookId })
// returns: HttpResponse<DeleteWebhookResponse>

client.webhooks.test({ webhookId })
// returns: HttpResponse<WebhookTestResponseBody>

client.webhooks.rotateSecret({ webhookId })
// returns: HttpResponse<RotateSecretResponse>

client.webhooks.listEvents()
// returns: HttpResponse<ListEventsResponse>
```

## Venue Override

Every method accepts an optional `venue` parameter as the last argument:

```typescript
const markets = await client.markets.getMarkets();
const polymarketMarkets = await client.markets.getMarkets({}, "polymarket");
```

## StructWebSocket

```typescript
import { StructWebSocket } from "@structbuild/sdk";

const ws = new StructWebSocket({
	apiKey: "your-api-key",
});
```

Real-time WebSocket feeds for market trades, whale trades, smart money signals, and wallet tracking.

## Error Classes

```typescript
import {
	StructError,
	HttpError,
	NetworkError,
	TimeoutError,
	WebSocketError,
	WebSocketClosedError,
} from "@structbuild/sdk";
```
