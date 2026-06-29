import type { GlobalEntry } from "@structbuild/sdk";
import { escapeHtml, formatPnlValue, formatUsd } from "./shared.js";

export const LEADERBOARD_TIMEFRAMES = ["1d", "7d", "30d", "lifetime"] as const;
export type LeaderboardTimeframe = (typeof LEADERBOARD_TIMEFRAMES)[number];

export const LEADERBOARD_TIMEFRAME_LABELS: Record<LeaderboardTimeframe, string> = {
  "1d": "24h",
  "7d": "7d",
  "30d": "30d",
  lifetime: "All-time",
};

export function normalizeLeaderboardTimeframe(raw: string): LeaderboardTimeframe {
  if ((LEADERBOARD_TIMEFRAMES as readonly string[]).includes(raw)) {
    return raw as LeaderboardTimeframe;
  }
  return "30d";
}

function formatTraderName(entry: GlobalEntry): string {
  const name = entry.trader.name ?? entry.trader.pseudonym;
  if (name) return escapeHtml(name);
  const address = entry.trader.address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function buildTraderUrl(address: string, botUsername?: string): string | null {
  if (!botUsername) return null;
  const hex = address.replace(/^0x/, "").toLowerCase();
  return `https://t.me/${botUsername}?start=${hex}`;
}

function formatLeaderboardEntry(
  entry: GlobalEntry,
  rank: number,
  botUsername?: string,
): string[] {
  const address = entry.trader.address;
  const name = formatTraderName(entry);
  const url = buildTraderUrl(address, botUsername);
  const badge = entry.trader.verified_badge ? " ✅" : "";
  const heading = url ? `<a href="${url}"><b>${name}</b></a>${badge}` : `<b>${name}</b>${badge}`;
  const pnl = entry.total_pnl_usd ?? entry.realized_pnl_usd ?? 0;
  const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";
  const winRate =
    entry.market_win_rate_pct != null ? `${entry.market_win_rate_pct.toFixed(1)}%` : "—";
  const volume =
    entry.total_volume_usd != null ? formatUsd(entry.total_volume_usd) : "—";
  const markets = entry.markets_traded ?? 0;

  return [
    `<b>${rank}.</b> ${heading}`,
    `   ${pnlEmoji} PnL: <code>${formatPnlValue(pnl)}</code> · WR: <code>${winRate}</code>`,
    `   💰 Vol: <code>${volume}</code> · 📊 Markets: <code>${markets}</code>`,
  ];
}

export function formatLeaderboard(
  entries: GlobalEntry[],
  timeframe: LeaderboardTimeframe,
  page: number,
  pageSize: number,
  hasMore: boolean,
  botUsername?: string,
): string {
  const label = LEADERBOARD_TIMEFRAME_LABELS[timeframe];
  const pageLabel = page > 0 || hasMore ? ` <i>(page ${page + 1})</i>` : "";
  const lines: string[] = [`🏆 <b>Top Traders</b> · ${label}${pageLabel}`, ""];

  if (entries.length === 0) {
    lines.push("No traders found for this timeframe.");
    return lines.join("\n");
  }

  const rankOffset = page * pageSize;
  for (let i = 0; i < entries.length; i++) {
    lines.push(...formatLeaderboardEntry(entries[i], rankOffset + i + 1, botUsername));
    if (i < entries.length - 1) lines.push("");
  }

  if (hasMore) {
    lines.push("");
    lines.push("<i>More on the next page ▶️</i>");
  }

  return lines.join("\n");
}
