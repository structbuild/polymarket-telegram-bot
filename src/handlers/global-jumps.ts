import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import { replyParams } from "../bot.js";
import {
  formatGlobalPriceJumps,
  type GlobalPriceJump,
} from "../format/global-jumps.js";
import { struct } from "../struct.js";
import { editPolymarketReply } from "./polymarket-refresh.js";
import { replyPolymarketFetchError } from "./polymarket-link.errors.js";

export const GLOBAL_JUMPS_PAGE_SIZE = 7;
const SCAN_MARKET_COUNT = 20;
const FETCH_CONCURRENCY = 5;
const CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_CACHE_SIZE = 200;

type CachedGlobalJumps = {
  jumps: GlobalPriceJump[];
  expiresAt: number;
};

const globalJumpsCache = new Map<number, CachedGlobalJumps>();
let nextCacheId = 1;

function pruneCache(): void {
  const now = Date.now();
  for (const [id, entry] of globalJumpsCache) {
    if (now > entry.expiresAt) globalJumpsCache.delete(id);
  }
  if (globalJumpsCache.size >= MAX_CACHE_SIZE) {
    const first = globalJumpsCache.keys().next().value!;
    globalJumpsCache.delete(first);
  }
}

function cacheGlobalJumps(jumps: GlobalPriceJump[]): number {
  pruneCache();
  const id = nextCacheId++;
  globalJumpsCache.set(id, {
    jumps,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return id;
}

function getCachedGlobalJumps(id: number): CachedGlobalJumps | undefined {
  const entry = globalJumpsCache.get(id);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    globalJumpsCache.delete(id);
    return undefined;
  }
  entry.expiresAt = Date.now() + CACHE_TTL_MS;
  return entry;
}

async function fetchJumpsForMarket(market: {
  market_slug?: string | null;
  event_slug?: string | null;
  question?: string | null;
  title?: string | null;
}): Promise<GlobalPriceJump[]> {
  const slug = market.market_slug;
  if (!slug) return [];

  const response = await struct.markets.getPriceJumps({
    market_slug: slug,
    resolution: "30",
    lookback: 48,
  });

  const question = market.question ?? market.title ?? slug;
  return (response.data ?? []).map((jump) => ({
    ...jump,
    marketSlug: slug,
    eventSlug: market.event_slug ?? undefined,
    question,
  }));
}

export async function fetchGlobalPriceJumps(): Promise<GlobalPriceJump[]> {
  const marketsRes = await struct.markets.getMarkets({
    status: "open",
    sort_by: "volume",
    sort_dir: "desc",
    limit: SCAN_MARKET_COUNT,
    include_tags: false,
    include_event: false,
    include_metrics: false,
  });

  const markets = marketsRes.data ?? [];
  const jumps: GlobalPriceJump[] = [];

  for (let i = 0; i < markets.length; i += FETCH_CONCURRENCY) {
    const batch = markets.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((market) => fetchJumpsForMarket(market)));
    for (const result of results) {
      if (result.status === "fulfilled") jumps.push(...result.value);
    }
  }

  return jumps.sort((a, b) => b.change_pct - a.change_pct);
}

export function buildGlobalJumpsKeyboard(
  cacheId: number,
  page: number,
  total: number,
): InlineKeyboard {
  const totalPages = Math.ceil(total / GLOBAL_JUMPS_PAGE_SIZE);
  const kb = new InlineKeyboard();

  if (totalPages > 1) {
    if (page > 0) kb.text("◀️", `gj:${cacheId}:${page - 1}`);
    kb.text(`${page + 1}/${totalPages}`, `gj:${cacheId}:noop`);
    if (page < totalPages - 1) kb.text("▶️", `gj:${cacheId}:${page + 1}`);
    kb.row();
  }

  kb.text("🔄 Refresh", `gj:${cacheId}:refresh`).row();
  return kb.text("✕ Close", "close").danger();
}

async function replyWithGlobalJumps(ctx: BotContext, page = 0) {
  const params = replyParams(ctx);
  const loading = await ctx.reply("⚡ Scanning top markets for price jumps…", params);

  try {
    const jumps = await fetchGlobalPriceJumps();
    const cacheId = cacheGlobalJumps(jumps);
    const text = formatGlobalPriceJumps(
      jumps,
      page,
      GLOBAL_JUMPS_PAGE_SIZE,
      ctx.me?.username,
    );
    const keyboard = buildGlobalJumpsKeyboard(cacheId, page, jumps.length);

    await ctx.api.editMessageText(loading.chat.id, loading.message_id, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
    });
  } catch (error) {
    await ctx.api.deleteMessage(loading.chat.id, loading.message_id).catch(() => {});
    await replyPolymarketFetchError(ctx, error);
  }
}

export async function handleGlobalJumpsCommand(ctx: BotContext) {
  await replyWithGlobalJumps(ctx, 0);
}

export async function handleGlobalJumpsPagination(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("gj:")) return;

  const parts = data.split(":");
  const cacheId = Number.parseInt(parts[1], 10);
  const action = parts[2];

  if (action === "noop") {
    await ctx.answerCallbackQuery();
    return;
  }

  if (action === "refresh") {
    await ctx.answerCallbackQuery({ text: "Refreshing…" });
    try {
      const jumps = await fetchGlobalPriceJumps();
      const cached = getCachedGlobalJumps(cacheId);
      if (cached) {
        cached.jumps = jumps;
        cached.expiresAt = Date.now() + CACHE_TTL_MS;
      }
      const text = formatGlobalPriceJumps(
        jumps,
        0,
        GLOBAL_JUMPS_PAGE_SIZE,
        ctx.me?.username,
      );
      const keyboard = buildGlobalJumpsKeyboard(cacheId, 0, jumps.length);
      await editPolymarketReply(ctx, text, keyboard);
    } catch {
      await ctx.answerCallbackQuery({ text: "Could not refresh price jumps." });
    }
    return;
  }

  const cached = getCachedGlobalJumps(cacheId);
  if (!cached) {
    await ctx.answerCallbackQuery({ text: "Session expired — run /jumps again." });
    return;
  }

  const page = Number.parseInt(action ?? "0", 10) || 0;
  const text = formatGlobalPriceJumps(
    cached.jumps,
    page,
    GLOBAL_JUMPS_PAGE_SIZE,
    ctx.me?.username,
  );
  const keyboard = buildGlobalJumpsKeyboard(cacheId, page, cached.jumps.length);
  await editPolymarketReply(ctx, text, keyboard);
  await ctx.answerCallbackQuery();
}
