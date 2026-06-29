import { InlineKeyboard } from "grammy";
import { type BotContext, replyParams } from "../bot.js";
import {
  formatEvent,
  formatMarket,
  formatTrader,
  withLastUpdatedFooter,
} from "../format.js";
import type { PolymarketUrl } from "../polymarket-url.js";
import {
  EVENT_PAGE_SIZE,
  buildPaginationKeyboard,
  cacheEvent,
} from "./event-pagination.js";
import { replyPolymarketFetchError } from "./polymarket-link.errors.js";
import {
  fetchEventBySlug,
  fetchMarketBySlug,
} from "./polymarket-link.fetch.js";
import {
  replyMissingEvent,
  replyMissingMarket,
  replyWithOptionalPhoto,
} from "./polymarket-link.reply.js";
import {
  allocMarketRefreshPayload,
  allocRefreshPayload,
  buildRefreshOnlyKeyboard,
  getEventSlugFromRecord,
} from "./polymarket-refresh.js";
import { getPreferredMarketTimeframe } from "./market-timeframe-prefs.js";
import { buildMarketDetailKeyboard } from "./top-holders.js";
import { appendEventInsightButtons } from "./event-insights.js";
import { fetchCryptoContextLine } from "./crypto-context.js";
import { fetchTraderProfile, fetchTraderPnl } from "./trader.fetch.js";
import { buildTraderMenuKeyboard, cacheTrader } from "./trader-views.js";

export async function replyWithEvent(ctx: BotContext, slug: string) {
  const event = await fetchEventBySlug(slug);
  if (!event) {
    await replyMissingEvent(ctx);
    return;
  }

  const markets = event.markets ?? [];

  if (markets.length === 1) {
    const market = markets[0];
    const imageUrl = market.image_url ?? event.image_url;
    const marketSlug = market.market_slug ?? market.slug;
    const slugForRefresh = getEventSlugFromRecord(event) ?? slug;
    const tf = getPreferredMarketTimeframe(ctx.from?.id);
    const refreshData = allocRefreshPayload({
      kind: "event",
      slug: slugForRefresh,
      page: 0,
      timeframe: tf,
    });
    const keyboard = marketSlug
      ? buildMarketDetailKeyboard(
          marketSlug,
          market.event_slug,
          market.question ?? market.title,
          refreshData,
          tf,
          market,
          event.metrics,
        )
      : buildRefreshOnlyKeyboard(refreshData);
    await replyWithOptionalPhoto(
      ctx,
      withLastUpdatedFooter(formatMarket(market, event.metrics, tf)),
      imageUrl,
      keyboard,
    );
    return;
  }

  const botUsername = ctx.me?.username;
  const text = withLastUpdatedFooter(formatEvent(event, botUsername, 0, EVENT_PAGE_SIZE));
  const listRefreshData = allocRefreshPayload({
    kind: "event",
    slug: getEventSlugFromRecord(event) ?? slug,
    page: 0,
  });

  if (markets.length > EVENT_PAGE_SIZE) {
    const cacheId = cacheEvent(event, botUsername);
    const keyboard = buildPaginationKeyboard(cacheId, 0, markets.length);
    await ctx.reply(text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
      ...replyParams(ctx),
    });
    return;
  }

  await replyWithOptionalPhoto(
    ctx,
    text,
    event.image_url,
    buildEventListKeyboard(event, botUsername, listRefreshData),
  );
}

function buildEventListKeyboard(
  event: Parameters<typeof cacheEvent>[0],
  botUsername: string | undefined,
  refreshData: string,
): InlineKeyboard {
  const cacheId = cacheEvent(event, botUsername);
  const kb = buildRefreshOnlyKeyboard(refreshData);
  appendEventInsightButtons(kb, cacheId);
  return kb;
}

export async function replyWithMarket(ctx: BotContext, slug: string) {
  const market = await fetchMarketBySlug(slug);
  if (!market) {
    await replyMissingMarket(ctx);
    return;
  }

  const marketSlug = market.market_slug ?? market.slug ?? slug;
  const tf = getPreferredMarketTimeframe(ctx.from?.id);
  const refreshData = allocMarketRefreshPayload(market, tf);
  const keyboard = buildMarketDetailKeyboard(
    marketSlug,
    market.event_slug,
    market.question ?? market.title,
    refreshData,
    tf,
    market,
  );
  const cryptoLine = await fetchCryptoContextLine(market);
  const body =
    formatMarket(market, undefined, tf) + (cryptoLine ? `\n\n${cryptoLine}` : "");
  await replyWithOptionalPhoto(
    ctx,
    withLastUpdatedFooter(body),
    market.image_url,
    keyboard,
  );
}

export async function replyWithTrader(
  ctx: BotContext,
  address: string,
  options: { replyToMessage?: boolean } = {},
) {
  const [profile, pnl] = await Promise.all([
    fetchTraderProfile(address),
    fetchTraderPnl(address),
  ]);

  if (!profile && !pnl) {
    await ctx.reply("❌ Trader not found on Polymarket.", { parse_mode: "HTML" });
    return;
  }

  const cacheId = cacheTrader(address, profile, pnl);
  await ctx.reply(formatTrader(address, profile, pnl), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: buildTraderMenuKeyboard(cacheId),
    ...(options.replyToMessage === false ? {} : replyParams(ctx)),
  });
}

export async function handleParsedPolymarketLink(
  ctx: BotContext,
  parsed: PolymarketUrl,
) {
  try {
    if (parsed.type === "event") {
      await replyWithEvent(ctx, parsed.slug);
      return;
    }

    if (parsed.type === "trader") {
      await replyWithTrader(ctx, parsed.address);
      return;
    }

    await replyWithMarket(ctx, parsed.slug);
  } catch (error) {
    await replyPolymarketFetchError(ctx, error);
  }
}
