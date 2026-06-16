import type { GlobalEntry, UserProfile } from "@structbuild/sdk";
import {
  escapeHtml,
  formatPctSuffix,
  formatPnlValue,
  formatSignedUsd,
  formatUsd,
} from "./shared.js";

function formatWinRate(pct: number | null | undefined): string {
  if (pct == null) return "—";
  return `${pct.toFixed(1)}%`;
}

function formatTraderName(profile: UserProfile | null, address: string): string {
  const name = profile?.name ?? profile?.pseudonym;
  if (name) return escapeHtml(name);
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function buildExplorerUrl(address: string): string {
  return `https://explorer.struct.to/traders/${address}`;
}

function buildProfileUrl(address: string): string {
  return `https://polymarket.com/profile/${address}`;
}

export function formatTraderHeader(
  address: string,
  profile: UserProfile | null,
): string {
  const name = formatTraderName(profile, address);
  const badge = profile?.verified_badge ? " ✅" : "";
  return `👤 <b>${name}</b>${badge}\n<code>${address}</code>`;
}

export function formatTrader(
  address: string,
  profile: UserProfile | null,
  pnl: GlobalEntry | null,
): string {
  const lines: string[] = [formatTraderHeader(address, profile)];

  if (profile?.bio) {
    lines.push(`<i>${escapeHtml(profile.bio)}</i>`);
  }

  if (pnl) {
    const netPnl = pnl.total_pnl_usd ?? pnl.realized_pnl_usd;

    lines.push("");
    lines.push("<b>Net PnL</b> <i>(all-time)</i>");
    const pnlEmoji = (netPnl ?? 0) >= 0 ? "🟢" : "🔴";
    lines.push(
      `${pnlEmoji} Net: <code>${formatPnlValue(netPnl)}</code>${formatPctSuffix(pnl.total_pnl_pct)}`,
    );
    lines.push(`✅ Realized: <code>${formatPnlValue(pnl.realized_pnl_usd)}</code>`);
    if (pnl.unrealized_pnl_usd != null) {
      lines.push(
        `📉 Unrealized: <code>${formatPnlValue(pnl.unrealized_pnl_usd)}</code>`,
      );
    }

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
      lines.push(`🎯 Win rate: <code>${formatWinRate(pnl.market_win_rate_pct)}</code>`);
    }
    if (pnl.profit_factor != null) {
      lines.push(`⚖️ Profit factor: <code>${pnl.profit_factor.toFixed(2)}×</code>`);
    }
    if (pnl.avg_win_usd != null && pnl.avg_loss_usd != null) {
      lines.push(
        `📐 Avg W/L: <code>${formatSignedUsd(Math.abs(pnl.avg_win_usd))}</code> / <code>${formatSignedUsd(-Math.abs(pnl.avg_loss_usd))}</code>`,
      );
    }
    const totalTrades = (pnl.total_buys ?? 0) + (pnl.total_sells ?? 0);
    if (totalTrades > 0) {
      lines.push(`🔄 Total trades: <code>${totalTrades}</code>`);
    }

    const breakdown: string[] = [];
    if (pnl.maker_rebate_usd) {
      breakdown.push(`🏷 Maker rebates: <code>${formatPnlValue(pnl.maker_rebate_usd)}</code>`);
    }
    if (pnl.reward_usd) {
      breakdown.push(`🎁 Rewards: <code>${formatPnlValue(pnl.reward_usd)}</code>`);
    }
    if (pnl.yield_usd) {
      breakdown.push(`🌱 Yield: <code>${formatPnlValue(pnl.yield_usd)}</code>`);
    }
    if (pnl.total_fees) {
      breakdown.push(`💸 Fees: <code>${formatPnlValue(-Math.abs(pnl.total_fees))}</code>`);
    }
    if (breakdown.length) {
      lines.push("");
      lines.push("<b>Breakdown</b> <i>(in net)</i>");
      lines.push(...breakdown);
    }

    if (pnl.best_trade_pnl_usd != null || pnl.worst_trade_pnl_usd != null) {
      lines.push("");
      lines.push("<b>Extremes</b>");
      if (pnl.best_trade_pnl_usd != null) {
        lines.push(`📈 Best trade: <code>${formatSignedUsd(pnl.best_trade_pnl_usd)}</code>`);
      }
      if (pnl.worst_trade_pnl_usd != null) {
        lines.push(`📉 Worst trade: <code>${formatSignedUsd(pnl.worst_trade_pnl_usd)}</code>`);
      }
    }
  }

  lines.push("");
  lines.push(
    `🔗 <a href="${buildExplorerUrl(address)}">View on Struct</a> · <a href="${buildProfileUrl(address)}">Polymarket</a>`,
  );

  return lines.join("\n");
}
