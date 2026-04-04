import { formatUsd } from "./shared.js";

interface PriceJump {
  from: number;
  to: number;
  price_before: number;
  price_after: number;
  change_pct: number;
  direction: string;
  volume: number;
  trades_count: number;
  condition_id: string;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function formatPrice(price: number): string {
  return `${(price * 100).toFixed(1)}¢`;
}

export function formatPriceJumps(jumps: PriceJump[], page: number, pageSize: number): string {
  if (jumps.length === 0) {
    return "⚡ <b>Price Jumps</b>\n<i>Showing &gt;10% price jumps in 30-minute windows</i>\n\nNo significant price jumps found.";
  }

  const totalPages = Math.ceil(jumps.length / pageSize);
  const slice = jumps.slice(page * pageSize, (page + 1) * pageSize);
  const lines: string[] = [
    `⚡ <b>Price Jumps</b>  <i>(${page + 1}/${totalPages})</i>`,
    "<i>Showing &gt;10% price jumps in 30-minute windows</i>",
    "",
  ];

  for (const jump of slice) {
    const arrow = jump.direction === "up" ? "📈" : "📉";
    const sign = jump.direction === "up" ? "+" : "-";
    lines.push(
      `${arrow} <b>${sign}${jump.change_pct.toFixed(2)}%</b>  ${formatPrice(jump.price_before)} → ${formatPrice(jump.price_after)}`
    );
    lines.push(`┣ ${formatTimestamp(jump.from)}`);
    lines.push(`┗ Vol: <code>${formatUsd(jump.volume)}</code>  Trades: <code>${jump.trades_count}</code>`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
