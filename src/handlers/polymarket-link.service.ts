import { type BotContext, replyParams } from "../bot.js";
import { formatEvent, formatMarket, formatTrader } from "../format.js";
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
import { buildTopHoldersKeyboard } from "./top-holders.js";
import { fetchTraderProfile, fetchTraderPnl } from "./trader.fetch.js";

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
    const keyboard = marketSlug ? buildTopHoldersKeyboard(marketSlug, market.event_slug, market.question ?? market.title) : undefined;
    await replyWithOptionalPhoto(ctx, formatMarket(market, event.metrics), imageUrl, keyboard);
    return;
  }

  const botUsername = ctx.me?.username;
  const text = formatEvent(event, botUsername, 0, EVENT_PAGE_SIZE);

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

  await replyWithOptionalPhoto(ctx, text, event.image_url);
}

async function replyWithMarket(ctx: BotContext, slug: string) {
  const market = await fetchMarketBySlug(slug);
  if (!market) {
    await replyMissingMarket(ctx);
    return;
  }

  const marketSlug = market.market_slug ?? market.slug ?? slug;
  const keyboard = buildTopHoldersKeyboard(marketSlug, market.event_slug, market.question ?? market.title);
  await replyWithOptionalPhoto(ctx, formatMarket(market), market.image_url, keyboard);
}

async function replyWithTrader(ctx: BotContext, address: string) {
  const [profile, pnl] = await Promise.all([
    fetchTraderProfile(address),
    fetchTraderPnl(address),
  ]);

  if (!profile && !pnl) {
    await ctx.reply("❌ Trader not found on Polymarket.", { parse_mode: "HTML" });
    return;
  }

  const imageUrl = profile?.profile_image ?? pnl?.trader?.profile_image;
  await replyWithOptionalPhoto(ctx, formatTrader(address, profile, pnl), imageUrl);
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
