import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import { formatEvent, withLastUpdatedFooter } from "../format.js";
import { appendEventInsightButtons } from "./event-insights.js";
import type { EventRecord } from "../format/types.js";

export const EVENT_PAGE_SIZE = 12;
const MAX_CACHE_SIZE = 500;

type CachedEvent = {
  event: EventRecord;
  botUsername?: string;
};

const eventCache = new Map<number, CachedEvent>();
let nextId = 1;

export function cacheEvent(event: EventRecord, botUsername?: string): number {
  if (eventCache.size >= MAX_CACHE_SIZE) {
    const firstKey = eventCache.keys().next().value!;
    eventCache.delete(firstKey);
  }
  const id = nextId++;
  eventCache.set(id, { event, botUsername });
  return id;
}

export function getCachedEventById(
  id: number,
): { event: EventRecord; botUsername?: string } | undefined {
  return eventCache.get(id);
}

export function updateCachedEvent(
  cacheId: number,
  event: EventRecord,
  botUsername?: string,
): boolean {
  const existing = eventCache.get(cacheId);
  if (!existing) return false;
  eventCache.set(cacheId, {
    event,
    botUsername: botUsername ?? existing.botUsername,
  });
  return true;
}

export function buildPaginationKeyboard(
  cacheId: number,
  page: number,
  totalMarkets: number,
): InlineKeyboard | undefined {
  const totalPages = Math.ceil(totalMarkets / EVENT_PAGE_SIZE);
  if (totalPages <= 1) return undefined;
  const kb = new InlineKeyboard();
  if (page > 0) kb.text("◀️", `ep:${cacheId}:${page - 1}`);
  kb.text(`${page + 1}/${totalPages}`, `ep:${cacheId}:noop`);
  if (page < totalPages - 1) kb.text("▶️", `ep:${cacheId}:${page + 1}`);
  kb.row().text("🔄 Refresh", `rfe:${cacheId}:${page}`);
  appendEventInsightButtons(kb, cacheId);
  return kb;
}

export async function handleEventPagination(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("ep:")) return;

  const parts = data.split(":");
  const cacheId = parseInt(parts[1], 10);
  const action = parts[2];

  if (action === "noop") {
    await ctx.answerCallbackQuery();
    return;
  }

  const page = parseInt(action, 10);
  const cached = getCachedEventById(cacheId);
  if (!cached) {
    await ctx.answerCallbackQuery({ text: "Session expired. Send the link again." });
    return;
  }

  const totalMarkets = (cached.event.markets ?? []).length;
  const text = withLastUpdatedFooter(
    formatEvent(cached.event, cached.botUsername, page, EVENT_PAGE_SIZE),
  );
  const keyboard = buildPaginationKeyboard(cacheId, page, totalMarkets);

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery();
}
