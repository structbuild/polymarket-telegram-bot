import type { MarketRecord } from "../format/types.js";
import { struct } from "../struct.js";

function isCryptoMarket(market: MarketRecord): boolean {
  const haystack = [
    market.question,
    market.title,
    market.category,
    ...(Array.isArray(market.tags) ? market.tags : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    haystack.includes("bitcoin") ||
    haystack.includes("btc") ||
    haystack.includes("ethereum") ||
    haystack.includes("eth")
  );
}

export async function fetchCryptoContextLine(market: MarketRecord): Promise<string | null> {
  if (!isCryptoMarket(market)) return null;

  const asset = (market.question ?? market.title ?? "").toLowerCase().includes("eth") ? "ETH" : "BTC";
  try {
    const response = await struct.assets.getAssetHistory({
      asset_symbol: asset,
      variant: "1d",
      limit: 1,
    });
    const latest = response.data?.[0];
    if (!latest) return null;
    const price = latest.asset_close_price;
    const pct = latest.price_change_percentage;
    const sign = pct != null && pct >= 0 ? "+" : "";
    const pctLabel = pct != null ? ` (${sign}${pct.toFixed(1)}% 24h)` : "";
    return `${asset === "ETH" ? "Ξ" : "₿"} ${asset}: <code>$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}</code>${pctLabel}`;
  } catch {
    return null;
  }
}
