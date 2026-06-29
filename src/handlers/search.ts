import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import { replyParams } from "../bot.js";
import { formatCombinedSearchResults, type SearchEvent, type SearchMarket } from "../format/search.js";
import { escapeHtml } from "../format/shared.js";
import { struct } from "../struct.js";
import { editPolymarketReply } from "./polymarket-refresh.js";
import { replyPolymarketFetchError } from "./polymarket-link.errors.js";
import { replyWithEvent } from "./polymarket-link.service.js";
import { replyWithMarket } from "./polymarket-link.service.js";

export const SEARCH_LIMIT = 6;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

type CachedSearch = {
  query: string;
  botUsername?: string;
  page: number;
  cursors: (string | null)[];
  expiresAt: number;
};

const searchCache = new Map<number, CachedSearch>();
let nextSearchId = 1;

function pruneSearchCache(): void {
  const now = Date.now();
  for (const [id, entry] of searchCache) {
    if (now > entry.expiresAt) searchCache.delete(id);
  }
  if (searchCache.size >= MAX_CACHE_SIZE) {
    const first = searchCache.keys().next().value!;
    searchCache.delete(first);
  }
}

function cacheSearch(query: string, botUsername?: string): number {
  if (searchCache.size >= MAX_CACHE_SIZE) {
    pruneSearchCache();
  }
  const id = nextSearchId++;
  searchCache.set(id, {
    query,
    botUsername,
    page: 0,
    cursors: [null],
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return id;
}

function getCachedSearch(id: number): CachedSearch | undefined {
  const entry = searchCache.get(id);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    searchCache.delete(id);
    return undefined;
  }
  entry.expiresAt = Date.now() + CACHE_TTL_MS;
  return entry;
}

function normalizeSearchValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findExactEventMatch(query: string, events: SearchEvent[]): SearchEvent | null {
  const normalizedQuery = normalizeSearchValue(query);

  for (const event of events) {
    if (normalizeSearchValue(event.title) === normalizedQuery) {
      return event;
    }

    const slugMatch = normalizeSearchValue(event.event_slug?.replace(/-/g, " "));
    if (slugMatch === normalizedQuery) {
      return event;
    }
  }

  return null;
}

function getSearchQuery(ctx: BotContext): string {
  return ctx.match?.toString().trim() ?? "";
}

function findExactMarketMatch(query: string, markets: SearchMarket[]): SearchMarket | null {
  const normalizedQuery = normalizeSearchValue(query);
  for (const market of markets) {
    const title = normalizeSearchValue(market.question ?? market.title);
    if (title === normalizedQuery) return market;
    const slugMatch = normalizeSearchValue(market.market_slug?.replace(/-/g, " "));
    if (slugMatch === normalizedQuery) return market;
  }
  return null;
}

async function fetchSearchPage(query: string, eventsPaginationKey?: string | null) {
  const response = await struct.search.search({
    q: query,
    limit: SEARCH_LIMIT,
    sort_by: "volume",
    type: "events,markets",
    ...(eventsPaginationKey ? { events_pagination_key: eventsPaginationKey } : {}),
  });

  return {
    events: response.data.events ?? [],
    markets: response.data.markets ?? [],
    hasMore: response.data.events_pagination?.has_more ?? false,
    nextKey: response.data.events_pagination?.pagination_key ?? null,
  };
}

export function buildSearchKeyboard(
  cacheId: number,
  page: number,
  hasMore: boolean,
): InlineKeyboard | undefined {
  if (page === 0 && !hasMore) return undefined;

  const kb = new InlineKeyboard();
  if (page > 0) kb.text("◀️", `sr:${cacheId}:${page - 1}`);
  kb.text(`Page ${page + 1}`, `sr:${cacheId}:noop`);
  if (hasMore) kb.text("▶️", `sr:${cacheId}:${page + 1}`);
  return kb;
}

async function replyWithSearchResults(
  ctx: BotContext,
  query: string,
  events: SearchEvent[],
  markets: SearchMarket[],
  page: number,
  hasMore: boolean,
  cacheId: number,
) {
  const params = replyParams(ctx);
  const text = formatCombinedSearchResults(
    query,
    events,
    markets,
    ctx.me?.username,
    page,
    hasMore,
  );
  const keyboard = buildSearchKeyboard(cacheId, page, hasMore);

  await ctx.reply(text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
    ...params,
  });
}

export async function handleSearchPagination(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("sr:")) return;

  const parts = data.split(":");
  const cacheId = Number.parseInt(parts[1], 10);
  const action = parts[2];

  if (action === "noop") {
    await ctx.answerCallbackQuery();
    return;
  }

  const cached = getCachedSearch(cacheId);
  if (!cached) {
    await ctx.answerCallbackQuery({ text: "Session expired — run /search again." });
    return;
  }

  const page = Number.parseInt(action ?? "0", 10) || 0;
  if (page < 0 || page >= cached.cursors.length) {
    await ctx.answerCallbackQuery({ text: "Page unavailable — run /search again." });
    return;
  }

  try {
    const { events, markets, hasMore, nextKey } = await fetchSearchPage(
      cached.query,
      cached.cursors[page],
    );

    cached.page = page;
    if (hasMore && nextKey) {
      cached.cursors[page + 1] = nextKey;
    } else {
      cached.cursors.length = page + 1;
    }

    const text = formatCombinedSearchResults(
      cached.query,
      events,
      markets,
      cached.botUsername ?? ctx.me?.username,
      page,
      hasMore,
    );
    const keyboard = buildSearchKeyboard(cacheId, page, hasMore);
    const ok = await editPolymarketReply(ctx, text, keyboard);
    await ctx.answerCallbackQuery(
      ok ? undefined : { text: "Could not update message. Run /search again." },
    );
  } catch {
    await ctx.answerCallbackQuery({ text: "Could not load search results." });
  }
}

export async function handleSearch(ctx: BotContext) {
  const query = getSearchQuery(ctx);
  const params = replyParams(ctx);

  if (query.length < 2) {
    await ctx.reply(
      "Usage: <code>/search &lt;query&gt;</code>\nAlias: <code>/s &lt;query&gt;</code>\nSearches events and markets.",
      {
        parse_mode: "HTML",
        ...params,
      },
    );
    return;
  }

  try {
    const { events, markets, hasMore, nextKey } = await fetchSearchPage(query);
    const exactEvent = findExactEventMatch(query, events);
    const exactMarket = findExactMarketMatch(query, markets);
    const selectedEvent = exactEvent ?? (events.length === 1 && markets.length === 0 ? events[0] : null);
    const selectedMarket =
      exactMarket ?? (markets.length === 1 && events.length === 0 ? markets[0] : null);

    if (selectedEvent?.event_slug) {
      await replyWithEvent(ctx, selectedEvent.event_slug);
      return;
    }

    if (selectedMarket?.market_slug) {
      await replyWithMarket(ctx, selectedMarket.market_slug);
      return;
    }

    if (events.length === 0 && markets.length === 0) {
      await ctx.reply(`❌ No results for <code>${escapeHtml(query)}</code>.`, {
        parse_mode: "HTML",
        ...params,
      });
      return;
    }

    const cacheId = cacheSearch(query, ctx.me?.username);
    const cached = getCachedSearch(cacheId);
    if (cached && hasMore && nextKey) {
      cached.cursors[1] = nextKey;
    }

    await replyWithSearchResults(ctx, query, events, markets, 0, hasMore, cacheId);
  } catch (error) {
    await replyPolymarketFetchError(ctx, error);
  }
}
