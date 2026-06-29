import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import { formatEvent, withLastUpdatedFooter } from "../format.js";
import { formatEventChartSummary, formatEventOutcomes } from "../format/event-insights.js";
import { struct } from "../struct.js";
import { EVENT_PAGE_SIZE, getCachedEventById } from "./event-pagination.js";
import { editPolymarketReply } from "./polymarket-refresh.js";

const OUTCOMES_PAGE_SIZE = 8;
const CHART_RESOLUTIONS = ["1D", "1W", "1M"] as const;
type ChartResolution = (typeof CHART_RESOLUTIONS)[number];

const outcomesCache = new Map<number, Record<string, string>>();

export function appendEventInsightButtons(kb: InlineKeyboard, eventCacheId: number): InlineKeyboard {
  return kb
    .text("📈 Chart", `ei:${eventCacheId}:chart:1D`)
    .text("✅ Outcomes", `ei:${eventCacheId}:outcomes:0`)
    .row();
}

export async function handleEventInsights(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("ei:")) return;

  const parts = data.split(":");
  const eventCacheId = Number.parseInt(parts[1], 10);
  const view = parts[2];
  const action = parts[3];

  const cachedEvent = getCachedEventById(eventCacheId);
  if (!cachedEvent) {
    await ctx.answerCallbackQuery({ text: "Session expired. Send the link again." });
    return;
  }

  const eventSlug =
    cachedEvent.event.event_slug ??
    (cachedEvent.event.markets?.[0] as { event_slug?: string } | undefined)?.event_slug ??
    "";
  const eventTitle = cachedEvent.event.title ?? "Event";

  if (view === "back") {
    const page = Number.parseInt(action ?? "0", 10) || 0;
    const text = withLastUpdatedFooter(
      formatEvent(cachedEvent.event, cachedEvent.botUsername, page, EVENT_PAGE_SIZE),
    );
    const kb = buildEventBackKeyboard(eventCacheId, page, cachedEvent.event.markets?.length ?? 0);
    await editPolymarketReply(ctx, text, kb);
    await ctx.answerCallbackQuery();
    return;
  }

  if (view === "chart") {
    const resolution = (CHART_RESOLUTIONS.includes(action as ChartResolution) ? action : "1D") as ChartResolution;
    await ctx.answerCallbackQuery({ text: "Loading chart…" });
    try {
      const response = await struct.events.getEventChart({ event_slug: eventSlug, resolution });
      const text = formatEventChartSummary(eventTitle, response.data ?? [], resolution);
      const kb = buildChartKeyboard(eventCacheId, 0, resolution);
      await editPolymarketReply(ctx, text, kb);
    } catch {
      await ctx.answerCallbackQuery({ text: "Could not load event chart." });
    }
    return;
  }

  if (view === "outcomes") {
    if (action === "noop") {
      await ctx.answerCallbackQuery();
      return;
    }
    const page = Number.parseInt(action ?? "0", 10) || 0;
    await ctx.answerCallbackQuery({ text: page === 0 ? "Loading outcomes…" : undefined });
    try {
      let outcomes = outcomesCache.get(eventCacheId);
      if (!outcomes) {
        const response = await struct.events.getEventOutcomes({ event_slug: eventSlug, limit: 100 });
        outcomes = response.data ?? {};
        outcomesCache.set(eventCacheId, outcomes);
      }
      const text = formatEventOutcomes(eventTitle, outcomes, page, OUTCOMES_PAGE_SIZE);
      const total = Object.keys(outcomes).length;
      const kb = buildOutcomesKeyboard(eventCacheId, page, total);
      await editPolymarketReply(ctx, text, kb);
    } catch {
      await ctx.answerCallbackQuery({ text: "Could not load outcomes." });
    }
  }
}

function buildChartKeyboard(
  eventCacheId: number,
  eventPage: number,
  selected: ChartResolution,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const res of CHART_RESOLUTIONS) {
    const prefix = res === selected ? "• " : "";
    kb.text(`${prefix}${res}`, `ei:${eventCacheId}:chart:${res}`);
  }
  kb.row().text("⬅️ Back", `ei:${eventCacheId}:back:${eventPage}`).text("✕ Close", "close").danger();
  return kb;
}

function buildOutcomesKeyboard(eventCacheId: number, page: number, total: number): InlineKeyboard {
  const totalPages = Math.ceil(total / OUTCOMES_PAGE_SIZE);
  const kb = new InlineKeyboard();
  if (totalPages > 1) {
    if (page > 0) kb.text("◀️", `ei:${eventCacheId}:outcomes:${page - 1}`);
    kb.text(`${page + 1}/${totalPages}`, `ei:${eventCacheId}:outcomes:noop`);
    if (page < totalPages - 1) kb.text("▶️", `ei:${eventCacheId}:outcomes:${page + 1}`);
    kb.row();
  }
  kb.text("⬅️ Back", `ei:${eventCacheId}:back:0`).text("✕ Close", "close").danger();
  return kb;
}

function buildEventBackKeyboard(eventCacheId: number, page: number, totalMarkets: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  const totalPages = Math.ceil(totalMarkets / EVENT_PAGE_SIZE);
  if (totalPages > 1) {
    if (page > 0) kb.text("◀️", `ep:${eventCacheId}:${page - 1}`);
    kb.text(`${page + 1}/${totalPages}`, `ep:${eventCacheId}:noop`);
    if (page < totalPages - 1) kb.text("▶️", `ep:${eventCacheId}:${page + 1}`);
    kb.row();
  }
  kb.text("🔄 Refresh", `rfe:${eventCacheId}:${page}`).row();
  appendEventInsightButtons(kb, eventCacheId);
  kb.text("✕ Close", "close").danger();
  return kb;
}
