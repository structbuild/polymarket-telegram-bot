import type { BotContext } from "../bot.js";
import type { MarketRecord } from "../format/types.js";
import { formatMarket, normalizeMarketTimeframe, withLastUpdatedFooter } from "../format.js";
import { setPreferredMarketTimeframe } from "./market-timeframe-prefs.js";
import { allocMarketRefreshPayload, editPolymarketReply } from "./polymarket-refresh.js";
import { fetchMarketBySlug } from "./polymarket-link.fetch.js";
import {
  buildMarketDetailKeyboard,
  getCachedMarketInfo,
  mergeCachedMarketSnapshot,
} from "./top-holders.js";

export async function handleMarketTimeframe(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("mv:")) return;

  const parts = data.split(":");
  if (parts.length !== 3 || parts[0] !== "mv") return;

  const cacheId = parseInt(parts[1], 10);
  const rawTf = parts[2];
  const tf = normalizeMarketTimeframe(rawTf);

  const cached = getCachedMarketInfo(cacheId);
  if (!cached) {
    await ctx.answerCallbackQuery({ text: "Session expired. Send the link again." });
    return;
  }

  try {
    let market: MarketRecord;
    let metricsOverride = cached.metricsOverride;
    if (cached.snapshot) {
      market = cached.snapshot;
    } else {
      const fetched = await fetchMarketBySlug(cached.slug);
      if (!fetched) {
        await ctx.answerCallbackQuery({ text: "Market not found." });
        return;
      }
      market = fetched;
      metricsOverride = undefined;
      mergeCachedMarketSnapshot(cacheId, fetched);
    }

    const marketSlug = market.market_slug ?? market.slug ?? cached.slug;
    const refreshData = allocMarketRefreshPayload(market, tf);
    const keyboard = buildMarketDetailKeyboard(
      marketSlug,
      market.event_slug,
      market.question ?? market.title,
      refreshData,
      tf,
      market,
      metricsOverride,
    );
    const ok = await editPolymarketReply(
      ctx,
      withLastUpdatedFooter(formatMarket(market, metricsOverride, tf)),
      keyboard,
    );
    if (ok && ctx.from) {
      setPreferredMarketTimeframe(ctx.from.id, tf);
    }
    await ctx.answerCallbackQuery(
      ok ? undefined : { text: "Could not update message. Send the link again." },
    );
  } catch {
    await ctx.answerCallbackQuery({ text: "Could not load market." });
  }
}
