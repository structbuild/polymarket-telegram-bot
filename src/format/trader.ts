import type { TraderPnlSummary, UserProfile } from "@structbuild/sdk";
import { escapeHtml, formatUsd } from "./shared.js";

function formatPnlValue(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${formatUsd(Math.abs(value))}`;
}

function formatSignedUsd(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatWinRate(pct: number | null | undefined): string {
  if (pct == null) return "—";
  return `${pct.toFixed(1)}%`;
}

function formatTraderName(
  profile: UserProfile | null,
  pnl: TraderPnlSummary | null,
  address: string,
): string {
  const name = profile?.name ?? profile?.pseudonym;
  if (name) return escapeHtml(name);
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function buildProfileUrl(address: string): string {
  return `https://polymarket.com/profile/${address}`;
}

export function formatTrader(
  address: string,
  profile: UserProfile | null,
  pnl: TraderPnlSummary | null,
): string {
  const lines: string[] = [];
  const name = formatTraderName(profile, pnl, address);

  const badge = profile?.verified_badge ? " ✅" : "";
  lines.push(`👤 <b>${name}</b>${badge}`);

  if (profile?.bio) {
    lines.push(`<i>${escapeHtml(profile.bio)}</i>`);
  }

  if (pnl) {
    lines.push("");
    lines.push("<b>PnL</b>");
    const pnlEmoji = (pnl.realized_pnl_usd ?? 0) >= 0 ? "🟢" : "🔴";
    lines.push(`${pnlEmoji} Lifetime: <code>${formatPnlValue(pnl.realized_pnl_usd)}</code>`);

    lines.push("");
    lines.push("<b>Stats</b>");

    if (pnl.total_volume_usd != null) {
      lines.push(`💰 Volume: <code>${formatUsd(pnl.total_volume_usd)}</code>`);
    }
    if (pnl.markets_traded != null) {
      lines.push(`📊 Markets traded: <code>${pnl.markets_traded}</code>`);
    }
    if (pnl.markets_won != null && pnl.markets_lost != null) {
      lines.push(
        `🏆 Won/Lost: <code>${pnl.markets_won}W</code> / <code>${pnl.markets_lost}L</code>`,
      );
    }
    if (pnl.market_win_rate_pct != null) {
      lines.push(
        `🎯 Win rate: <code>${formatWinRate(pnl.market_win_rate_pct)}</code>`,
      );
    }
    const totalTrades = (pnl.total_buys ?? 0) + (pnl.total_sells ?? 0);
    if (totalTrades > 0) {
      lines.push(`🔄 Total trades: <code>${totalTrades}</code>`);
    }

    if (pnl.avg_pnl_per_trade != null) {
      lines.push(
        `📈 Avg PnL/trade: <code>${formatSignedUsd(pnl.avg_pnl_per_trade)}</code>`,
      );
    }

    if (pnl.best_trade_pnl_usd != null) {
      lines.push("");
      lines.push("<b>Extremes</b>");
      if (pnl.best_trade_pnl_usd != null) {
        lines.push(
          `📈 Best trade: <code>${formatSignedUsd(pnl.best_trade_pnl_usd)}</code>`,
        );
      }
    }
  }

  lines.push("");
  lines.push(`🔗 <a href="${buildProfileUrl(address)}">View on Polymarket</a>`);

  return lines.join("\n");
}
