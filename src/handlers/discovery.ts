import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import { replyParams } from "../bot.js";
import {
  formatBondMarkets,
  formatSeriesList,
  formatTagMarkets,
  formatTagsList,
  formatTrendingMarkets,
} from "../format/discovery.js";
import { struct } from "../struct.js";
import { editPolymarketReply } from "./polymarket-refresh.js";
import { replyPolymarketFetchError } from "./polymarket-link.errors.js";

const PAGE_SIZE = 8;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 200;

function normalizePaginationKey(key: string | number | null | undefined): string | null {
  if (key == null) return null;
  return String(key);
}

type TrendingCache = { page: number; cursors: (string | null)[]; expiresAt: number };
type TagMarketsCache = {
  tagSlug: string;
  tagLabel: string;
  page: number;
  cursors: (string | null)[];
  expiresAt: number;
};
type BondsCache = { page: number; cursors: (string | null)[]; expiresAt: number };

const trendingCache = new Map<number, TrendingCache>();
const tagMarketsCache = new Map<number, TagMarketsCache>();
const bondsCache = new Map<number, BondsCache>();
let nextTrendingId = 1;
let nextTagMarketsId = 1;
let nextBondsId = 1;

function prune<T extends { expiresAt: number }>(map: Map<number, T>): void {
  const now = Date.now();
  for (const [id, entry] of map) {
    if (now > entry.expiresAt) map.delete(id);
  }
  if (map.size >= MAX_CACHE_SIZE) {
    map.delete(map.keys().next().value!);
  }
}

async function fetchTrendingPage(paginationKey?: string | null) {
  const response = await struct.markets.getMarkets({
    status: "open",
    sort_by: "volume",
    sort_dir: "desc",
    timeframe: "24h",
    limit: PAGE_SIZE,
    include_tags: false,
    include_event: false,
    include_metrics: true,
    ...(paginationKey ? { pagination_key: paginationKey } : {}),
  });
  return {
    markets: response.data ?? [],
    hasMore: response.pagination?.has_more ?? false,
    nextKey: normalizePaginationKey(response.pagination?.pagination_key),
  };
}

export async function handleTrendingCommand(ctx: BotContext) {
  const params = replyParams(ctx);
  const loading = await ctx.reply("🔥 Loading trending markets…", params);
  try {
    const { markets, hasMore, nextKey } = await fetchTrendingPage();
    prune(trendingCache);
    const cacheId = nextTrendingId++;
    trendingCache.set(cacheId, {
      page: 0,
      cursors: hasMore && nextKey ? [null, nextKey] : [null],
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    const text = formatTrendingMarkets(markets, 0, PAGE_SIZE, hasMore, ctx.me?.username);
    const kb = buildTrendingKeyboard(cacheId, 0, hasMore);
    await ctx.api.editMessageText(loading.chat.id, loading.message_id, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: kb,
    });
  } catch (error) {
    await ctx.api.deleteMessage(loading.chat.id, loading.message_id).catch(() => {});
    await replyPolymarketFetchError(ctx, error);
  }
}

function buildTrendingKeyboard(cacheId: number, page: number, hasMore: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (page > 0 || hasMore) {
    if (page > 0) kb.text("◀️", `trn:${cacheId}:${page - 1}`);
    kb.text(`Page ${page + 1}`, `trn:${cacheId}:noop`);
    if (hasMore) kb.text("▶️", `trn:${cacheId}:${page + 1}`);
    kb.row();
  }
  return kb.text("✕ Close", "close").danger();
}

export async function handleTrendingPagination(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("trn:")) return;
  const parts = data.split(":");
  const cacheId = Number.parseInt(parts[1], 10);
  const action = parts[2];
  if (action === "noop") {
    await ctx.answerCallbackQuery();
    return;
  }
  const cached = trendingCache.get(cacheId);
  if (!cached || Date.now() > cached.expiresAt) {
    await ctx.answerCallbackQuery({ text: "Session expired — run /trending again." });
    return;
  }
  const page = Number.parseInt(action ?? "0", 10) || 0;
  if (page < 0 || page >= cached.cursors.length) {
    await ctx.answerCallbackQuery({ text: "Page unavailable." });
    return;
  }
  try {
    const { markets, hasMore, nextKey } = await fetchTrendingPage(cached.cursors[page]);
    cached.page = page;
    if (hasMore && nextKey) cached.cursors[page + 1] = nextKey;
    else cached.cursors.length = page + 1;
    const text = formatTrendingMarkets(markets, page, PAGE_SIZE, hasMore, ctx.me?.username);
    await editPolymarketReply(ctx, text, buildTrendingKeyboard(cacheId, page, hasMore));
    await ctx.answerCallbackQuery();
  } catch {
    await ctx.answerCallbackQuery({ text: "Could not load page." });
  }
}

export async function handleTagsCommand(ctx: BotContext) {
  const params = replyParams(ctx);
  try {
    const response = await struct.tags.getTags({ limit: 20, sort: "volume", timeframe: "24h" });
    const tags = response.data ?? [];
    const text = formatTagsList(tags, ctx.me?.username);
    const kb = new InlineKeyboard();
    for (const tag of tags.slice(0, 12)) {
      const slug = tag.slug ?? tag.label;
      if (!slug) continue;
      const label = truncateTagLabel(tag.label ?? slug);
      kb.text(label, `tag:${encodeURIComponent(slug)}`).row();
    }
    kb.text("✕ Close", "close").danger();
    await ctx.reply(text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: kb,
      ...params,
    });
  } catch (error) {
    await replyPolymarketFetchError(ctx, error);
  }
}

function truncateTagLabel(label: string): string {
  return label.length > 20 ? `${label.slice(0, 19)}…` : label;
}

async function fetchTagMarkets(tagSlug: string, paginationKey?: string | null) {
  const response = await struct.markets.getMarkets({
    status: "open",
    tags: tagSlug,
    sort_by: "volume",
    sort_dir: "desc",
    limit: PAGE_SIZE,
    include_metrics: true,
    include_tags: false,
    include_event: false,
    ...(paginationKey ? { pagination_key: paginationKey } : {}),
  });
  return {
    markets: response.data ?? [],
    hasMore: response.pagination?.has_more ?? false,
    nextKey: normalizePaginationKey(response.pagination?.pagination_key),
  };
}

export async function handleTagMarkets(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("tag:")) return;

  const tagSlug = decodeURIComponent(data.slice(4));
  if (!tagSlug) {
    await ctx.answerCallbackQuery({ text: "Invalid tag." });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Loading…" });
  try {
    const { markets, hasMore, nextKey } = await fetchTagMarkets(tagSlug);
    prune(tagMarketsCache);
    const cacheId = nextTagMarketsId++;
    tagMarketsCache.set(cacheId, {
      tagSlug,
      tagLabel: tagSlug.replace(/-/g, " "),
      page: 0,
      cursors: hasMore && nextKey ? [null, nextKey] : [null],
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    const text = formatTagMarkets(tagSlug, markets, 0, PAGE_SIZE, hasMore, ctx.me?.username);
    await editPolymarketReply(ctx, text, buildTagMarketsKeyboard(cacheId, 0, hasMore));
  } catch {
    await ctx.answerCallbackQuery({ text: "Could not load tag markets." });
  }
}

function buildTagMarketsKeyboard(cacheId: number, page: number, hasMore: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (page > 0 || hasMore) {
    if (page > 0) kb.text("◀️", `tgp:${cacheId}:${page - 1}`);
    kb.text(`Page ${page + 1}`, `tgp:${cacheId}:noop`);
    if (hasMore) kb.text("▶️", `tgp:${cacheId}:${page + 1}`);
    kb.row();
  }
  return kb.text("✕ Close", "close").danger();
}

export async function handleTagMarketsPagination(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("tgp:")) return;
  const parts = data.split(":");
  const cacheId = Number.parseInt(parts[1], 10);
  const action = parts[2];
  if (action === "noop") {
    await ctx.answerCallbackQuery();
    return;
  }
  const cached = tagMarketsCache.get(cacheId);
  if (!cached || Date.now() > cached.expiresAt) {
    await ctx.answerCallbackQuery({ text: "Session expired — run /tags again." });
    return;
  }
  const page = Number.parseInt(action ?? "0", 10) || 0;
  if (page < 0 || page >= cached.cursors.length) {
    await ctx.answerCallbackQuery({ text: "Page unavailable." });
    return;
  }
  try {
    const { markets, hasMore, nextKey } = await fetchTagMarkets(cached.tagSlug, cached.cursors[page]);
    cached.page = page;
    if (hasMore && nextKey) cached.cursors[page + 1] = nextKey;
    const text = formatTagMarkets(
      cached.tagLabel,
      markets,
      page,
      PAGE_SIZE,
      hasMore,
      ctx.me?.username,
    );
    await editPolymarketReply(ctx, text, buildTagMarketsKeyboard(cacheId, page, hasMore));
    await ctx.answerCallbackQuery();
  } catch {
    await ctx.answerCallbackQuery({ text: "Could not load page." });
  }
}

export async function handleSeriesCommand(ctx: BotContext) {
  const params = replyParams(ctx);
  try {
    const response = await struct.series.getSeriesList({ limit: 15, active_only: true });
    const text = formatSeriesList(response.data ?? []);
    await ctx.reply(text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...params,
    });
  } catch (error) {
    await replyPolymarketFetchError(ctx, error);
  }
}

async function fetchBondsPage(paginationKey?: string | null) {
  const response = await struct.bonds.getBonds({
    limit: PAGE_SIZE,
    ...(paginationKey ? { pagination_key: paginationKey } : {}),
  });
  return {
    bonds: response.data ?? [],
    hasMore: response.pagination?.has_more ?? false,
    nextKey: normalizePaginationKey(response.pagination?.pagination_key),
  };
}

export async function handleBondsCommand(ctx: BotContext) {
  const params = replyParams(ctx);
  const loading = await ctx.reply("📎 Loading bond markets…", params);
  try {
    const { bonds, hasMore, nextKey } = await fetchBondsPage();
    prune(bondsCache);
    const cacheId = nextBondsId++;
    bondsCache.set(cacheId, {
      page: 0,
      cursors: hasMore && nextKey ? [null, nextKey] : [null],
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    const text = formatBondMarkets(bonds, 0, PAGE_SIZE, hasMore, ctx.me?.username);
    await ctx.api.editMessageText(loading.chat.id, loading.message_id, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: buildBondsKeyboard(cacheId, 0, hasMore),
    });
  } catch (error) {
    await ctx.api.deleteMessage(loading.chat.id, loading.message_id).catch(() => {});
    await replyPolymarketFetchError(ctx, error);
  }
}

function buildBondsKeyboard(cacheId: number, page: number, hasMore: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (page > 0 || hasMore) {
    if (page > 0) kb.text("◀️", `bon:${cacheId}:${page - 1}`);
    kb.text(`Page ${page + 1}`, `bon:${cacheId}:noop`);
    if (hasMore) kb.text("▶️", `bon:${cacheId}:${page + 1}`);
    kb.row();
  }
  return kb.text("✕ Close", "close").danger();
}

export async function handleBondsPagination(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("bon:")) return;
  const parts = data.split(":");
  const cacheId = Number.parseInt(parts[1], 10);
  const action = parts[2];
  if (action === "noop") {
    await ctx.answerCallbackQuery();
    return;
  }
  const cached = bondsCache.get(cacheId);
  if (!cached || Date.now() > cached.expiresAt) {
    await ctx.answerCallbackQuery({ text: "Session expired — run /bonds again." });
    return;
  }
  const page = Number.parseInt(action ?? "0", 10) || 0;
  if (page < 0 || page >= cached.cursors.length) {
    await ctx.answerCallbackQuery({ text: "Page unavailable." });
    return;
  }
  try {
    const { bonds, hasMore, nextKey } = await fetchBondsPage(cached.cursors[page]);
    cached.page = page;
    if (hasMore && nextKey) cached.cursors[page + 1] = nextKey;
    const text = formatBondMarkets(bonds, page, PAGE_SIZE, hasMore, ctx.me?.username);
    await editPolymarketReply(ctx, text, buildBondsKeyboard(cacheId, page, hasMore));
    await ctx.answerCallbackQuery();
  } catch {
    await ctx.answerCallbackQuery({ text: "Could not load page." });
  }
}
