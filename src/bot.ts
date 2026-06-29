import { Bot, Context } from "grammy";
import { MenuFlavor } from "@grammyjs/menu";
import { limit } from "@grammyjs/ratelimiter";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { env } from "./env.js";
import { formatEvent, formatMarket, withLastUpdatedFooter } from "./format.js";
import { handleEventPagination } from "./handlers/event-pagination.js";
import {
  EVENT_PAGE_SIZE,
  buildPaginationKeyboard,
  cacheEvent,
} from "./handlers/event-pagination.js";
import {
  fetchEventBySlug,
  fetchMarketByConditionId,
  fetchMarketBySlug,
} from "./handlers/polymarket-link.fetch.js";
import { handlePolymarketLink } from "./handlers/polymarket-link.js";
import { replyWithTrader } from "./handlers/polymarket-link.service.js";
import { getPreferredMarketTimeframe } from "./handlers/market-timeframe-prefs.js";
import { handleMarketTimeframe } from "./handlers/market-timeframe.js";
import { handleSearch, handleSearchPagination } from "./handlers/search.js";
import {
  handleGlobalJumpsCommand,
  handleGlobalJumpsPagination,
} from "./handlers/global-jumps.js";
import {
  handleLeaderboardCommand,
  handleLeaderboardPagination,
  handleLeaderboardTimeframe,
} from "./handlers/leaderboard.js";
import { handleInlineSearch } from "./handlers/inline-search.js";
import {
  allocMarketRefreshPayload,
  allocRefreshPayload,
  buildRefreshOnlyKeyboard,
  getEventSlugFromRecord,
  handleEventCacheRefresh,
  handlePayloadRefresh,
} from "./handlers/polymarket-refresh.js";
import { buildMarketDetailKeyboard } from "./handlers/top-holders.js";
import { handlePriceJumps, handlePriceJumpsPagination } from "./handlers/price-jumps.js";
import { handleTraderView } from "./handlers/trader-views.js";
import {
  handleBackToMarket,
  handleMarketAnalytics,
  handleMarketAnalyticsNav,
} from "./handlers/market-analytics.js";

export type BotContext = Context & MenuFlavor;

export function replyParams(ctx: BotContext) {
  const msgId = ctx.message?.message_id;
  if (!msgId) return {};
  return { reply_parameters: { message_id: msgId } };
}

export const bot = new Bot<BotContext>(env.BOT_TOKEN);

bot.use(limit());
bot.api.config.use(apiThrottler());

const CONDITION_ID_RE = /^[0-9a-f]{64}$/;
const ADDRESS_RE = /^[0-9a-f]{40}$/;

async function replyWelcome(ctx: BotContext) {
  const welcome = [
    "👋 Welcome to <b>Polymarket Scanner Bot by Struct</b>!",
    "",
    "👀 Send a Polymarket event or market URL to view odds and outcomes.",
    "",
    "🔍 Use <code>/search &lt;query&gt;</code> or type <code>@"
      + (ctx.me?.username ?? "bot")
      + " query</code> in any chat for inline search.",
    "",
    "⚡ <code>/jumps</code> — recent price jumps across top markets.",
    "",
    "🏆 <code>/leaderboard</code> — top traders by P&amp;L.",
    "",
    "🔎 Send a trader profile URL or wallet address to view their positions and P&amp;L.",
    "",
    "Paste a link to get started.",
  ].join("\n");

  await ctx.reply(welcome, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

bot.command("start", async (ctx) => {
  const payload = ctx.match?.toString().trim();
  if (!payload) {
    await replyWelcome(ctx);
    return;
  }

  const isConditionId = CONDITION_ID_RE.test(payload);
  const isAddress = ADDRESS_RE.test(payload);
  const isMarketSlug = payload.startsWith("m_") && payload.length > 2;
  const isEventSlug = payload.startsWith("e_") && payload.length > 2;

  if (!isConditionId && !isAddress && !isMarketSlug && !isEventSlug) {
    await replyWelcome(ctx);
    return;
  }

  const chatId = ctx.chat.id;
  await ctx.api.deleteMessage(chatId, ctx.message!.message_id).catch(() => {});

  if (isAddress) {
    await replyWithTrader(ctx, `0x${payload}`, { replyToMessage: false });
    return;
  }

  if (isEventSlug) {
    const event = await fetchEventBySlug(decodeURIComponent(payload.slice(2)));
    if (!event) {
      await ctx.api.sendMessage(chatId, "❌ Event not found.", { parse_mode: "HTML" });
      return;
    }

    const markets = event.markets ?? [];
    if (markets.length === 1) {
      const market = markets[0];
      const tf = getPreferredMarketTimeframe(ctx.from?.id);
      const caption = withLastUpdatedFooter(formatMarket(market, event.metrics, tf));
      const marketSlug = market.market_slug ?? market.slug;
      const refreshData = allocRefreshPayload({
        kind: "event",
        slug: getEventSlugFromRecord(event) ?? decodeURIComponent(payload.slice(2)),
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

      if (market.image_url ?? event.image_url) {
        try {
          await ctx.api.sendPhoto(chatId, market.image_url ?? event.image_url!, {
            caption,
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
          return;
        } catch {}
      }

      await ctx.api.sendMessage(chatId, caption, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard,
      });
      return;
    }

    const botUsername = ctx.me?.username;
    const text = withLastUpdatedFooter(formatEvent(event, botUsername, 0, EVENT_PAGE_SIZE));
    const keyboard =
      markets.length > EVENT_PAGE_SIZE
        ? buildPaginationKeyboard(cacheEvent(event, botUsername), 0, markets.length)
        : buildRefreshOnlyKeyboard(
            allocRefreshPayload({
              kind: "event",
              slug: getEventSlugFromRecord(event) ?? decodeURIComponent(payload.slice(2)),
              page: 0,
            }),
          );

    if (event.image_url && markets.length <= EVENT_PAGE_SIZE) {
      try {
        await ctx.api.sendPhoto(chatId, event.image_url, {
          caption: text,
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
        return;
      } catch {}
    }

    await ctx.api.sendMessage(chatId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
    });
    return;
  }

  const market = isConditionId
    ? await fetchMarketByConditionId(`0x${payload}`)
    : await fetchMarketBySlug(payload.slice(2));

  if (!market) {
    await ctx.api.sendMessage(chatId, "❌ Market not found.", { parse_mode: "HTML" });
    return;
  }
  const tf = getPreferredMarketTimeframe(ctx.from?.id);
  const caption = withLastUpdatedFooter(formatMarket(market, undefined, tf));
  const marketSlug = market.market_slug ?? market.slug;
  const refreshData = allocMarketRefreshPayload(
    market,
    tf,
    isConditionId ? `0x${payload}` : undefined,
  );
  const keyboard = marketSlug
    ? buildMarketDetailKeyboard(
        marketSlug,
        market.event_slug,
        market.question ?? market.title,
        refreshData,
        tf,
        market,
      )
    : buildRefreshOnlyKeyboard(refreshData);
  if (market.image_url) {
    try {
      await ctx.api.sendPhoto(chatId, market.image_url, {
        caption,
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
      return;
    } catch {}
  }
  await ctx.api.sendMessage(chatId, caption, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
  });
});

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery?.data;
  if (data?.startsWith("rf:")) return handlePayloadRefresh(ctx);
  if (data?.startsWith("rfe:")) return handleEventCacheRefresh(ctx);
  if (data?.startsWith("mv:")) return handleMarketTimeframe(ctx);
  if (data?.startsWith("ep:")) return handleEventPagination(ctx);
  if (data?.startsWith("man:")) return handleMarketAnalyticsNav(ctx);
  if (data?.startsWith("mb:")) return handleBackToMarket(ctx);
  if (data?.startsWith("ma:")) return handleMarketAnalytics(ctx);
  if (data?.startsWith("pj:")) return handlePriceJumps(ctx);
  if (data?.startsWith("pp:")) return handlePriceJumpsPagination(ctx);
  if (data?.startsWith("tr:")) return handleTraderView(ctx);
  if (data?.startsWith("sr:")) return handleSearchPagination(ctx);
  if (data?.startsWith("gj:")) return handleGlobalJumpsPagination(ctx);
  if (data?.startsWith("lb:")) return handleLeaderboardPagination(ctx);
  if (data?.startsWith("lbt:")) return handleLeaderboardTimeframe(ctx);
  if (data === "close") {
    await ctx.deleteMessage();
    await ctx.answerCallbackQuery();
  }
});
bot.command(["s", "search"], handleSearch);
bot.command("jumps", handleGlobalJumpsCommand);
bot.command("leaderboard", handleLeaderboardCommand);
bot.on("inline_query", handleInlineSearch);
bot.on("message:text", handlePolymarketLink);
