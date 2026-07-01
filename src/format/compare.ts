import type { GlobalEntry, MarketResponse } from "@structbuild/sdk";
import {
  escapeHtml,
  formatCents,
  formatPctSuffix,
  formatPnlValue,
  formatUsd,
  truncate,
} from "./shared.js";
import { deepLink, linkify, marketStartPayload, traderStartPayload } from "./links.js";

function marketTitle(market: MarketResponse): string {
  return escapeHtml(truncate(market.question ?? market.title ?? "Untitled", 64));
}

function marketLink(market: MarketResponse): string {
  return linkify(
    marketTitle(market),
    deepLink(
      marketStartPayload({
        marketSlug: market.market_slug,
        conditionId: market.condition_id,
        eventSlug: market.event_slug,
      }),
    ),
  );
}

function traderName(entry: GlobalEntry): string {
  const name = entry.trader.name ?? entry.trader.pseudonym;
  if (name) return escapeHtml(name);
  const addr = entry.trader.address;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function traderLink(entry: GlobalEntry): string {
  return linkify(traderName(entry), deepLink(traderStartPayload(entry.trader.address)));
}

function formatMarketSide(market: MarketResponse): string[] {
  const vol =
    market.metrics?.["30d"]?.volume ??
    market.metrics?.["7d"]?.volume ??
    market.metrics?.["24h"]?.volume ??
    market.volume_usd;
  const lines = [`📊 ${marketLink(market)}`, ""];
  if (market.outcomes?.length) {
    lines.push("<b>Prices</b>");
    for (const o of market.outcomes.slice(0, 4)) {
      lines.push(`• ${escapeHtml(o.name)}: <code>${formatCents(o.price)}</code>`);
    }
    lines.push("");
  }
  if (vol != null) lines.push(`💰 Volume: <code>${formatUsd(vol)}</code>`);
  if (market.liquidity_usd != null) {
    lines.push(`💧 Liquidity: <code>${formatUsd(market.liquidity_usd)}</code>`);
  }
  return lines;
}

function formatTraderSide(entry: GlobalEntry): string[] {
  const pnl = entry.total_pnl_usd ?? entry.realized_pnl_usd ?? 0;
  const lines = [`👤 ${traderLink(entry)}`, ""];
  lines.push(`🟢/🔴 PnL: <code>${formatPnlValue(pnl)}</code>${formatPctSuffix(entry.total_pnl_pct)}`);
  lines.push(`🎯 Win rate: <code>${entry.market_win_rate_pct.toFixed(1)}%</code>`);
  if (entry.total_volume_usd != null) {
    lines.push(`💰 Volume: <code>${formatUsd(entry.total_volume_usd)}</code>`);
  }
  lines.push(`📊 Markets: <code>${entry.markets_traded}</code>`);
  return lines;
}

export function formatMarketCompare(left: MarketResponse, right: MarketResponse): string {
  const lines = ["⚖️ <b>Market Compare</b>", ""];
  lines.push("<b>Left</b>");
  lines.push(...formatMarketSide(left));
  lines.push("");
  lines.push("<b>Right</b>");
  lines.push(...formatMarketSide(right));
  return lines.join("\n");
}

export function formatTraderCompare(left: GlobalEntry, right: GlobalEntry): string {
  const lines = ["⚖️ <b>Trader Compare</b>", ""];
  lines.push("<b>Left</b>");
  lines.push(...formatTraderSide(left));
  lines.push("");
  lines.push("<b>Right</b>");
  lines.push(...formatTraderSide(right));
  return lines.join("\n");
}
