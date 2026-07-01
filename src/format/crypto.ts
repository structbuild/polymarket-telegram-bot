import type { AssetPriceHistoryRow, Event, EventMarket } from "@structbuild/sdk";
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

function marketDeepLink(slug: string | null | undefined, botUsername?: string): string | null {
  if (!slug || !botUsername) return null;
  return `https://t.me/${botUsername}?start=m_${slug}`;
}

function eventDeepLink(slug: string | null | undefined, botUsername?: string): string | null {
  if (!slug || !botUsername) return null;
  return `https://t.me/${botUsername}?start=e_${encodeURIComponent(slug)}`;
}

function formatAssetPrice(price: number): string {
  if (price >= 1000) {
    return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function formatOutcome(outcome: string | null | undefined): string {
  if (outcome === "up") return "🟢 Up";
  if (outcome === "down") return "🔴 Down";
  return "⏳ Open";
}

function formatWindowRemaining(endTime: number | null | undefined): string | null {
  if (endTime == null) return null;
  const remaining = endTime - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return "window ended";
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m left`;
  }
  if (minutes > 0) return `${minutes}m ${seconds}s left`;
  return `${seconds}s left`;
}

function pickActiveMarket(event: Event | null): EventMarket | null {
  const markets = event?.markets ?? [];
  if (markets.length === 0) return null;
  const open = markets.find((m) => m.status?.toLowerCase() === "open");
  return open ?? markets[0] ?? null;
}

function formatMarketOdds(market: EventMarket | null): string | null {
  if (!market?.outcomes?.length) return null;
  const parts = market.outcomes
    .filter((o) => o.price != null)
    .slice(0, 2)
    .map((o) => `${o.name} ${formatCents(o.price)}`);
  return parts.length ? parts.join(" · ") : null;
}

function formatCryptoEntry(
  entry: CryptoMarketEntry,
  variant: CryptoVariant,
  botUsername?: string,
): string[] {
  const emoji = ASSET_EMOJI[entry.asset];
  const eventSlug = entry.event?.event_slug;
  const marketSlug = entry.market?.market_slug;
  const eventUrl = eventDeepLink(eventSlug, botUsername);
  const marketUrl = marketDeepLink(marketSlug, botUsername);
  const headingUrl = marketUrl ?? eventUrl;
  const label = `${emoji} ${entry.asset}`;
  const heading = headingUrl
    ? `<a href="${headingUrl}"><b>${escapeHtml(label)}</b></a>`
    : `<b>${escapeHtml(label)}</b>`;

  const lines = [heading];

  const row = entry.priceRow;
  if (row) {
    const { current, open, pct, outcome, isClosed } = resolveWindowPrice(row, entry.spotPrice);
    const direction = formatOutcome(outcome);
    const window = formatWindowRemaining(row.end_time);

    if (current != null) {
      lines.push(`   💵 <code>${formatAssetPrice(current)}</code>${escapeHtml(formatPctSuffix(pct))} · ${direction}`);
    } else if (open != null) {
      lines.push(`   💵 <code>${formatAssetPrice(open)}</code> · ${direction}`);
    } else {
      lines.push("   <i>No price data</i>");
    }

    if (window) {
      const strike =
        !isClosed && open != null && current != null && open !== current
          ? `Strike ${formatAssetPrice(open)} · `
          : open != null && current == null
            ? `Strike ${formatAssetPrice(open)} · `
            : "";
      lines.push(`   ⏱ ${escapeHtml(`${strike}${window}`)}`);
    }
  } else {
    lines.push("   <i>No price data</i>");
  }

  const odds = formatMarketOdds(entry.market);
  if (odds) lines.push(`   📊 ${escapeHtml(odds)}`);

  if (eventUrl && marketUrl && eventUrl !== marketUrl) {
    lines.push(`   🔗 <a href="${eventUrl}">Event</a>`);
  } else if (!headingUrl && row?.start_time) {
    lines.push(`   <i>Event: ${escapeHtml(cryptoEventSlug(entry.asset, variant, row.start_time))}</i>`);
  }

  return lines;
}

export function formatCryptoMarkets(
  entries: CryptoMarketEntry[],
  variant: CryptoVariant,
  botUsername?: string,
): string {
  const label = CRYPTO_VARIANT_LABELS[variant];
  const lines = [
    `🪙 <b>Crypto Up/Down</b> · ${label}`,
    "<i>Spot window vs active Polymarket markets</i>",
    "",
  ];

  const visible = entries.filter((entry) => entry.priceRow || entry.event);
  if (visible.length === 0) {
    lines.push("No active crypto up/down markets found for this window.");
    return lines.join("\n");
  }

  visible.forEach((entry, i) => {
    lines.push(...formatCryptoEntry(entry, variant, botUsername));
    if (i < visible.length - 1) lines.push("");
  });

  return lines.join("\n");
}

export { pickActiveMarket };
