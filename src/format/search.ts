import type { Event } from "@structbuild/sdk";
import { escapeHtml, formatShortDate, formatUsd, statusEmoji } from "./shared.js";

function getSearchMetrics(event: Event) {
  return event.metrics?.["30d"] ?? event.metrics?.["7d"] ?? event.metrics?.["24h"];
}

function buildEventUrl(event: Event, botUsername?: string): string | null {
  const slug = event.event_slug ?? "";
  if (!slug || !botUsername) return null;
  return `https://t.me/${botUsername}?start=e_${encodeURIComponent(slug)}`;
}

function formatEventMeta(event: Event): string | null {
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

function formatEventResult(event: Event, botUsername?: string): string {
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
  events: Event[],
  botUsername?: string,
  hasMore = false,
): string {
  const lines = [
    `🔎 <b>Event Results</b> for <code>${escapeHtml(query)}</code>`,
    "",
    ...events.flatMap((event, index) =>
      index < events.length - 1
        ? [formatEventResult(event, botUsername), ""]
        : [formatEventResult(event, botUsername)],
    ),
  ];

  if (hasMore) {
    lines.push("");
    lines.push("<i>Showing the first matches. Refine your query for narrower results.</i>");
  }

  return lines.join("\n");
}
