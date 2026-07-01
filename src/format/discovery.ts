import type { BondMarket, MarketResponse, Series } from "@structbuild/sdk";
import { escapeHtml, formatCents, formatShortDate, formatUsd, statusEmoji, truncate } from "./shared.js";

type TagLike = { label?: string; slug?: string | null; volume_usd?: number; event_count?: number };

function marketDeepLink(slug: string | null | undefined, botUsername?: string): string | null {
  if (!slug || !botUsername) return null;
  return `https://t.me/${botUsername}?start=m_${slug}`;
}

function eventDeepLink(slug: string | null | undefined, botUsername?: string): string | null {
  if (!slug || !botUsername) return null;
  return `https://t.me/${botUsername}?start=e_${encodeURIComponent(slug)}`;
}

function getVolume(market: MarketResponse): number | undefined {
  return (
    market.metrics?.["30d"]?.volume ??
    market.metrics?.["7d"]?.volume ??
    market.metrics?.["24h"]?.volume ??
    market.volume_usd ??
    undefined
  );
}

function topOutcomePrice(market: MarketResponse): string | null {
  const outcome = market.outcomes?.find((o) => o.price != null);
  if (outcome?.price != null) {
    return `${outcome.name} ${formatCents(outcome.price)}`;
  }
  return null;
}

export function formatTrendingMarkets(
  markets: MarketResponse[],
  page: number,
  pageSize: number,
  hasMore: boolean,
  botUsername?: string,
): string {
  const pageLabel = page > 0 || hasMore ? ` <i>(page ${page + 1})</i>` : "";
  const lines = [`🔥 <b>Trending Markets</b>${pageLabel}`, "<i>Sorted by 24h volume</i>", ""];

  if (markets.length === 0) {
    lines.push("No open markets found.");
    return lines.join("\n");
  }

  markets.forEach((market, i) => {
    const slug = market.market_slug;
    const title = truncate(market.question ?? market.title ?? "Untitled", 72);
    const url = marketDeepLink(slug, botUsername);
    const heading = url ? `<a href="${url}"><b>${escapeHtml(title)}</b></a>` : `<b>${escapeHtml(title)}</b>`;
    const vol = getVolume(market);
    const parts = [statusEmoji(market.status), heading];
    const meta: string[] = [];
    if (vol != null && vol > 0) meta.push(`💰 ${formatUsd(vol)}`);
    const outcome = topOutcomePrice(market);
    if (outcome) meta.push(outcome);
    lines.push(`${i + 1 + page * pageSize}. ${parts.join(" ")}`);
    if (meta.length) lines.push(`   ${meta.join(" · ")}`);
    if (i < markets.length - 1) lines.push("");
  });

  if (hasMore) {
    lines.push("");
    lines.push("<i>More on the next page ▶️</i>");
  }
  return lines.join("\n");
}

export function formatTagsList(tags: TagLike[], botUsername?: string): string {
  const lines = ["🏷 <b>Browse by Tag</b>", "<i>Tap a tag to see top markets</i>", ""];
  if (tags.length === 0) {
    lines.push("No tags found.");
    return lines.join("\n");
  }
  tags.forEach((tag, i) => {
    const label = escapeHtml(tag.label ?? tag.slug ?? "Tag");
    const slug = tag.slug ?? tag.label ?? "";
    const vol = tag.volume_usd != null && tag.volume_usd > 0 ? formatUsd(tag.volume_usd) : null;
    const count = tag.event_count ? `${tag.event_count} events` : null;
    const meta = [vol, count].filter(Boolean).join(" · ");
    lines.push(`${i + 1}. <b>${label}</b>${meta ? ` — ${meta}` : ""}`);
    if (slug) lines.push(`   <code>${escapeHtml(slug)}</code>`);
    if (i < tags.length - 1) lines.push("");
  });
  if (botUsername) {
    lines.push("");
    lines.push("<i>Use inline buttons below to open a tag.</i>");
  }
  return lines.join("\n");
}

export function formatTagMarkets(
  tagLabel: string,
  markets: MarketResponse[],
  page: number,
  pageSize: number,
  hasMore: boolean,
  botUsername?: string,
): string {
  const pageLabel = page > 0 || hasMore ? ` <i>(page ${page + 1})</i>` : "";
  const lines = [`🏷 <b>${escapeHtml(tagLabel)}</b>${pageLabel}`, ""];
  if (markets.length === 0) {
    lines.push("No markets found for this tag.");
    return lines.join("\n");
  }
  markets.forEach((market, i) => {
    const slug = market.market_slug;
    const title = truncate(market.question ?? market.title ?? "Untitled", 72);
    const url = marketDeepLink(slug, botUsername);
    const heading = url ? `<a href="${url}"><b>${escapeHtml(title)}</b></a>` : `<b>${escapeHtml(title)}</b>`;
    const vol = getVolume(market);
    lines.push(`${i + 1 + page * pageSize}. ${heading}`);
    if (vol != null && vol > 0) lines.push(`   💰 ${formatUsd(vol)}`);
    if (i < markets.length - 1) lines.push("");
  });
  if (hasMore) {
    lines.push("");
    lines.push("<i>More on the next page ▶️</i>");
  }
  return lines.join("\n");
}

export function formatSeriesList(series: Series[]): string {
  const lines = ["🔁 <b>Market Series</b>", "<i>Recurring prediction markets</i>", ""];
  if (series.length === 0) {
    lines.push("No series found.");
    return lines.join("\n");
  }
  series.forEach((item, i) => {
    const title = escapeHtml(truncate(item.title ?? item.slug ?? "Series", 64));
    lines.push(`${i + 1}. <b>${title}</b>`);
    if (item.recurrence) lines.push(`   🔁 ${escapeHtml(item.recurrence)}`);
    if (item.series_type) lines.push(`   📂 ${escapeHtml(item.series_type)}`);
    if (i < series.length - 1) lines.push("");
  });
  return lines.join("\n");
}

export function formatBondMarkets(
  bonds: BondMarket[],
  page: number,
  pageSize: number,
  hasMore: boolean,
  botUsername?: string,
): string {
  const pageLabel = page > 0 || hasMore ? ` <i>(page ${page + 1})</i>` : "";
  const lines = [
    `📎 <b>Bond Markets</b>${pageLabel}`,
    "<i>Near-resolution markets with high implied yield</i>",
    "",
  ];
  if (bonds.length === 0) {
    lines.push("No bond markets found.");
    return lines.join("\n");
  }
  bonds.forEach((bond, i) => {
    const title = truncate(bond.question ?? bond.title ?? "Untitled", 72);
    const url = marketDeepLink(bond.market_slug, botUsername);
    const heading = url ? `<a href="${url}"><b>${escapeHtml(title)}</b></a>` : `<b>${escapeHtml(title)}</b>`;
    const best = bond.outcomes?.[bond.best_outcome_index];
    const price = best?.price != null ? formatCents(best.price) : "—";
    lines.push(`${i + 1 + page * pageSize}. ${heading}`);
    lines.push(
      `   ${escapeHtml(best?.name ?? "Yes")}: <code>${price}</code> · APY: <code>${bond.apy.toFixed(1)}%</code> · Return: <code>${bond.return_pct.toFixed(1)}%</code>`,
    );
    if (bond.end_time) lines.push(`   📅 ${formatShortDate(bond.end_time)}`);
    if (i < bonds.length - 1) lines.push("");
  });
  if (hasMore) {
    lines.push("");
    lines.push("<i>More on the next page ▶️</i>");
  }
  return lines.join("\n");
}
