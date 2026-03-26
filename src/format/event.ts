import { getMarketProbability, getWinningOutcomeName } from "./outcomes.js";
import {
  escapeHtml,
  formatPercent,
  formatShortDate,
  formatUsd,
  statusEmoji,
} from "./shared.js";
import type { EventRecord, MarketRecord, Metrics } from "./types.js";

function getEventTitle(event: EventRecord): string {
  return event.title ?? "Untitled Event";
}

function formatEventInfoLine(event: EventRecord): string | null {
  const info: string[] = [];

  if (event.end_time) {
    info.push(`📅 ${formatShortDate(event.end_time)}`);
  }

  const metrics: Metrics | undefined =
    event.metrics?.["30d"] ?? event.metrics?.["7d"];
  if (metrics?.volume) {
    info.push(`💰 ${formatUsd(metrics.volume)} Vol.`);
  }
  if (metrics?.unique_traders) {
    info.push(`👥 ${metrics.unique_traders.toLocaleString()} Traders`);
  }

  return info.length ? info.join(" | ") : null;
}

function getEventMarketCount(markets: MarketRecord[]): number {
  return markets.length;
}

function isMarketResolved(market: MarketRecord): boolean {
  if (market.winning_outcome) {
    return true;
  }
  return market.status?.toLowerCase() === "resolved";
}

function partitionMarkets(markets: MarketRecord[]): {
  open: MarketRecord[];
  resolved: MarketRecord[];
} {
  const open: MarketRecord[] = [];
  const resolved: MarketRecord[] = [];

  for (const market of markets) {
    (isMarketResolved(market) ? resolved : open).push(market);
  }

  return { open, resolved };
}

function sortOpenMarkets(markets: MarketRecord[]): MarketRecord[] {
  return [...markets].sort(
    (left, right) =>
      (getMarketProbability(right) ?? 0) - (getMarketProbability(left) ?? 0),
  );
}

function getDisplayLabel(market: MarketRecord): string {
  return market.title ?? market.question ?? "Unknown";
}

function formatEventMarketMetricsSuffix(market: MarketRecord): string {
  const parts: string[] = [];
  const v24 = market.volume_24hr;
  if (typeof v24 === "number" && v24 > 0) {
    parts.push(`<code>${formatUsd(v24)}</code> Vol.`);
  }
  const liq = market.liquidity_usd;
  if (typeof liq === "number" && liq > 0) {
    parts.push(`<code>${formatUsd(liq)}</code> Liq.`);
  }
  if (parts.length === 0) {
    return "";
  }
  return ` - ${parts.join(" | ")}`;
}

function buildMarketDeepLink(market: MarketRecord, botUsername?: string): string | null {
  if (!botUsername) return null;
  const conditionId = market.condition_id as string | undefined;
  if (!conditionId) return null;
  const id = conditionId.replace(/^0x/, "");
  return `https://t.me/${botUsername}?start=${id}`;
}

function formatEventMarketLine(market: MarketRecord, botUsername?: string): string {
  const label = escapeHtml(getDisplayLabel(market));
  const metricsSuffix = formatEventMarketMetricsSuffix(market);

  if (isMarketResolved(market)) {
    const winnerName = getWinningOutcomeName(market);
    const outcome = winnerName ? ` → <i>${escapeHtml(winnerName)}</i>` : "";
    const url = buildMarketDeepLink(market, botUsername);
    const trophy = url ? `<a href="${url}">🏆</a>` : "🏆";
    return `${trophy} <b>${label}</b>${outcome}${metricsSuffix}`;
  }

  const pct = formatPercent(getMarketProbability(market) ?? 0);
  const url = buildMarketDeepLink(market, botUsername);
  const pctText = url
    ? `<a href="${url}">${pct}</a>`
    : `<code>${pct}</code>`;
  return `${pctText} ${label}${metricsSuffix}`;
}

function buildEventUrl(event: EventRecord): string | null {
  const eventSlug = event.event_slug ?? "";
  if (!eventSlug) {
    return null;
  }

  return `https://polymarket.com/event/${escapeHtml(eventSlug)}`;
}

function isEventFullyResolved(markets: MarketRecord[]): boolean {
  return markets.length > 0 && markets.every(isMarketResolved);
}

function statusForEventHeader(
  markets: MarketRecord[],
  eventStatus: string | null | undefined,
): string | null {
  if (markets.length === 0) {
    return eventStatus ?? null;
  }
  if (isEventFullyResolved(markets)) {
    return "resolved";
  }
  return "open";
}

export function formatEvent(
  event: EventRecord,
  botUsername?: string,
  page = 0,
  pageSize = 12,
): string {
  const lines: string[] = [];
  const markets = event.markets ?? [];
  const { open, resolved } = partitionMarkets(markets);
  const orderedMarkets = [...sortOpenMarkets(open), ...resolved];
  const totalMarkets = getEventMarketCount(markets);

  const start = page * pageSize;
  const end = Math.min(start + pageSize, totalMarkets);
  const displayMarkets = orderedMarkets.slice(start, end);

  const resolvedLabel = isEventFullyResolved(markets)
    ? " <i>(Resolved)</i>"
    : "";
  lines.push(
    `${statusEmoji(statusForEventHeader(markets, event.status))} <b>${escapeHtml(getEventTitle(event))}</b>${resolvedLabel}`,
  );

  const infoLine = formatEventInfoLine(event);
  if (infoLine) {
    lines.push(infoLine);
  }

  lines.push("");
  lines.push(
    `📋 <b>${totalMarkets} Market${totalMarkets === 1 ? "" : "s"}</b> <i>(Showing 24hr volume)</i>`,
  );

  if (start > 0) {
    lines.push(`<i>... ${start} previous market${start === 1 ? "" : "s"}</i>`);
  }

  for (const market of displayMarkets) {
    lines.push(formatEventMarketLine(market, botUsername));
  }

  const remaining = totalMarkets - end;
  if (remaining > 0) {
    lines.push(`<i>... and ${remaining} more market${remaining === 1 ? "" : "s"}</i>`);
  }

  const eventUrl = buildEventUrl(event);
  if (eventUrl) {
    lines.push("");
    lines.push(`🔗 <a href="${eventUrl}">View on Polymarket</a>`);
  }

  return lines.join("\n");
}
