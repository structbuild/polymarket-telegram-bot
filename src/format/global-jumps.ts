import { escapeHtml, formatUsd, truncate } from "./shared.js";

export type GlobalPriceJump = {
  from: number;
  to: number;
  price_before: number;
  price_after: number;
  change_pct: number;
  direction: string;
  volume: number;
  trades_count: number;
  condition_id: string;
  marketSlug: string;
  eventSlug?: string;
  question: string;
};

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

function buildMarketUrl(jump: GlobalPriceJump): string | null {
  if (!jump.eventSlug) return null;
  return `https://polymarket.com/event/${jump.eventSlug}/${jump.marketSlug}`;
}

function buildBotMarketUrl(jump: GlobalPriceJump, botUsername?: string): string | null {
  if (!botUsername || !jump.marketSlug) return null;
  return `https://t.me/${botUsername}?start=m_${jump.marketSlug}`;
}

function formatJumpLine(
  jump: GlobalPriceJump,
  botUsername?: string,
): string[] {
  const arrow = jump.direction === "up" ? "📈" : "📉";
  const sign = jump.direction === "up" ? "+" : "-";
  const botUrl = buildBotMarketUrl(jump, botUsername);
  const title = truncate(jump.question, 72);
  const heading = botUrl
    ? `<a href="${botUrl}"><b>${escapeHtml(title)}</b></a>`
    : `<b>${escapeHtml(title)}</b>`;

  return [
    `${arrow} ${heading}`,
    `<b>${sign}${jump.change_pct.toFixed(2)}%</b>  ${formatPrice(jump.price_before)} → ${formatPrice(jump.price_after)}`,
    `┣ ${formatTimestamp(jump.from)}`,
    `┗ Vol: <code>${formatUsd(jump.volume)}</code>  Trades: <code>${jump.trades_count}</code>`,
  ];
}

export function formatGlobalPriceJumps(
  jumps: GlobalPriceJump[],
  page: number,
  pageSize: number,
  botUsername?: string,
): string {
  const subtitle =
    "<i>Top moves across high-volume open markets (30m windows, &gt;10% change)</i>";

  if (jumps.length === 0) {
    return `⚡ <b>Price Jumps</b>\n${subtitle}\n\nNo significant price jumps found right now.`;
  }

  const totalPages = Math.ceil(jumps.length / pageSize);
  const slice = jumps.slice(page * pageSize, (page + 1) * pageSize);
  const lines: string[] = [
    `⚡ <b>Price Jumps</b>  <i>(${page + 1}/${totalPages})</i>`,
    subtitle,
    "",
  ];

  for (let i = 0; i < slice.length; i++) {
    lines.push(...formatJumpLine(slice[i], botUsername));
    if (i < slice.length - 1) lines.push("");
  }

  return lines.join("\n");
}

export function getGlobalJumpMarketUrl(jump: GlobalPriceJump): string | null {
  return buildMarketUrl(jump);
}
