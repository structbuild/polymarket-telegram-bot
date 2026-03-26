import { getWinningOutcomeName } from "./outcomes.js";
import {
  escapeHtml,
  formatCents,
  formatShortDate,
  formatUsd,
  statusEmoji,
} from "./shared.js";
import type { MarketRecord, Metrics, MetricsWindow, Outcome } from "./types.js";

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

function formatMarketInfoSection(market: MarketRecord, metricsOverride?: MetricsWindow): string[] {
  const items: string[] = [];
  const source = metricsOverride ?? market.metrics;
  const metrics: Metrics | undefined =
    source?.["30d"] ?? source?.["7d"];

  if (metrics?.volume) {
    items.push(`Volume: <code>${formatUsd(metrics.volume)}</code>`);
  }
  if (market.liquidity_usd != null) {
    items.push(`Liquidity: <code>${formatUsd(market.liquidity_usd)}</code>`);
  }
  if (metrics?.unique_traders) {
    items.push(`Traders: <code>${metrics.unique_traders.toLocaleString()}</code>`);
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

export function formatMarket(market: MarketRecord, metricsOverride?: MetricsWindow): string {
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

  const infoSection = formatMarketInfoSection(market, metricsOverride);
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
