import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import { formatTopHolders } from "../format/holders.js";
import { struct } from "../struct.js";

const MAX_CACHE_SIZE = 500;
const marketCache = new Map<number, string>();
let nextId = 1;

export function cacheMarketSlug(slug: string): number {
  if (marketCache.size >= MAX_CACHE_SIZE) {
    const firstKey = marketCache.keys().next().value!;
    marketCache.delete(firstKey);
  }
  const id = nextId++;
  marketCache.set(id, slug);
  return id;
}

export function getCachedMarketSlug(id: number): string | undefined {
  return marketCache.get(id);
}

export function buildTopHoldersKeyboard(marketSlug: string): InlineKeyboard {
  const cacheId = cacheMarketSlug(marketSlug);
  return new InlineKeyboard()
    .text("👥 Top Holders", `th:${cacheId}`)
    .text("⚡ Price Jumps", `pj:${cacheId}`)
    .row()
    .text("✕ Close", "close");
}

export async function handleTopHolders(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("th:")) return;

  const cacheId = parseInt(data.split(":")[1], 10);
  const slug = marketCache.get(cacheId);

  if (!slug) {
    await ctx.answerCallbackQuery({
      text: "Session expired. Send the link again.",
    });
    return;
  }

  try {
    const response = await struct.holders.getMarketHolders({
      market_slug: slug,
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
