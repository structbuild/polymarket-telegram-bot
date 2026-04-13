import type { MarketTimeframe } from "../format.js";
import { DEFAULT_MARKET_TIMEFRAME } from "../format.js";

const MAX_SIZE = 5000;
const prefsByTelegramUserId = new Map<number, MarketTimeframe>();

export function getPreferredMarketTimeframe(
  telegramUserId: number | undefined,
): MarketTimeframe {
  if (telegramUserId == null) return DEFAULT_MARKET_TIMEFRAME;
  return prefsByTelegramUserId.get(telegramUserId) ?? DEFAULT_MARKET_TIMEFRAME;
}

export function setPreferredMarketTimeframe(
  telegramUserId: number,
  timeframe: MarketTimeframe,
): void {
  if (prefsByTelegramUserId.size >= MAX_SIZE) {
    const first = prefsByTelegramUserId.keys().next().value!;
    prefsByTelegramUserId.delete(first);
  }
  prefsByTelegramUserId.set(telegramUserId, timeframe);
}
