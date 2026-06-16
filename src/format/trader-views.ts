import type {
  CategoryEntry,
  MarketEntry,
  PnlExitMarker,
  PositionEntry,
  Trade,
} from "@structbuild/sdk";
import {
  escapeHtml,
  formatCents,
  formatPctSuffix,
  formatPnlValue,
  formatRelativeTime,
  formatSignedUsd,
  formatUsd,
  truncate,
} from "./shared.js";
import { deepLink, linkify, marketStartPayload } from "./links.js";

const TITLE_MAX = 48;

function pnlEmoji(value: number | null | undefined): string {
  return (value ?? 0) >= 0 ? "🟢" : "🔴";
}

function title(text: string | null | undefined): string {
  return escapeHtml(truncate(text?.trim() || "Untitled", TITLE_MAX));
}

function titleLink(
  text: string | null | undefined,
  ids: { marketSlug?: string | null; conditionId?: string | null; eventSlug?: string | null },
): string {
  return linkify(title(text), deepLink(marketStartPayload(ids)));
}

function render(
  header: string,
  heading: string,
  page: number,
  items: string[],
  hasMore: boolean,
  emptyLabel: string,
): string {
  const lines = [header, "", `<b>${heading}</b> <i>(page ${page + 1})</i>`, ""];
  if (items.length === 0) {
    lines.push(`<i>No ${emptyLabel} on this page.</i>`);
    return lines.join("\n");
  }
  lines.push(...items);
  if (hasMore) {
    lines.push("");
    lines.push("<i>More on the next page ▶️</i>");
  }
  return lines.join("\n");
}

export function formatPositions(
  header: string,
  items: PositionEntry[],
  page: number,
  status: "open" | "closed",
  hasMore: boolean,
): string {
  const heading = status === "open" ? "📈 Open Positions" : "📕 Closed Positions";
  const rows = items.flatMap((p) => {
    const pnl = p.total_pnl_usd ?? p.realized_pnl_usd;
    const outcome = p.outcome ? escapeHtml(p.outcome) : "—";
    const head = `${pnlEmoji(pnl)} <b>${outcome}</b> · ${titleLink(p.title ?? p.question, {
      marketSlug: p.market_slug,
      conditionId: p.condition_id,
      eventSlug: p.event_slug,
    })}`;
    if (status === "open") {
      const value = formatUsd(p.current_value ?? 0);
      return [
        head,
        `   💵 <code>${value}</code> • <code>${formatPnlValue(pnl)}</code>${formatPctSuffix(p.total_pnl_pct)}`,
      ];
    }
    const result = p.won === true ? " • ✅ Won" : p.won === false ? " • ❌ Lost" : "";
    return [
      head,
      `   <code>${formatPnlValue(pnl)}</code>${formatPctSuffix(p.total_pnl_pct)}${result}`,
    ];
  });
  return render(
    header,
    heading,
    page,
    rows,
    hasMore,
    status === "open" ? "open positions" : "closed positions",
  );
}

export function formatActivity(
  header: string,
  items: Trade[],
  page: number,
  hasMore: boolean,
): string {
  const rows = items.flatMap((trade) => {
    const t = trade as {
      trade_type?: string;
      side?: string;
      outcome?: string;
      question?: string;
      slug?: string;
      usd_amount?: number;
      price?: number;
      confirmed_at?: number;
    };
    let emoji = "•";
    let label = t.trade_type ?? "Trade";
    if (!t.trade_type || t.trade_type === "OrderFilled" || t.trade_type === "OrdersMatched") {
      const isSell = t.side === "1";
      emoji = isSell ? "🔴" : "🟢";
      label = isSell ? "Sell" : "Buy";
    }
    const outcome = t.outcome ? ` <b>${escapeHtml(t.outcome)}</b>` : "";
    const head = `${emoji} ${label}${outcome} · ${title(t.question)}`;
    const parts: string[] = [];
    if (t.usd_amount != null) parts.push(`<code>${formatUsd(t.usd_amount)}</code>`);
    if (t.price != null) parts.push(`@ ${formatCents(t.price)}`);
    parts.push(formatRelativeTime(t.confirmed_at));
    return [head, `   ${parts.join(" • ")}`];
  });
  return render(header, "🧾 Recent Activity", page, rows, hasMore, "activity");
}

export function formatCategories(
  header: string,
  items: CategoryEntry[],
  page: number,
  hasMore: boolean,
): string {
  const rows = items.flatMap((c) => {
    const pnl = c.total_pnl_usd ?? c.realized_pnl_usd;
    const head = `${pnlEmoji(pnl)} <b>${escapeHtml(truncate(c.category ?? "Uncategorized", TITLE_MAX))}</b>`;
    const meta = [
      `<code>${formatPnlValue(pnl)}</code>${formatPctSuffix(c.total_pnl_pct)}`,
      `🎯 ${c.market_win_rate_pct.toFixed(0)}%`,
      `${c.markets_traded} mkts`,
      `💰 ${formatUsd(c.total_volume_usd)}`,
    ];
    return [head, `   ${meta.join(" • ")}`];
  });
  return render(header, "🗂 Categories", page, rows, hasMore, "categories");
}

export function formatMarkets(
  header: string,
  items: MarketEntry[],
  page: number,
  hasMore: boolean,
): string {
  const rows = items.flatMap((m) => {
    const pnl = m.total_pnl_usd ?? m.realized_pnl_usd;
    const status = m.resolved
      ? m.won === true
        ? "✅ Won"
        : m.won === false
          ? "❌ Lost"
          : "⚪️ Resolved"
      : "🟢 Open";
    const head = `${pnlEmoji(pnl)} ${titleLink(m.title ?? m.question, {
      marketSlug: m.market_slug,
      conditionId: m.condition_id,
      eventSlug: m.event_slug,
    })}`;
    const meta = [
      `<code>${formatPnlValue(pnl)}</code>${formatPctSuffix(m.total_pnl_pct)}`,
      status,
      `💰 ${formatUsd(m.total_volume_usd)}`,
    ];
    return [head, `   ${meta.join(" • ")}`];
  });
  return render(header, "🏷 Markets Traded", page, rows, hasMore, "markets");
}

const EXIT_REASON_LABELS: Record<string, string> = {
  resolved_win: "Resolved ✅",
  resolved_loss: "Resolved ❌",
  sold_win: "Sold",
  sold_loss: "Sold",
};

export function formatTopTrades(
  header: string,
  items: PnlExitMarker[],
  page: number,
  kind: "w" | "l",
  hasMore: boolean,
): string {
  const heading = kind === "w" ? "🏆 Biggest Wins" : "💥 Biggest Losses";
  const rows = items.flatMap((e) => {
    const head = `${pnlEmoji(e.pnl_usd)} ${titleLink(e.title ?? e.question, {
      marketSlug: e.market_slug,
      conditionId: e.condition,
      eventSlug: e.event_slug,
    })}`;
    const meta = [
      `<code>${formatSignedUsd(e.pnl_usd)}</code> (${e.pnl_pct.toFixed(1)}%)`,
      EXIT_REASON_LABELS[e.reason] ?? e.reason,
      formatRelativeTime(e.t),
    ];
    return [head, `   ${meta.join(" • ")}`];
  });
  return render(header, heading, page, rows, hasMore, "trades");
}
