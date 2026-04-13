import { getWinningOutcomeName } from "./outcomes.js";
import {
  escapeHtml,
  formatCents,
  formatShortDate,
  formatUsd,
  statusEmoji,
} from "./shared.js";
import type { MarketRecord, Metrics, MetricsWindow, Outcome } from "./types.js";

export const MARKET_TIMEFRAMES = ["15m", "1h", "6h", "24h", "7d", "30d"] as const;
export type MarketTimeframe = (typeof MARKET_TIMEFRAMES)[number];
export const DEFAULT_MARKET_TIMEFRAME: MarketTimeframe = "30d";

const TRADER_FALLBACK_TFS: MarketTimeframe[] = ["30d", "7d", "24h", "6h", "1h", "15m"];

export function normalizeMarketTimeframe(raw: string): MarketTimeframe {
  if ((MARKET_TIMEFRAMES as readonly string[]).includes(raw)) {
    return raw as MarketTimeframe;
  }
  return DEFAULT_MARKET_TIMEFRAME;
}

function getMarketQuestion(market: MarketRecord): string {
  return market.question ?? market.title ?? "Unknown Market";
}

function formatEndDate(market: MarketRecord): string | null {
  if (!market.end_time) return null;
  return `📆 Ends on ${formatShortDate(market.end_time)}`;
}

function treeLines(items: string[]): string[] {
  return items.map((item, i) =>
    i < items.length - 1 ? `┣ ${item}` : `┗ ${item}`,
  );
}

function formatPricesSection(outcomes: Outcome[]): string[] {
  if (outcomes.length === 0) return [];

  const items = outcomes.map(
    (o) => `${escapeHtml(o.name)}: <code>${formatCents(o.price)}</code>`,
  );
  return ["💵 <b>Current Prices:</b>", ...treeLines(items)];
}

function tradersForTimeframe(
  source: MetricsWindow | undefined,
  timeframe: MarketTimeframe,
): number | undefined {
  const direct = source?.[timeframe]?.unique_traders;
  if (direct != null) return direct;
  for (const tf of TRADER_FALLBACK_TFS) {
    const u = source?.[tf]?.unique_traders;
    if (u != null) return u;
  }
  return undefined;
}

function formatMarketInfoSection(
  market: MarketRecord,
  metricsOverride: MetricsWindow | undefined,
  timeframe: MarketTimeframe,
): string[] {
  const items: string[] = [];
  const source = metricsOverride ?? market.metrics;
  const vol = source?.[timeframe]?.volume;
  if (vol != null) {
    items.push(`Volume: <code>${formatUsd(vol)}</code>`);
  }

  if (market.liquidity_usd != null) {
    items.push(`Liquidity: <code>${formatUsd(market.liquidity_usd)}</code>`);
  }

  const traders = tradersForTimeframe(source, timeframe);
  if (traders != null) {
    items.push(`Traders: <code>${traders.toLocaleString()}</code>`);
  }

  if (items.length === 0) return [];
  return ["📊 <b>Market Info:</b>", ...treeLines(items)];
}

function buildMarketUrl(market: MarketRecord): string | null {
  const eventSlug = market.event_slug ?? "";
  const slug = market.market_slug ?? market.slug ?? "";

  if (!eventSlug || !slug) {
    return null;
  }

  return `https://polymarket.com/event/${escapeHtml(eventSlug)}/${escapeHtml(slug)}`;
}

export function formatMarket(
  market: MarketRecord,
  metricsOverride?: MetricsWindow,
  timeframe: MarketTimeframe = DEFAULT_MARKET_TIMEFRAME,
): string {
  const lines: string[] = [];
  lines.push(
    `${statusEmoji(market.status)} <b>${escapeHtml(getMarketQuestion(market))}</b>`,
  );

  const endDate = formatEndDate(market);
  if (endDate) {
    lines.push(endDate);
  }

  const isResolved = market.status?.toLowerCase() === "resolved";
  if (isResolved) {
    const winnerName = getWinningOutcomeName(market);
    if (winnerName) {
      lines.push("");
      lines.push(`🏆 <b>Resolved → ${escapeHtml(winnerName)}</b>`);
    }
  } else {
    const pricesSection = formatPricesSection(market.outcomes ?? []);
    if (pricesSection.length) {
      lines.push("");
      lines.push(...pricesSection);
    }
  }

  const infoSection = formatMarketInfoSection(market, metricsOverride, timeframe);
  if (infoSection.length) {
    lines.push("");
    lines.push(...infoSection);
  }

  const marketUrl = buildMarketUrl(market);
  if (marketUrl) {
    lines.push("");
    lines.push(`🔗 <a href="${marketUrl}">View on Polymarket</a>`);
  }

  return lines.join("\n");
}
