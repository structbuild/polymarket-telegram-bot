import type { SearchResponse } from "@structbuild/sdk";
import { escapeHtml, formatCents, formatShortDate, formatUsd, statusEmoji } from "./shared.js";

export type SearchEvent = NonNullable<SearchResponse["events"]>[number];
export type SearchMarket = NonNullable<SearchResponse["markets"]>[number];

function getSearchMetrics(event: SearchEvent) {
  return event.metrics?.["30d"] ?? event.metrics?.["7d"] ?? event.metrics?.["24h"];
}

function buildEventUrl(event: SearchEvent, botUsername?: string): string | null {
  const slug = event.event_slug ?? "";
  if (!slug || !botUsername) return null;
  return `https://t.me/${botUsername}?start=e_${encodeURIComponent(slug)}`;
}

function formatEventMeta(event: SearchEvent): string | null {
  const parts: string[] = [];

  if (event.end_time) {
    parts.push(`📅 ${formatShortDate(event.end_time)}`);
  }

  if (event.market_count > 0) {
    parts.push(`📋 ${event.market_count} Market${event.market_count === 1 ? "" : "s"}`);
  }

  const metrics = getSearchMetrics(event);
  if (typeof metrics?.volume === "number" && metrics.volume > 0) {
    parts.push(`💰 ${formatUsd(metrics.volume)} Vol.`);
  }

  if (typeof metrics?.unique_traders === "number" && metrics.unique_traders > 0) {
    parts.push(`👥 ${metrics.unique_traders.toLocaleString()} Traders`);
  }

  return parts.length ? parts.join(" | ") : null;
}

function formatEventResult(event: SearchEvent, botUsername?: string): string {
  const title = escapeHtml(event.title ?? "Untitled Event");
  const url = buildEventUrl(event, botUsername);
  const heading = url ? `<a href="${url}"><b>${title}</b></a>` : `<b>${title}</b>`;
  const lines = [`${statusEmoji(event.status)} ${heading}`];
  const meta = formatEventMeta(event);

  if (meta) {
    lines.push(meta);
  }

  return lines.join("\n");
}

export function formatEventSearchResults(
  query: string,
  events: SearchEvent[],
  botUsername?: string,
  page = 0,
  hasMore = false,
): string {
  const pageLabel = page > 0 || hasMore ? ` <i>(page ${page + 1})</i>` : "";
  const lines = [
    `🔎 <b>Event Results</b>${pageLabel} for <code>${escapeHtml(query)}</code>`,
    "",
    ...events.flatMap((event, index) =>
      index < events.length - 1
        ? [formatEventResult(event, botUsername), ""]
        : [formatEventResult(event, botUsername)],
    ),
  ];

  return lines.join("\n");
}

function getMarketMetrics(market: SearchMarket) {
  return market.metrics?.["30d"] ?? market.metrics?.["7d"] ?? market.metrics?.["24h"];
}

function buildMarketUrl(market: SearchMarket, botUsername?: string): string | null {
  const slug = market.market_slug ?? "";
  if (!slug || !botUsername) return null;
  return `https://t.me/${botUsername}?start=m_${slug}`;
}

function formatMarketResult(market: SearchMarket, botUsername?: string): string {
  const title = escapeHtml(market.question ?? market.title ?? "Untitled Market");
  const url = buildMarketUrl(market, botUsername);
  const heading = url ? `<a href="${url}"><b>${title}</b></a>` : `<b>${title}</b>`;
  const lines = [`${statusEmoji(market.status)} ${heading}`];
  const metrics = getMarketMetrics(market);
  const parts: string[] = [];
  if (typeof metrics?.volume === "number" && metrics.volume > 0) {
    parts.push(`💰 ${formatUsd(metrics.volume)} Vol.`);
  }
  const top = market.outcomes?.find((o) => o.price != null);
  if (top?.price != null) {
    parts.push(`${top.name} ${formatCents(top.price)}`);
  }
  if (parts.length) lines.push(parts.join(" | "));
  return lines.join("\n");
}

export function formatCombinedSearchResults(
  query: string,
  events: SearchEvent[],
  markets: SearchMarket[],
  botUsername?: string,
  page = 0,
  hasMore = false,
): string {
  const pageLabel = page > 0 || hasMore ? ` <i>(page ${page + 1})</i>` : "";
  const lines = [`🔎 <b>Search Results</b>${pageLabel} for <code>${escapeHtml(query)}</code>`, ""];

  if (events.length > 0) {
    lines.push("<b>Events</b>", "");
    lines.push(
      ...events.flatMap((event, index) =>
        index < events.length - 1
          ? [formatEventResult(event, botUsername), ""]
          : [formatEventResult(event, botUsername)],
      ),
    );
  }

  if (markets.length > 0) {
    if (events.length > 0) lines.push("");
    lines.push("<b>Markets</b>", "");
    lines.push(
      ...markets.flatMap((market, index) =>
        index < markets.length - 1
          ? [formatMarketResult(market, botUsername), ""]
          : [formatMarketResult(market, botUsername)],
      ),
    );
  }

  if (events.length === 0 && markets.length === 0) {
    lines.push("No results found.");
  }

  if (hasMore) {
    lines.push("");
    lines.push("<i>More events on the next page ▶️</i>");
  }

  return lines.join("\n");
}
