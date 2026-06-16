import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import type { EventRecord } from "../format/types.js";
import {
  formatEvent,
  formatMarket,
  normalizeMarketTimeframe,
  withLastUpdatedFooter,
} from "../format.js";
import {
  EVENT_PAGE_SIZE,
  buildPaginationKeyboard,
  cacheEvent,
  getCachedEventById,
  updateCachedEvent,
} from "./event-pagination.js";
import {
  fetchEventBySlug,
  fetchMarketByConditionId,
  fetchMarketBySlug,
} from "./polymarket-link.fetch.js";
import {
  getPreferredMarketTimeframe,
  setPreferredMarketTimeframe,
} from "./market-timeframe-prefs.js";
import { buildMarketDetailKeyboard } from "./top-holders.js";
import type { MarketRecord } from "../format/types.js";

const MAX_REFRESH = 500;
type MarketRefreshPayload =
  | { kind: "market"; slug: string; timeframe: string }
  | { kind: "market"; conditionId: string; timeframe: string };

const refreshPayloads = new Map<
  number,
  | { kind: "event"; slug: string; page: number; timeframe?: string }
  | MarketRefreshPayload
>();
let nextRefreshId = 1;

export function getEventSlugFromRecord(event: EventRecord): string | undefined {
  if (typeof event.event_slug === "string" && event.event_slug.length > 0) {
    return event.event_slug;
  }
  const row = event.markets?.[0] as { event_slug?: string } | undefined;
  return row?.event_slug;
}

export function allocRefreshPayload(
  payload:
    | { kind: "event"; slug: string; page: number; timeframe?: string }
    | MarketRefreshPayload,
): string {
  if (refreshPayloads.size >= MAX_REFRESH) {
    const first = refreshPayloads.keys().next().value!;
    refreshPayloads.delete(first);
  }
  const id = nextRefreshId++;
  refreshPayloads.set(id, payload);
  return `rf:${id}`;
}

function getConditionIdFromMarket(
  market: Pick<MarketRecord, "condition_id">,
): string | undefined {
  const conditionId = market.condition_id;
  if (typeof conditionId !== "string" || conditionId.length === 0) {
    return undefined;
  }
  return conditionId.startsWith("0x") ? conditionId : `0x${conditionId}`;
}

export function allocMarketRefreshPayload(
  market: Pick<MarketRecord, "market_slug" | "slug" | "condition_id">,
  timeframe: string,
  fallbackConditionId?: string,
): string {
  const marketSlug =
    (typeof market.market_slug === "string" && market.market_slug.length > 0
      ? market.market_slug
      : undefined) ??
    (typeof market.slug === "string" && market.slug.length > 0 ? market.slug : undefined);

  if (marketSlug) {
    return allocRefreshPayload({ kind: "market", slug: marketSlug, timeframe });
  }

  const conditionId = getConditionIdFromMarket(market) ?? fallbackConditionId;
  if (!conditionId) {
    throw new Error("Market is missing both slug and condition ID.");
  }

  return allocRefreshPayload({ kind: "market", conditionId, timeframe });
}

export function buildRefreshOnlyKeyboard(refreshData: string): InlineKeyboard {
  return new InlineKeyboard().text("🔄 Refresh", refreshData);
}

export async function editPolymarketReply(
  ctx: BotContext,
  text: string,
  replyMarkup?: InlineKeyboard,
): Promise<boolean> {
  const msg = ctx.callbackQuery?.message;
  if (!msg) return false;
  const base = {
    parse_mode: "HTML" as const,
    reply_markup: replyMarkup,
  };
  try {
    if ("photo" in msg && msg.photo && msg.photo.length > 0) {
      await ctx.editMessageCaption({
        caption: text,
        ...base,
      });
      return true;
    }
    await ctx.editMessageText(text, {
      ...base,
      link_preview_options: { is_disabled: true },
    });
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("message is not modified")) {
      return true;
    }
    return false;
  }
}

export async function handleEventCacheRefresh(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("rfe:")) return;

  const parts = data.split(":");
  const cacheId = parseInt(parts[1], 10);
  const page = parseInt(parts[2], 10);

  const cached = getCachedEventById(cacheId);
  if (!cached) {
    await ctx.answerCallbackQuery({ text: "Session expired. Send the link again." });
    return;
  }

  const slug = getEventSlugFromRecord(cached.event);
  if (!slug) {
    await ctx.answerCallbackQuery({ text: "Could not refresh." });
    return;
  }

  try {
    const fresh = await fetchEventBySlug(slug);
    if (!fresh) {
      await ctx.answerCallbackQuery({ text: "Event not found." });
      return;
    }

    updateCachedEvent(cacheId, fresh, cached.botUsername);
    const markets = fresh.markets ?? [];
    const totalMarkets = markets.length;
    const totalPages = Math.ceil(totalMarkets / EVENT_PAGE_SIZE);
    const safePage = Math.min(Math.max(0, page), Math.max(0, totalPages - 1));
    const botUsername = cached.botUsername ?? ctx.me?.username;

    if (totalMarkets === 1) {
      const market = markets[0]!;
      const tf = getPreferredMarketTimeframe(ctx.from?.id);
      const text = formatMarket(market, fresh.metrics, tf);
      const marketSlug = market.market_slug ?? market.slug;
      const slugForPayload = getEventSlugFromRecord(fresh) ?? slug;
      const refreshData = allocRefreshPayload({
        kind: "event",
        slug: slugForPayload,
        page: 0,
        timeframe: tf,
      });
      const keyboard = marketSlug
        ? buildMarketDetailKeyboard(
            marketSlug,
            market.event_slug,
            market.question ?? market.title,
            refreshData,
            tf,
            market,
            fresh.metrics,
          )
        : buildRefreshOnlyKeyboard(refreshData);
      const ok = await editPolymarketReply(ctx, withLastUpdatedFooter(text), keyboard);
      if (ok && ctx.from) {
        setPreferredMarketTimeframe(ctx.from.id, tf);
      }
      await ctx.answerCallbackQuery(
        ok ? undefined : { text: "Could not update message. Send the link again." },
      );
      return;
    }

    const text = formatEvent(fresh, botUsername, safePage, EVENT_PAGE_SIZE);
    const keyboard =
      totalPages > 1
        ? buildPaginationKeyboard(cacheId, safePage, totalMarkets)
        : buildRefreshOnlyKeyboard(
            allocRefreshPayload({
              kind: "event",
              slug: getEventSlugFromRecord(fresh) ?? slug,
              page: 0,
            }),
          );

    const ok = await editPolymarketReply(ctx, withLastUpdatedFooter(text), keyboard);
    await ctx.answerCallbackQuery(
      ok ? undefined : { text: "Could not update message. Send the link again." },
    );
  } catch {
    await ctx.answerCallbackQuery({ text: "Could not refresh." });
  }
}

export async function handlePayloadRefresh(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("rf:")) return;

  const id = parseInt(data.slice(3), 10);
  const entry = refreshPayloads.get(id);
  if (!entry) {
    await ctx.answerCallbackQuery({ text: "Session expired. Send the link again." });
    return;
  }

  try {
    if (entry.kind === "market") {
      const market =
        "slug" in entry
          ? await fetchMarketBySlug(entry.slug)
          : await fetchMarketByConditionId(entry.conditionId);
      if (!market) {
        await ctx.answerCallbackQuery({ text: "Market not found." });
        return;
      }
      const tf = normalizeMarketTimeframe(entry.timeframe);
      const marketSlug = market.market_slug ?? market.slug;
      const refreshData = allocMarketRefreshPayload(
        market,
        tf,
        "conditionId" in entry ? entry.conditionId : undefined,
      );
      const keyboard = marketSlug
        ? buildMarketDetailKeyboard(
            marketSlug,
            market.event_slug,
            market.question ?? market.title,
            refreshData,
            tf,
            market,
          )
        : buildRefreshOnlyKeyboard(refreshData);
      const ok = await editPolymarketReply(
        ctx,
        withLastUpdatedFooter(formatMarket(market, undefined, tf)),
        keyboard,
      );
      if (ok && ctx.from) {
        setPreferredMarketTimeframe(ctx.from.id, tf);
      }
      await ctx.answerCallbackQuery(
        ok ? undefined : { text: "Could not update message. Send the link again." },
      );
      return;
    }

    const event = await fetchEventBySlug(entry.slug);
    if (!event) {
      await ctx.answerCallbackQuery({ text: "Event not found." });
      return;
    }

    const markets = event.markets ?? [];
    const botUsername = ctx.me?.username;
    const slug = getEventSlugFromRecord(event) ?? entry.slug;

    if (markets.length === 1) {
      const market = markets[0]!;
      const tf = normalizeMarketTimeframe(
        entry.timeframe ?? getPreferredMarketTimeframe(ctx.from?.id),
      );
      const text = formatMarket(market, event.metrics, tf);
      const marketSlug = market.market_slug ?? market.slug;
      const refreshData = allocRefreshPayload({
        kind: "event",
        slug,
        page: 0,
        timeframe: tf,
      });
      const keyboard = marketSlug
        ? buildMarketDetailKeyboard(
            marketSlug,
            market.event_slug,
            market.question ?? market.title,
            refreshData,
            tf,
            market,
            event.metrics,
          )
        : buildRefreshOnlyKeyboard(refreshData);
      const ok = await editPolymarketReply(ctx, withLastUpdatedFooter(text), keyboard);
      if (ok && ctx.from) {
        setPreferredMarketTimeframe(ctx.from.id, tf);
      }
      await ctx.answerCallbackQuery(
        ok ? undefined : { text: "Could not update message. Send the link again." },
      );
      return;
    }

    if (markets.length > EVENT_PAGE_SIZE) {
      const cacheId = cacheEvent(event, botUsername);
      const totalPages = Math.ceil(markets.length / EVENT_PAGE_SIZE);
      const safePage = Math.min(
        Math.max(0, entry.page),
        Math.max(0, totalPages - 1),
      );
      const keyboard = buildPaginationKeyboard(cacheId, safePage, markets.length);
      const ok = await editPolymarketReply(
        ctx,
        withLastUpdatedFooter(formatEvent(event, botUsername, safePage, EVENT_PAGE_SIZE)),
        keyboard,
      );
      await ctx.answerCallbackQuery(
        ok ? undefined : { text: "Could not update message. Send the link again." },
      );
      return;
    }

    const refreshData = allocRefreshPayload({ kind: "event", slug, page: 0 });
    const keyboard = buildRefreshOnlyKeyboard(refreshData);
    const ok = await editPolymarketReply(
      ctx,
      withLastUpdatedFooter(formatEvent(event, botUsername, 0, EVENT_PAGE_SIZE)),
      keyboard,
    );
    await ctx.answerCallbackQuery(
      ok ? undefined : { text: "Could not update message. Send the link again." },
    );
  } catch {
    await ctx.answerCallbackQuery({ text: "Could not refresh." });
  }
}
