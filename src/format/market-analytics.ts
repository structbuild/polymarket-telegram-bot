import type { MarketEntry, MarketHolder, Trade } from "@structbuild/sdk";
import {
  escapeHtml,
  formatCents,
  formatPctSuffix,
  formatPnlValue,
  formatRelativeTime,
  formatUsd,
  truncate,
} from "./shared.js";
import { deepLink, linkify, traderStartPayload } from "./links.js";

export type HolderRow = { outcome: string; holder: MarketHolder };

type TraderLike = {
  address?: string | null;
  name?: string | null;
  pseudonym?: string | null;
} | null;

function traderName(t: TraderLike): string {
  if (!t) return "Unknown";
  const name = t.name ?? t.pseudonym;
  if (name) return escapeHtml(truncate(name, 24));
  const addr = t.address ?? "";
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "Unknown";
}

function traderLink(t: TraderLike): string {
  return linkify(traderName(t), deepLink(traderStartPayload(t?.address ?? null)));
}

function header(
  title: string,
  question: string | undefined,
  page: number,
  totalPages: number,
): string[] {
  const suffix = totalPages > 1 ? ` <i>(page ${page + 1}/${totalPages})</i>` : "";
  const lines = [`<b>${title}</b>${suffix}`];
  if (question) lines.push(escapeHtml(truncate(question, 80)));
  lines.push("");
  return lines;
}

function footer(marketUrl: string | undefined): string[] {
  return marketUrl ? ["", `🔗 <a href="${marketUrl}">View on Polymarket</a>`] : [];
}

function paginate<T>(items: T[], page: number, size: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const start = page * size;
  return { slice: items.slice(start, start + size), totalPages, start };
}

export function formatMarketTopTraders(
  items: MarketEntry[],
  page: number,
  size: number,
  marketUrl?: string,
  question?: string,
): string {
  const { slice, totalPages, start } = paginate(items, page, size);
  const lines = header("🏆 Top Traders", question, page, totalPages);
  slice.forEach((m, i) => {
    const pnl = m.total_pnl_usd ?? m.realized_pnl_usd;
    lines.push(
      `${start + i + 1}. ${traderLink(m.trader ?? null)} — <code>${formatPnlValue(pnl)}</code>${formatPctSuffix(m.total_pnl_pct)} • 💰 ${formatUsd(m.total_volume_usd)} vol`,
    );
  });
  if (slice.length === 0) lines.push("<i>No top traders found.</i>");
  lines.push(...footer(marketUrl));
  return lines.join("\n");
}

export function formatMarketTrades(
  items: Trade[],
  page: number,
  size: number,
  marketUrl?: string,
  question?: string,
): string {
  const { slice, totalPages } = paginate(items, page, size);
  const lines = header("🧾 Recent Trades", question, page, totalPages);
  for (const trade of slice) {
    const t = trade as {
      trade_type?: string;
      side?: string;
      outcome?: string;
      usd_amount?: number;
      price?: number;
      confirmed_at?: number;
      trader?: TraderLike;
    };
    let emoji = "•";
    let label = t.trade_type ?? "Trade";
    if (!t.trade_type || t.trade_type === "OrderFilled" || t.trade_type === "OrdersMatched") {
      const isSell = t.side === "1";
      emoji = isSell ? "🔴" : "🟢";
      label = isSell ? "Sell" : "Buy";
    }
    const outcome = t.outcome ? ` <b>${escapeHtml(t.outcome)}</b>` : "";
    const parts: string[] = [];
    if (t.usd_amount != null) parts.push(`<code>${formatUsd(t.usd_amount)}</code>`);
    if (t.price != null) parts.push(`@ ${formatCents(t.price)}`);
    parts.push(formatRelativeTime(t.confirmed_at));
    lines.push(
      `${emoji} ${label}${outcome} · ${traderLink(t.trader ?? null)} — ${parts.join(" • ")}`,
    );
  }
  if (slice.length === 0) lines.push("<i>No recent trades found.</i>");
  lines.push(...footer(marketUrl));
  return lines.join("\n");
}

export function formatMarketHolders(
  items: HolderRow[],
  page: number,
  size: number,
  marketUrl?: string,
  question?: string,
): string {
  const { slice, totalPages, start } = paginate(items, page, size);
  const lines = header("👥 Top Holders", question, page, totalPages);
  slice.forEach((row, i) => {
    const h = row.holder;
    const sharesUsd = h.shares_usd != null ? formatUsd(Number(h.shares_usd)) : "—";
    const parts = [`💵 <code>${sharesUsd}</code>`];
    if (h.pnl) parts.push(`<code>${formatPnlValue(h.pnl.total_pnl_usd)}</code>`);
    lines.push(
      `${start + i + 1}. ${traderLink(h.trader)} <i>(${escapeHtml(row.outcome)})</i> — ${parts.join(" • ")}`,
    );
  });
  if (slice.length === 0) lines.push("<i>No holders found.</i>");
  lines.push(...footer(marketUrl));
  return lines.join("\n");
}
