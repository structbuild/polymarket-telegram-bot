import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import { replyParams } from "../bot.js";
import { formatEventSearchResults, type SearchEvent } from "../format/search.js";
import { escapeHtml } from "../format/shared.js";
import { struct } from "../struct.js";
import { editPolymarketReply } from "./polymarket-refresh.js";
import { replyPolymarketFetchError } from "./polymarket-link.errors.js";
import { replyWithEvent } from "./polymarket-link.service.js";

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

async function fetchSearchPage(query: string, eventsPaginationKey?: string | null) {
  const response = await struct.search.search({
    q: query,
    limit: SEARCH_LIMIT,
    sort_by: "volume",
    type: "events",
    ...(eventsPaginationKey ? { events_pagination_key: eventsPaginationKey } : {}),
  });

  return {
    events: response.data.events ?? [],
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
  page: number,
  hasMore: boolean,
  cacheId: number,
) {
  const params = replyParams(ctx);
  const text = formatEventSearchResults(
    query,
    events,
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
    const { events, hasMore, nextKey } = await fetchSearchPage(
      cached.query,
      cached.cursors[page],
    );

    cached.page = page;
    if (hasMore && nextKey) {
      cached.cursors[page + 1] = nextKey;
    } else {
      cached.cursors.length = page + 1;
    }

    const text = formatEventSearchResults(
      cached.query,
      events,
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
      "Usage: <code>/search &lt;event name&gt;</code>\nAlias: <code>/s &lt;event name&gt;</code>",
      {
        parse_mode: "HTML",
        ...params,
      },
    );
    return;
  }

  try {
    const { events, hasMore, nextKey } = await fetchSearchPage(query);
    const exactMatch = findExactEventMatch(query, events);
    const selectedEvent = exactMatch ?? (events.length === 1 ? events[0] : null);
    const selectedSlug = selectedEvent?.event_slug ?? null;

    if (selectedSlug) {
      await replyWithEvent(ctx, selectedSlug);
      return;
    }

    if (events.length === 0) {
      await ctx.reply(`❌ No events found for <code>${escapeHtml(query)}</code>.`, {
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

    await replyWithSearchResults(ctx, query, events, 0, hasMore, cacheId);
  } catch (error) {
    await replyPolymarketFetchError(ctx, error);
  }
}
