import { InlineKeyboard } from "grammy";
import type { MarketEntry, Trade } from "@structbuild/sdk";
import type { BotContext } from "../bot.js";
import { struct } from "../struct.js";
import { escapeHtml, truncate } from "../format/shared.js";
import {
  type HolderRow,
  formatHolderHistory,
  formatMarketHolders,
  formatOutcomeBreakdown,
  formatMarketTopTraders,
  formatMarketTrades,
} from "../format/market-analytics.js";
import { buildMarketDetailKeyboard, getCachedMarketInfo } from "./top-holders.js";
import { allocMarketRefreshPayload, editPolymarketReply } from "./polymarket-refresh.js";
import { formatMarket, withLastUpdatedFooter } from "../format.js";
import type { MarketRecord } from "../format/types.js";
import { getPreferredMarketTimeframe } from "./market-timeframe-prefs.js";

type Kind = "holders" | "traders" | "trades" | "holderhist" | "outcomes";
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
  holderhist: "holder history",
  outcomes: "outcome breakdown",
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
  if (kind === "holderhist") {
    return formatHolderHistory(items as { t: number; h?: number | null }[], marketUrl, question);
  }
  if (kind === "outcomes") {
    return formatOutcomeBreakdown(items as OutcomeHolderRow[], marketUrl, question);
  }
  return formatMarketHolders(items as HolderRow[], page, PAGE_SIZE, marketUrl, question);
}

type OutcomeHolderRow = {
  outcome: string;
  totalHolders: number;
  topHolder?: string;
  topUsd?: number;
};

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

function buildStaticKeyboard(sessionId: number, marketCacheId?: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text("⬅️ Back", marketCacheId != null ? `mb:${marketCacheId}` : `man:${sessionId}:menu`)
    .text("✕ Close", "close")
    .danger();
  return kb;
}

async function fetchItems(kind: Kind, slug: string, snapshot?: MarketRecord): Promise<unknown[]> {
  if (kind === "traders") {
    const res = await struct.markets.getMarketTopTraders({ market_slug: slug, limit: FETCH_LIMIT });
    return res.data ?? [];
  }
  if (kind === "trades") {
    const res = await struct.markets.getTrades({ slugs: slug, sort_desc: true, limit: FETCH_LIMIT });
    return res.data ?? [];
  }
  if (kind === "holderhist") {
    const res = await struct.holders.getMarketHoldersHistory({ market_slug: slug, hours: 72 });
    return res.data ?? [];
  }
  if (kind === "outcomes") {
    const outcomes = (snapshot as { outcomes?: { name: string; position_id?: string | null }[] } | undefined)
      ?.outcomes ?? [];
    const rows: OutcomeHolderRow[] = [];
    for (const outcome of outcomes) {
      if (!outcome.position_id) {
        rows.push({ outcome: outcome.name, totalHolders: 0 });
        continue;
      }
      try {
        const res = await struct.holders.getPositionHolders({
          positionId: outcome.position_id,
          limit: 1,
          include_pnl: false,
        });
        const top = res.data?.holders?.[0];
        rows.push({
          outcome: outcome.name,
          totalHolders: res.data?.total_holders ?? res.data?.holders?.length ?? 0,
          topHolder: top?.trader?.name ?? top?.trader?.pseudonym ?? top?.trader?.address,
          topUsd: top?.shares_usd != null ? Number(top.shares_usd) : undefined,
        });
      } catch {
        rows.push({ outcome: outcome.name, totalHolders: 0 });
      }
    }
    return rows;
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
    const items = await fetchItems(kind, info.slug, info.snapshot);
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
    const keyboard =
      kind === "holderhist" || kind === "outcomes"
        ? buildStaticKeyboard(sessionId, marketCacheId)
        : buildKeyboard(sessionId, kind, 0, items.length);
    await editPolymarketReply(ctx, text, keyboard);
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
      const marketInfo = session.marketCacheId != null ? getCachedMarketInfo(session.marketCacheId) : undefined;
      session.items = await fetchItems(kind, session.slug, marketInfo?.snapshot);
      session.view = kind;
    } catch (error) {
      console.error(`[market-analytics] fetch ${kind} failed:`, error);
      await ctx.answerCallbackQuery({ text: `Could not fetch ${KIND_LABELS[kind]}.` });
      return;
    }
  }

  const text = render(kind, session.items, page, session.marketUrl, session.question);
  const keyboard =
    kind === "holderhist" || kind === "outcomes"
      ? buildStaticKeyboard(id, session.marketCacheId)
      : buildKeyboard(id, kind, page, session.items.length);
  await editPolymarketReply(ctx, text, keyboard);
  await ctx.answerCallbackQuery();
}
