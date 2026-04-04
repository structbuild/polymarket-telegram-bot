import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import { formatPriceJumps } from "../format/price-jumps.js";
import { struct } from "../struct.js";
import { getCachedMarketInfo } from "./top-holders.js";

export const PRICE_JUMPS_PAGE_SIZE = 7;
const MAX_CACHE_SIZE = 500;

type PriceJumpEntry = {
  from: number;
  to: number;
  price_before: number;
  price_after: number;
  change_pct: number;
  direction: string;
  volume: number;
  trades_count: number;
  condition_id: string;
};

const CACHE_TTL_MS = 3 * 60 * 1000;

type CachedJumps = { jumps: PriceJumpEntry[]; marketUrl?: string; question?: string; expiresAt: number };
const jumpsCache = new Map<number, CachedJumps>();
let nextId = 1;

function cacheJumps(jumps: PriceJumpEntry[], marketUrl?: string, question?: string): number {
  if (jumpsCache.size >= MAX_CACHE_SIZE) {
    const firstKey = jumpsCache.keys().next().value!;
    jumpsCache.delete(firstKey);
  }
  const id = nextId++;
  jumpsCache.set(id, { jumps, marketUrl, question, expiresAt: Date.now() + CACHE_TTL_MS });
  return id;
}

function getCachedJumps(id: number): CachedJumps | undefined {
  const entry = jumpsCache.get(id);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    jumpsCache.delete(id);
    return undefined;
  }
  return entry;
}

function buildMarketUrl(marketSlug: string, eventSlug?: string): string | undefined {
  if (!eventSlug) return undefined;
  return `https://polymarket.com/event/${eventSlug}/${marketSlug}`;
}

function buildPriceJumpsPaginationKeyboard(
  cacheId: number,
  page: number,
  total: number,
): InlineKeyboard {
  const totalPages = Math.ceil(total / PRICE_JUMPS_PAGE_SIZE);
  const kb = new InlineKeyboard();
  if (page > 0) kb.text("◀️", `pp:${cacheId}:${page - 1}`);
  kb.text(`${page + 1}/${totalPages}`, `pp:${cacheId}:noop`);
  if (page < totalPages - 1) kb.text("▶️", `pp:${cacheId}:${page + 1}`);
  kb.row().text("✕ Close", "close");
  return kb;
}

export async function handlePriceJumps(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("pj:")) return;

  const cacheId = parseInt(data.split(":")[1], 10);
  const marketInfo = getCachedMarketInfo(cacheId);

  if (!marketInfo) {
    await ctx.answerCallbackQuery({
      text: "Session expired. Send the link again.",
    });
    return;
  }

  await ctx.answerCallbackQuery();

  const marketUrl = buildMarketUrl(marketInfo.slug, marketInfo.eventSlug);
  const question = marketInfo.question;

  try {
    const response = await struct.markets.getPriceJumps({ market_slug: marketInfo.slug, resolution: "30" });

    if (!response.data) {
      await ctx.reply("❌ Could not fetch price jumps for this market.");
      return;
    }

    const jumps = response.data;
    const text = formatPriceJumps(jumps, 0, PRICE_JUMPS_PAGE_SIZE, marketUrl, question);

    if (jumps.length <= PRICE_JUMPS_PAGE_SIZE) {
      const keyboard = new InlineKeyboard().text("✕ Close", "close");
      await ctx.reply(text, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard,
      });
      return;
    }

    const jumpsCacheId = cacheJumps(jumps, marketUrl, question);
    const keyboard = buildPriceJumpsPaginationKeyboard(jumpsCacheId, 0, jumps.length);
    await ctx.reply(text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
    });
  } catch {
    await ctx.reply("❌ Could not fetch price jumps for this market.");
  }
}

export async function handlePriceJumpsPagination(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("pp:")) return;

  const parts = data.split(":");
  const cacheId = parseInt(parts[1], 10);
  const action = parts[2];

  if (action === "noop") {
    await ctx.answerCallbackQuery();
    return;
  }

  const page = parseInt(action, 10);
  const cached = getCachedJumps(cacheId);

  if (!cached) {
    await ctx.answerCallbackQuery({ text: "Session expired. Send the link again." });
    return;
  }

  const text = formatPriceJumps(cached.jumps, page, PRICE_JUMPS_PAGE_SIZE, cached.marketUrl, cached.question);
  const keyboard = buildPriceJumpsPaginationKeyboard(cacheId, page, cached.jumps.length);

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery();
}
