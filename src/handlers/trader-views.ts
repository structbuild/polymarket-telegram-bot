import { InlineKeyboard } from "grammy";
import type { GlobalEntry, UserProfile } from "@structbuild/sdk";
import type { BotContext } from "../bot.js";
import { formatTrader, formatTraderHeader } from "../format.js";
import {
  formatActivity,
  formatCategories,
  formatMarkets,
  formatPositions,
  formatTopTrades,
  formatPnlCalendar,
} from "../format/trader-views.js";
import { editPolymarketReply } from "./polymarket-refresh.js";
import {
  type TopTradesKind,
  fetchTraderActivity,
  fetchTraderCategories,
  fetchTraderMarkets,
  fetchTraderPnl,
  fetchTraderPositions,
  fetchTraderProfile,
  fetchTraderTopTrades,
  fetchTraderPnlCalendar,
} from "./trader.fetch.js";

const POS_SIZE = 6;
const ACT_SIZE = 8;
const CAT_SIZE = 8;
const MKT_SIZE = 6;
const TOP_SIZE = 6;

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

type CachedTrader = {
  address: string;
  profile: UserProfile | null;
  pnl: GlobalEntry | null;
  expiresAt: number;
};

const traderCache = new Map<number, CachedTrader>();
let nextId = 1;

function pruneTraderCache(): void {
  const now = Date.now();
  for (const [id, entry] of traderCache) {
    if (now > entry.expiresAt) traderCache.delete(id);
  }
  if (traderCache.size >= MAX_CACHE_SIZE) {
    const first = traderCache.keys().next().value!;
    traderCache.delete(first);
  }
}

export function cacheTrader(
  address: string,
  profile: UserProfile | null,
  pnl: GlobalEntry | null,
): number {
  if (traderCache.size >= MAX_CACHE_SIZE) {
    pruneTraderCache();
  }
  const id = nextId++;
  traderCache.set(id, { address, profile, pnl, expiresAt: Date.now() + CACHE_TTL_MS });
  return id;
}

function getCachedTrader(id: number): CachedTrader | undefined {
  const entry = traderCache.get(id);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    traderCache.delete(id);
    return undefined;
  }
  return entry;
}

function updateCachedTrader(
  id: number,
  profile: UserProfile | null,
  pnl: GlobalEntry | null,
): void {
  const entry = traderCache.get(id);
  if (!entry) return;
  entry.profile = profile;
  entry.pnl = pnl;
  entry.expiresAt = Date.now() + CACHE_TTL_MS;
  traderCache.delete(id);
  traderCache.set(id, entry);
}

export function buildTraderMenuKeyboard(cacheId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("📈 Open", `tr:${cacheId}:open:0`)
    .text("📕 Closed", `tr:${cacheId}:closed:0`)
    .row()
    .text("🧾 Activity", `tr:${cacheId}:act:0`)
    .text("🗂 Categories", `tr:${cacheId}:cat:0`)
    .row()
    .text("🏷 Markets", `tr:${cacheId}:mkt:0`)
    .text("🏆 Top Trades", `tr:${cacheId}:top:0:w`)
    .row()
    .text("📅 Calendar", `tr:${cacheId}:cal:0`)
    .row()
    .text("🔄 Refresh", `tr:${cacheId}:ref:0`)
    .row()
    .text("✕ Close", "close")
    .danger();
}

function buildTraderListKeyboard(
  cacheId: number,
  view: string,
  page: number,
  hasMore: boolean,
  kind?: TopTradesKind,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const suffix = kind ? `:${kind}` : "";
  if (page > 0 || hasMore) {
    if (page > 0) kb.text("◀️", `tr:${cacheId}:${view}:${page - 1}${suffix}`);
    kb.text(`Page ${page + 1}`, `tr:${cacheId}:${view}:noop`);
    if (hasMore) kb.text("▶️", `tr:${cacheId}:${view}:${page + 1}${suffix}`);
    kb.row();
  }
  if (view === "top") {
    kb.text(
      kind === "w" ? "✅ Wins" : "🏆 Wins",
      kind === "w" ? `tr:${cacheId}:top:noop` : `tr:${cacheId}:top:0:w`,
    )
      .text(
        kind === "l" ? "✅ Losses" : "💥 Losses",
        kind === "l" ? `tr:${cacheId}:top:noop` : `tr:${cacheId}:top:0:l`,
      )
      .row();
  }
  kb.text("⬅️ Back", `tr:${cacheId}:sum:0`)
    .success()
    .text("✕ Close", "close")
    .danger();
  return kb;
}

export async function handleTraderView(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("tr:")) return;

  const parts = data.split(":");
  const cacheId = Number.parseInt(parts[1], 10);
  const view = parts[2];
  const action = parts[3];

  if (action === "noop") {
    await ctx.answerCallbackQuery();
    return;
  }

  const cached = getCachedTrader(cacheId);
  if (!cached) {
    await ctx.answerCallbackQuery({ text: "Session expired — send the address again." });
    return;
  }

  const page = Number.parseInt(action ?? "0", 10) || 0;
  const { address } = cached;
  const header = formatTraderHeader(address, cached.profile);

  let text: string;
  let keyboard: InlineKeyboard;

  switch (view) {
    case "sum":
      text = formatTrader(address, cached.profile, cached.pnl);
      keyboard = buildTraderMenuKeyboard(cacheId);
      break;
    case "ref": {
      const [profile, pnl] = await Promise.all([
        fetchTraderProfile(address),
        fetchTraderPnl(address),
      ]);
      updateCachedTrader(cacheId, profile, pnl);
      text = formatTrader(address, profile, pnl);
      keyboard = buildTraderMenuKeyboard(cacheId);
      break;
    }
    case "open":
    case "closed": {
      const status = view === "open" ? "open" : "closed";
      const { items, hasMore } = await fetchTraderPositions(address, status, page, POS_SIZE);
      text = formatPositions(header, items, page, status, hasMore);
      keyboard = buildTraderListKeyboard(cacheId, view, page, hasMore);
      break;
    }
    case "act": {
      const { items, hasMore } = await fetchTraderActivity(address, page, ACT_SIZE);
      text = formatActivity(header, items, page, hasMore);
      keyboard = buildTraderListKeyboard(cacheId, view, page, hasMore);
      break;
    }
    case "cat": {
      const { items, hasMore } = await fetchTraderCategories(address, page, CAT_SIZE);
      text = formatCategories(header, items, page, hasMore);
      keyboard = buildTraderListKeyboard(cacheId, view, page, hasMore);
      break;
    }
    case "mkt": {
      const { items, hasMore } = await fetchTraderMarkets(address, page, MKT_SIZE);
      text = formatMarkets(header, items, page, hasMore);
      keyboard = buildTraderListKeyboard(cacheId, view, page, hasMore);
      break;
    }
    case "top": {
      const kind: TopTradesKind = parts[4] === "l" ? "l" : "w";
      const { items, hasMore } = await fetchTraderTopTrades(address, kind, page, TOP_SIZE);
      text = formatTopTrades(header, items, page, kind, hasMore);
      keyboard = buildTraderListKeyboard(cacheId, "top", page, hasMore, kind);
      break;
    }
    case "cal": {
      const entries = await fetchTraderPnlCalendar(address);
      text = formatPnlCalendar(header, entries, page);
      keyboard = buildTraderListKeyboard(cacheId, "cal", page, entries.length > (page + 1) * 10);
      break;
    }
    default:
      await ctx.answerCallbackQuery();
      return;
  }

  const ok = await editPolymarketReply(ctx, text, keyboard);
  await ctx.answerCallbackQuery(
    ok ? undefined : { text: "Could not update message. Send the address again." },
  );
}
