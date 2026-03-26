import type { MarketHoldersResponse } from "@structbuild/sdk";
import { escapeHtml, formatCents, formatUsd } from "./shared.js";

const MAX_NAME_LENGTH = 20;

function truncate(value: string): string {
  if (value.length <= MAX_NAME_LENGTH) return value;
  return `${value.slice(0, MAX_NAME_LENGTH - 1)}…`;
}

function formatHolderName(trader?: {
  name?: string | null;
  pseudonym?: string | null;
  address?: string;
}): string {
  if (!trader) return "Unknown";
  const name = trader.name ?? trader.pseudonym;
  const label = name
    ? escapeHtml(truncate(name))
    : `${(trader.address ?? "").slice(0, 6)}…${(trader.address ?? "").slice(-4)}`;
  if (!trader.address) return label;
  return `<a href="https://polymarket.com/${trader.address}">${label}</a>`;
}

function formatShares(shares?: string): string {
  if (!shares) return "0";
  const num = parseFloat(shares);
  if (isNaN(num)) return shares;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

export function formatTopHolders(data: MarketHoldersResponse): string {
  const lines: string[] = [];

  const question = data.question ?? "Unknown Market";
  lines.push(`👥 <b>Top Holders</b>`);
  lines.push(escapeHtml(question));
  lines.push(
    `Total holders: <code>${(data.total_holders ?? 0).toLocaleString()}</code>`,
  );

  const outcomes = data.outcomes ?? [];
  for (const outcome of outcomes) {
    const holders = outcome.holders ?? [];
    if (holders.length === 0) continue;

    lines.push("");
    const outcomeName = outcome.outcome_name ?? "Unknown";
    const price =
      outcome.price != null ? ` (${formatCents(outcome.price)})` : "";
    lines.push(`<b>${escapeHtml(outcomeName)}</b>${price}`);

    for (let i = 0; i < holders.length; i++) {
      const h = holders[i];
      const prefix = i < holders.length - 1 ? "┣" : "┗";
      const name = formatHolderName(h.trader);
      const badge = h.trader?.verified_badge ? " ✅" : "";
      const shares = formatShares(h.shares);
      const usd = h.shares_usd
        ? ` (${formatUsd(parseFloat(h.shares_usd))})`
        : "";
      lines.push(
        `${prefix} ${i + 1}. ${name}${badge} — <code>${shares}</code> shares${usd}`,
      );
    }
  }

  return lines.join("\n");
}
