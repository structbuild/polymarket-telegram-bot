import { InlineKeyboard } from "grammy";
import type { MarketEntry, Trade } from "@structbuild/sdk";
import type { BotContext } from "../bot.js";
import { struct } from "../struct.js";
import { escapeHtml, truncate } from "../format/shared.js";
import {
  type HolderRow,
  formatMarketHolders,
  formatMarketTopTraders,
  formatMarketTrades,
} from "../format/market-analytics.js";
import { buildMarketDetailKeyboard, getCachedMarketInfo } from "./top-holders.js";
import { allocMarketRefreshPayload, editPolymarketReply } from "./polymarket-refresh.js";
import { formatMarket, withLastUpdatedFooter } from "../format.js";
import { getPreferredMarketTimeframe } from "./market-timeframe-prefs.js";

type Kind = "holders" | "traders" | "trades";
type View = Kind | "menu";

const PAGE_SIZE = 8;
const FETCH_LIMIT = 48;
const HOLDERS_PER_OUTCOME = 25;
const CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

const KIND_LABELS: Record<Kind, string> = {
  holders: "holders",
  traders: "top traders",
  trades: "trades",
};

type Session = {
  slug: string;
  eventSlug?: string;
  question?: string;
  marketUrl?: string;
  marketCacheId?: number;
  view: Kind;
  items: unknown[];
  expiresAt: number;
};

const sessions = new Map<number, Session>();
let nextId = 1;

function cacheSession(session: Omit<Session, "expiresAt">): number {
  if (sessions.size >= MAX_CACHE_SIZE) {
    const first = sessions.keys().next().value!;
    sessions.delete(first);
  }
  const id = nextId++;
  sessions.set(id, { ...session, expiresAt: Date.now() + CACHE_TTL_MS });
  return id;
}

function getSession(id: number): Session | undefined {
  const entry = sessions.get(id);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    sessions.delete(id);
    return undefined;
  }
  return entry;
}

function buildMarketUrl(marketSlug: string, eventSlug?: string): string | undefined {
  if (!eventSlug || !marketSlug) return undefined;
  return `https://polymarket.com/event/${eventSlug}/${marketSlug}`;
}

function render(
  kind: Kind,
  items: unknown[],
  page: number,
  marketUrl: string | undefined,
  question: string | undefined,
): string {
  if (kind === "traders") {
    return formatMarketTopTraders(items as MarketEntry[], page, PAGE_SIZE, marketUrl, question);
  }
  if (kind === "trades") {
    return formatMarketTrades(items as Trade[], page, PAGE_SIZE, marketUrl, question);
  }
  return formatMarketHolders(items as HolderRow[], page, PAGE_SIZE, marketUrl, question);
}

function renderMenu(session: Session): string {
  const lines = [`<b>📊 ${escapeHtml(truncate(session.question ?? "Market", 80))}</b>`, ""];
  lines.push("<i>Choose an analytics view below.</i>");
  if (session.marketUrl) {
    lines.push("");
    lines.push(`🔗 <a href="${session.marketUrl}">View on Polymarket</a>`);
  }
  return lines.join("\n");
}

function buildMenuKeyboard(sessionId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("👥 Top Holders", `man:${sessionId}:holders:0`)
    .text("🏆 Top Traders", `man:${sessionId}:traders:0`)
    .row()
    .text("🧾 Trades", `man:${sessionId}:trades:0`)
    .row()
    .text("✕ Close", "close")
    .danger();
}

function buildKeyboard(
  sessionId: number,
  view: Kind,
  page: number,
  total: number,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages > 1) {
    if (page > 0) kb.text("◀️", `man:${sessionId}:${view}:${page - 1}`);
    kb.text(`${page + 1}/${totalPages}`, `man:${sessionId}:${view}:noop`);
    if (page < totalPages - 1) kb.text("▶️", `man:${sessionId}:${view}:${page + 1}`);
    kb.row();
  }
  kb.text("⬅️ Back", `man:${sessionId}:menu`)
    .success()
    .text("✕ Close", "close")
    .danger();
  return kb;
}

async function fetchItems(kind: Kind, slug: string): Promise<unknown[]> {
  if (kind === "traders") {
    const res = await struct.markets.getMarketTopTraders({ market_slug: slug, limit: FETCH_LIMIT });
    return res.data ?? [];
  }
  if (kind === "trades") {
    const res = await struct.markets.getTrades({ slugs: slug, sort_desc: true, limit: FETCH_LIMIT });
    return res.data ?? [];
  }
  const res = await struct.holders.getMarketHolders({
    market_slug: slug,
    limit: HOLDERS_PER_OUTCOME,
    include_pnl: true,
  });
  const rows: HolderRow[] = (res.data?.outcomes ?? []).flatMap((o) =>
    (o.holders ?? []).map((holder) => ({ outcome: o.outcome_name, holder })),
  );
  rows.sort((a, b) => Number(b.holder.shares_usd ?? 0) - Number(a.holder.shares_usd ?? 0));
  return rows;
}

export async function editBackToMarket(
  ctx: BotContext,
  marketCacheId: number,
): Promise<boolean> {
  const cached = getCachedMarketInfo(marketCacheId);
  if (!cached?.snapshot) return false;
  const tf = getPreferredMarketTimeframe(ctx.from?.id);
  const marketSlug = cached.snapshot.market_slug ?? cached.snapshot.slug ?? cached.slug;
  const keyboard = buildMarketDetailKeyboard(
    marketSlug,
    cached.eventSlug,
    cached.question,
    allocMarketRefreshPayload(cached.snapshot, tf),
    tf,
    cached.snapshot,
    cached.metricsOverride,
  );
  return editPolymarketReply(
    ctx,
    withLastUpdatedFooter(formatMarket(cached.snapshot, cached.metricsOverride, tf)),
    keyboard,
  );
}

export async function handleBackToMarket(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("mb:")) return;
  const marketCacheId = Number.parseInt(data.split(":")[1], 10);
  const ok = await editBackToMarket(ctx, marketCacheId);
  await ctx.answerCallbackQuery(
    ok ? undefined : { text: "Session expired. Send the link again." },
  );
}

export async function handleMarketAnalytics(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("ma:")) return;

  const parts = data.split(":");
  const marketCacheId = Number.parseInt(parts[1], 10);
  const kind = parts[2] as Kind;
  const info = getCachedMarketInfo(marketCacheId);

  if (!info) {
    await ctx.answerCallbackQuery({ text: "Session expired. Send the link again." });
    return;
  }

  await ctx.answerCallbackQuery();

  const marketUrl = buildMarketUrl(info.slug, info.eventSlug);
  try {
    const items = await fetchItems(kind, info.slug);
    const sessionId = cacheSession({
      slug: info.slug,
      eventSlug: info.eventSlug,
      question: info.question,
      marketUrl,
      marketCacheId,
      view: kind,
      items,
    });
    const text = render(kind, items, 0, marketUrl, info.question);
    await editPolymarketReply(ctx, text, buildKeyboard(sessionId, kind, 0, items.length));
  } catch (error) {
    console.error(`[market-analytics] fetch ${kind} failed:`, error);
    await ctx.reply(`❌ Could not fetch ${KIND_LABELS[kind]} for this market.`);
  }
}

export async function handleMarketAnalyticsNav(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("man:")) return;

  const parts = data.split(":");
  const id = Number.parseInt(parts[1], 10);
  const view = parts[2] as View;
  const action = parts[3];

  if (action === "noop") {
    await ctx.answerCallbackQuery();
    return;
  }

  const session = getSession(id);
  if (!session) {
    await ctx.answerCallbackQuery({ text: "Session expired. Send the link again." });
    return;
  }

  if (view === "menu") {
    const ok =
      session.marketCacheId != null && (await editBackToMarket(ctx, session.marketCacheId));
    if (!ok) {
      await editPolymarketReply(ctx, renderMenu(session), buildMenuKeyboard(id));
    }
    await ctx.answerCallbackQuery();
    return;
  }

  const kind = view as Kind;
  const page = Number.parseInt(action ?? "0", 10) || 0;

  if (session.view !== kind) {
    try {
      session.items = await fetchItems(kind, session.slug);
      session.view = kind;
    } catch (error) {
      console.error(`[market-analytics] fetch ${kind} failed:`, error);
      await ctx.answerCallbackQuery({ text: `Could not fetch ${KIND_LABELS[kind]}.` });
      return;
    }
  }

  const text = render(kind, session.items, page, session.marketUrl, session.question);
  await editPolymarketReply(ctx, text, buildKeyboard(id, kind, page, session.items.length));
  await ctx.answerCallbackQuery();
}
