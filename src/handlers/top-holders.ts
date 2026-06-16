import { InlineKeyboard } from "grammy";
import type { MarketTimeframe } from "../format.js";
import { MARKET_TIMEFRAMES } from "../format.js";
import type { MarketRecord, MetricsWindow } from "../format/types.js";

const MAX_CACHE_SIZE = 500;

type CachedMarket = {
  slug: string;
  eventSlug?: string;
  question?: string;
  snapshot?: MarketRecord;
  metricsOverride?: MetricsWindow;
};
const marketCache = new Map<number, CachedMarket>();
let nextId = 1;

export function cacheMarketSlug(
  slug: string,
  eventSlug?: string,
  question?: string,
  snapshot?: MarketRecord,
  metricsOverride?: MetricsWindow,
): number {
  if (marketCache.size >= MAX_CACHE_SIZE) {
    const firstKey = marketCache.keys().next().value!;
    marketCache.delete(firstKey);
  }
  const id = nextId++;
  marketCache.set(id, { slug, eventSlug, question, snapshot, metricsOverride });
  return id;
}

export function mergeCachedMarketSnapshot(
  cacheId: number,
  snapshot: MarketRecord,
  metricsOverride?: MetricsWindow,
): void {
  const cur = marketCache.get(cacheId);
  if (!cur) return;
  marketCache.set(cacheId, { ...cur, snapshot, metricsOverride });
}

export function getCachedMarketSlug(id: number): string | undefined {
  return marketCache.get(id)?.slug;
}

export function getCachedMarketInfo(id: number): CachedMarket | undefined {
  return marketCache.get(id);
}

export function buildMarketDetailKeyboard(
  marketSlug: string,
  eventSlug: string | undefined,
  question: string | undefined,
  refreshData: string,
  selectedTf: MarketTimeframe,
  snapshot: MarketRecord,
  metricsOverride?: MetricsWindow,
): InlineKeyboard {
  const cacheId = cacheMarketSlug(
    marketSlug,
    eventSlug,
    question,
    snapshot,
    metricsOverride,
  );
  const kb = new InlineKeyboard();
  for (const tf of MARKET_TIMEFRAMES) {
    const label = tf === selectedTf ? `✅ ${tf}` : tf;
    kb.text(label, `mv:${cacheId}:${tf}`);
  }
  return kb
    .row()
    .text("🔄 Refresh", refreshData)
    .row()
    .text("👥 Top Holders", `ma:${cacheId}:holders`)
    .text("🏆 Top Traders", `ma:${cacheId}:traders`)
    .row()
    .text("🧾 Trades", `ma:${cacheId}:trades`)
    .text("⚡ Price Jumps", `pj:${cacheId}`)
    .row()
    .text("✕ Close", "close")
    .danger();
}
