import { Bot, Context } from "grammy";
import { MenuFlavor } from "@grammyjs/menu";
import { limit } from "@grammyjs/ratelimiter";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { env } from "./env.js";
import { handleEventPagination } from "./handlers/event-pagination.js";
import { handlePolymarketLink } from "./handlers/polymarket-link.js";
import { buildTopHoldersKeyboard, handleTopHolders } from "./handlers/top-holders.js";

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

async function replyWelcome(ctx: BotContext) {
  const welcome = [
    "👋 Welcome to <b>Polymarket Scanner Bot by Struct</b>!",
    "",
    "👀 Send a Polymarket event or market URL to view odds and outcomes.",
    "",
    "🔎 Send a trader profile URL or wallet address to view their positions and P&L.",
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
  const isSlug = payload.startsWith("m_") && payload.length > 2;

  if (!isConditionId && !isSlug) {
    await replyWelcome(ctx);
    return;
  }

  const chatId = ctx.chat.id;
  const { fetchMarketBySlug, fetchMarketByConditionId } = await import(
    "./handlers/polymarket-link.fetch.js"
  );
  const { formatMarket } = await import("./format.js");
  await ctx.api.deleteMessage(chatId, ctx.message!.message_id).catch(() => {});

  const market = isConditionId
    ? await fetchMarketByConditionId(`0x${payload}`)
    : await fetchMarketBySlug(payload.slice(2));

  if (!market) {
    await ctx.api.sendMessage(chatId, "❌ Market not found.", { parse_mode: "HTML" });
    return;
  }
  const caption = formatMarket(market);
  const marketSlug = market.market_slug ?? market.slug;
  const keyboard = marketSlug ? buildTopHoldersKeyboard(marketSlug) : undefined;
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
  if (data?.startsWith("ep:")) return handleEventPagination(ctx);
  if (data?.startsWith("th:")) return handleTopHolders(ctx);
  if (data === "close") {
    await ctx.deleteMessage();
    await ctx.answerCallbackQuery();
  }
});
bot.on("message:text", handlePolymarketLink);
