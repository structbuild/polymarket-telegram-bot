import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import type { MarketTimeframe } from "../format.js";
import { MARKET_TIMEFRAMES } from "../format.js";
import type { MarketRecord, MetricsWindow } from "../format/types.js";
import { formatTopHolders } from "../format/holders.js";
import { struct } from "../struct.js";

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
    .text("👥 Top Holders", `th:${cacheId}`)
    .text("⚡ Price Jumps", `pj:${cacheId}`)
    .row()
    .text("✕ Close", "close");
}

export async function handleTopHolders(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("th:")) return;

  const cacheId = parseInt(data.split(":")[1], 10);
  const cached = marketCache.get(cacheId);

  if (!cached) {
    await ctx.answerCallbackQuery({
      text: "Session expired. Send the link again.",
    });
    return;
  }

  try {
    const response = await struct.holders.getMarketHolders({
      market_slug: cached.slug,
      limit: 5,
    });

    if (!response.data) {
      await ctx.reply("❌ Could not fetch holders for this market.");
      return;
    }

    const text = formatTopHolders(response.data);
    const keyboard = new InlineKeyboard().text("✕ Close", "close");
    await ctx.reply(text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
    });
  } catch {
    await ctx.reply("❌ Could not fetch holders for this market.");
  }
}
