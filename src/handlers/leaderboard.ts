import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import { replyParams } from "../bot.js";
import {
  LEADERBOARD_TIMEFRAMES,
  LEADERBOARD_TIMEFRAME_LABELS,
  formatLeaderboard,
  normalizeLeaderboardTimeframe,
  type LeaderboardTimeframe,
} from "../format/leaderboard.js";
import { struct } from "../struct.js";
import { editPolymarketReply } from "./polymarket-refresh.js";
import { replyPolymarketFetchError } from "./polymarket-link.errors.js";

export const LEADERBOARD_PAGE_SIZE = 8;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 200;

type CachedLeaderboard = {
  timeframe: LeaderboardTimeframe;
  botUsername?: string;
  page: number;
  cursors: (string | null)[];
  expiresAt: number;
};

const leaderboardCache = new Map<number, CachedLeaderboard>();
let nextCacheId = 1;

function pruneCache(): void {
  const now = Date.now();
  for (const [id, entry] of leaderboardCache) {
    if (now > entry.expiresAt) leaderboardCache.delete(id);
  }
  if (leaderboardCache.size >= MAX_CACHE_SIZE) {
    const first = leaderboardCache.keys().next().value!;
    leaderboardCache.delete(first);
  }
}

function cacheLeaderboard(
  timeframe: LeaderboardTimeframe,
  botUsername?: string,
): number {
  pruneCache();
  const id = nextCacheId++;
  leaderboardCache.set(id, {
    timeframe,
    botUsername,
    page: 0,
    cursors: [null],
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return id;
}

function getCachedLeaderboard(id: number): CachedLeaderboard | undefined {
  const entry = leaderboardCache.get(id);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    leaderboardCache.delete(id);
    return undefined;
  }
  entry.expiresAt = Date.now() + CACHE_TTL_MS;
  return entry;
}

function normalizePaginationKey(key: string | number | null | undefined): string | null {
  if (key == null) return null;
  return String(key);
}

async function fetchLeaderboardPage(
  timeframe: LeaderboardTimeframe,
  paginationKey?: string | null,
) {
  const response = await struct.trader.getGlobalPnl({
    timeframe,
    sort_by: "total_pnl_usd",
    sort_direction: "desc",
    limit: LEADERBOARD_PAGE_SIZE,
    ...(paginationKey ? { pagination_key: paginationKey } : {}),
  });

  return {
    entries: response.data ?? [],
    hasMore: response.pagination?.has_more ?? false,
    nextKey: normalizePaginationKey(response.pagination?.pagination_key),
  };
}

export function buildLeaderboardKeyboard(
  cacheId: number,
  timeframe: LeaderboardTimeframe,
  page: number,
  hasMore: boolean,
): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const tf of LEADERBOARD_TIMEFRAMES) {
    const label = LEADERBOARD_TIMEFRAME_LABELS[tf];
    const prefix = tf === timeframe ? "• " : "";
    kb.text(`${prefix}${label}`, `lbt:${cacheId}:${tf}`);
  }
  kb.row();

  if (page > 0 || hasMore) {
    if (page > 0) kb.text("◀️", `lb:${cacheId}:${page - 1}`);
    kb.text(`Page ${page + 1}`, `lb:${cacheId}:noop`);
    if (hasMore) kb.text("▶️", `lb:${cacheId}:${page + 1}`);
    kb.row();
  }

  kb.text("🔄 Refresh", `lb:${cacheId}:refresh`).row();
  return kb.text("✕ Close", "close").danger();
}

async function replyWithLeaderboard(
  ctx: BotContext,
  timeframe: LeaderboardTimeframe,
  page = 0,
) {
  const params = replyParams(ctx);
  const loading = await ctx.reply("🏆 Loading trader leaderboard…", params);

  try {
    const { entries, hasMore, nextKey } = await fetchLeaderboardPage(timeframe);
    const cacheId = cacheLeaderboard(timeframe, ctx.me?.username);
    const cached = getCachedLeaderboard(cacheId);
    if (cached) {
      cached.page = page;
      if (hasMore && nextKey) cached.cursors[1] = nextKey;
    }

    const text = formatLeaderboard(
      entries,
      timeframe,
      page,
      LEADERBOARD_PAGE_SIZE,
      hasMore,
      ctx.me?.username,
    );
    const keyboard = buildLeaderboardKeyboard(cacheId, timeframe, page, hasMore);

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

export async function handleLeaderboardCommand(ctx: BotContext) {
  await replyWithLeaderboard(ctx, "30d", 0);
}

export async function handleLeaderboardPagination(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("lb:")) return;

  const parts = data.split(":");
  const cacheId = Number.parseInt(parts[1], 10);
  const action = parts[2];

  if (action === "noop") {
    await ctx.answerCallbackQuery();
    return;
  }

  const cached = getCachedLeaderboard(cacheId);
  if (!cached) {
    await ctx.answerCallbackQuery({ text: "Session expired — run /leaderboard again." });
    return;
  }

  if (action === "refresh") {
    await ctx.answerCallbackQuery({ text: "Refreshing…" });
    cached.cursors = [null];
    cached.page = 0;
    try {
      const { entries, hasMore, nextKey } = await fetchLeaderboardPage(cached.timeframe);
      if (hasMore && nextKey) cached.cursors[1] = nextKey;
      const text = formatLeaderboard(
        entries,
        cached.timeframe,
        0,
        LEADERBOARD_PAGE_SIZE,
        hasMore,
        cached.botUsername ?? ctx.me?.username,
      );
      const keyboard = buildLeaderboardKeyboard(cacheId, cached.timeframe, 0, hasMore);
      await editPolymarketReply(ctx, text, keyboard);
    } catch {
      await ctx.answerCallbackQuery({ text: "Could not refresh leaderboard." });
    }
    return;
  }

  const page = Number.parseInt(action ?? "0", 10) || 0;
  if (page < 0 || page >= cached.cursors.length) {
    await ctx.answerCallbackQuery({ text: "Page unavailable." });
    return;
  }

  try {
    const { entries, hasMore, nextKey } = await fetchLeaderboardPage(
      cached.timeframe,
      cached.cursors[page],
    );

    cached.page = page;
    if (hasMore && nextKey) {
      cached.cursors[page + 1] = nextKey;
    } else {
      cached.cursors.length = page + 1;
    }

    const text = formatLeaderboard(
      entries,
      cached.timeframe,
      page,
      LEADERBOARD_PAGE_SIZE,
      hasMore,
      cached.botUsername ?? ctx.me?.username,
    );
    const keyboard = buildLeaderboardKeyboard(cacheId, cached.timeframe, page, hasMore);
    const ok = await editPolymarketReply(ctx, text, keyboard);
    await ctx.answerCallbackQuery(ok ? undefined : { text: "Could not update leaderboard." });
  } catch {
    await ctx.answerCallbackQuery({ text: "Could not load leaderboard page." });
  }
}

export async function handleLeaderboardTimeframe(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("lbt:")) return;

  const parts = data.split(":");
  const cacheId = Number.parseInt(parts[1], 10);
  const timeframe = normalizeLeaderboardTimeframe(parts[2] ?? "30d");

  const cached = getCachedLeaderboard(cacheId);
  if (!cached) {
    await ctx.answerCallbackQuery({ text: "Session expired — run /leaderboard again." });
    return;
  }

  if (cached.timeframe === timeframe) {
    await ctx.answerCallbackQuery();
    return;
  }

  cached.timeframe = timeframe;
  cached.page = 0;
  cached.cursors = [null];

  try {
    const { entries, hasMore, nextKey } = await fetchLeaderboardPage(timeframe);
    if (hasMore && nextKey) cached.cursors[1] = nextKey;

    const text = formatLeaderboard(
      entries,
      timeframe,
      0,
      LEADERBOARD_PAGE_SIZE,
      hasMore,
      cached.botUsername ?? ctx.me?.username,
    );
    const keyboard = buildLeaderboardKeyboard(cacheId, timeframe, 0, hasMore);
    const ok = await editPolymarketReply(ctx, text, keyboard);
    await ctx.answerCallbackQuery(ok ? undefined : { text: "Could not update timeframe." });
  } catch {
    await ctx.answerCallbackQuery({ text: "Could not load leaderboard." });
  }
}
