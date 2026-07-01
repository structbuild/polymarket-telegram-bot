import type { AssetPriceHistoryRow, Event, EventMarket } from "@structbuild/sdk";
import { eventDeepLink, marketDeepLink } from "./links.js";
import { escapeHtml, formatCents, formatPctSuffix } from "./shared.js";

export const CRYPTO_ASSETS = ["BTC", "ETH", "XRP", "SOL", "DOGE", "BNB", "HYPE"] as const;
export type CryptoAsset = (typeof CRYPTO_ASSETS)[number];

export const CRYPTO_VARIANTS = ["5m", "15m", "1h", "4h", "1d"] as const;
export type CryptoVariant = (typeof CRYPTO_VARIANTS)[number];

export const CRYPTO_VARIANT_LABELS: Record<CryptoVariant, string> = {
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
};

const ASSET_EMOJI: Record<CryptoAsset, string> = {
  BTC: "🟠",
  ETH: "⚪",
  XRP: "⚫",
  SOL: "🟣",
  DOGE: "🟡",
  BNB: "🟨",
  HYPE: "🟢",
};

export type CryptoMarketEntry = {
  asset: CryptoAsset;
  priceRow: AssetPriceHistoryRow | null;
  spotPrice: number | null;
  event: Event | null;
  market: EventMarket | null;
};

export function cryptoEventSlug(
  asset: CryptoAsset,
  variant: CryptoVariant,
  startTimeSeconds: number,
): string {
  return `${asset.toLowerCase()}-updown-${variant}-${startTimeSeconds}`;
}

function isUsablePrice(price: number | null | undefined): price is number {
  return price != null && price > 0;
}

export function resolveWindowPrice(
  row: AssetPriceHistoryRow,
  spotPrice: number | null,
): {
  current: number | null;
  open: number | null;
  pct: number | null;
  outcome: string | null;
  isClosed: boolean;
} {
  const open = isUsablePrice(row.asset_open_price) ? row.asset_open_price : null;
  const isClosed = row.outcome != null && isUsablePrice(row.asset_close_price);
  const current = isClosed
    ? row.asset_close_price
    : isUsablePrice(spotPrice)
      ? spotPrice
      : open;

  let pct = row.price_change_percentage ?? null;
  if (!isClosed && open != null && current != null) {
    pct = ((current - open) / open) * 100;
  }

  let outcome = row.outcome ?? null;
  if (!isClosed && open != null && current != null) {
    outcome = current > open ? "up" : "down";
  }

  return { current, open, pct, outcome, isClosed };
}

export function normalizeCryptoVariant(raw: string): CryptoVariant {
  if ((CRYPTO_VARIANTS as readonly string[]).includes(raw)) {
    return raw as CryptoVariant;
  }
  return "5m";
}

export function cryptoSeriesSlug(asset: CryptoAsset, variant: CryptoVariant): string {
  return `${asset.toLowerCase()}-updown-${variant}`;
}

function formatAssetPrice(price: number): string {
  if (price >= 1000) {
    return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function formatOutcomeEmoji(outcome: string | null | undefined): string {
  if (outcome === "up") return "🟢";
  if (outcome === "down") return "🔴";
  return "⏳";
}

function formatWindowShort(endTime: number | null | undefined): string | null {
  if (endTime == null) return null;
  const remaining = endTime - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return "ended";
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatCompactOdds(market: EventMarket | null): string | null {
  if (!market?.outcomes?.length) return null;
  const parts = market.outcomes
    .filter((o) => o.price != null)
    .slice(0, 2)
    .map((o) => {
      const name = (o.name ?? "").toLowerCase();
      const prefix = name.includes("up") || name === "yes" ? "↑" : "↓";
      return `${prefix}${formatCents(o.price)}`;
    });
  return parts.length ? parts.join(" ") : null;
}

function pickActiveMarket(event: Event | null): EventMarket | null {
  const markets = event?.markets ?? [];
  if (markets.length === 0) return null;
  const open = markets.find((m) => m.status?.toLowerCase() === "open");
  return open ?? markets[0] ?? null;
}

function formatCryptoEntry(
  entry: CryptoMarketEntry,
): string {
  const emoji = ASSET_EMOJI[entry.asset];
  const url =
    marketDeepLink({
      marketSlug: entry.market?.market_slug,
      conditionId: entry.market?.condition_id,
      eventSlug: entry.event?.event_slug,
      eventId: entry.event?.id,
    }) ??
    eventDeepLink({
      eventSlug: entry.event?.event_slug,
      eventId: entry.event?.id,
    });
  const label = `${emoji} ${entry.asset}`;
  const heading = url
    ? `<a href="${url}"><b>${escapeHtml(label)}</b></a>`
    : `<b>${escapeHtml(label)}</b>`;

  const row = entry.priceRow;
  if (!row) return `${heading} · <i>no data</i>`;

  const { current, open, pct, outcome } = resolveWindowPrice(row, entry.spotPrice);
  const parts = [heading];

  if (current != null) {
    parts.push(
      `<code>${formatAssetPrice(current)}</code>${escapeHtml(formatPctSuffix(pct))} ${formatOutcomeEmoji(outcome)}`,
    );
  } else if (open != null) {
    parts.push(`<code>${formatAssetPrice(open)}</code> ${formatOutcomeEmoji(outcome)}`);
  }

  const window = formatWindowShort(row.end_time);
  if (window) parts.push(escapeHtml(window));

  const odds = formatCompactOdds(entry.market);
  if (odds) parts.push(escapeHtml(odds));

  return parts.join(" · ");
}

export function formatCryptoMarkets(
  entries: CryptoMarketEntry[],
  variant: CryptoVariant,
  botUsername?: string,
): string {
  const label = CRYPTO_VARIANT_LABELS[variant];
  const lines = [`🪙 <b>Crypto Up/Down</b> · ${label}`, ""];

  const visible = entries.filter((entry) => entry.priceRow || entry.event);
  if (visible.length === 0) {
    lines.push("No active crypto up/down markets found for this window.");
    return lines.join("\n");
  }

  for (const entry of visible) {
    lines.push(formatCryptoEntry(entry));
  }

  return lines.join("\n");
}

export { pickActiveMarket };
