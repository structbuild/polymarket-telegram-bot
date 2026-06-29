import { escapeHtml, formatUsd, truncate } from "./shared.js";

type OrderLevel = { p?: string; s?: string; price?: number | null; size?: number | null; size_usd?: number | null };

type BookSnapshot = {
  position_id?: string;
  outcome?: string;
  best_bid?: number | null;
  best_ask?: number | null;
  mid_price?: number | null;
  spread?: number | null;
  bid_liquidity_usd?: number | null;
  ask_liquidity_usd?: number | null;
  bids?: OrderLevel[];
  asks?: OrderLevel[];
};

function levelPrice(level: OrderLevel): string {
  if (level.p != null) return `${(Number.parseFloat(level.p) * 100).toFixed(1)}¢`;
  if (level.price != null) return `${(level.price * 100).toFixed(1)}¢`;
  return "—";
}

function levelSize(level: OrderLevel): string {
  if (level.s != null) {
    const n = Number.parseFloat(level.s);
    return Number.isFinite(n) ? formatUsd(n) : level.s;
  }
  if (level.size_usd != null) return formatUsd(level.size_usd);
  if (level.size != null) return level.size.toFixed(0);
  return "—";
}

function formatLevels(levels: OrderLevel[] | undefined, side: "bid" | "ask", limit = 5): string[] {
  const slice = (levels ?? []).slice(0, limit);
  if (slice.length === 0) return [`<i>No ${side}s</i>`];
  return slice.map((level) => `${levelPrice(level)} · ${levelSize(level)}`);
}

function formatCents(price: number | null | undefined): string {
  if (price == null) return "—";
  return `${(price * 100).toFixed(1)}¢`;
}

export function formatOrderBook(
  books: BookSnapshot[],
  spreadHistory: {
    spread?: number | null;
    mid_price?: number | null;
  }[],
  question: string | undefined,
  marketUrl?: string,
): string {
  const lines = ["📖 <b>Order Book</b>", ""];
  if (question) lines.push(`<i>${escapeHtml(truncate(question, 80))}</i>`, "");

  for (const book of books) {
    const label = book.outcome ? escapeHtml(book.outcome) : "Outcome";
    lines.push(`<b>${label}</b>`);
    lines.push(
      `Bid: <code>${formatCents(book.best_bid)}</code> · Ask: <code>${formatCents(book.best_ask)}</code> · Spread: <code>${formatCents(book.spread)}</code>`,
    );
    if (book.mid_price != null) {
      lines.push(`Mid: <code>${formatCents(book.mid_price)}</code>`);
    }
    if (book.bid_liquidity_usd != null || book.ask_liquidity_usd != null) {
      lines.push(
        `💧 Liq: bid <code>${formatUsd(book.bid_liquidity_usd ?? 0)}</code> · ask <code>${formatUsd(book.ask_liquidity_usd ?? 0)}</code>`,
      );
    }
    lines.push("");
    lines.push("<b>Top bids</b>");
    lines.push(...formatLevels(book.bids, "bid"));
    lines.push("");
    lines.push("<b>Top asks</b>");
    lines.push(...formatLevels(book.asks, "ask"));
    lines.push("");
  }

  if (spreadHistory.length > 0) {
    lines.push("<b>Recent spread</b>");
    for (const row of spreadHistory.slice(0, 5)) {
      lines.push(
        `• Spread <code>${formatCents(row.spread)}</code> · Mid <code>${formatCents(row.mid_price)}</code>`,
      );
    }
    lines.push("");
  }

  if (marketUrl) lines.push(`🔗 <a href="${marketUrl}">View on Polymarket</a>`);
  return lines.join("\n").trimEnd();
}
