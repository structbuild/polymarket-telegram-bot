const URL_RE = /https?:\/\/[^\s]+/g;
const POLYMARKET_EVENT_RE =
  /^https?:\/\/(?:www\.)?polymarket\.com\/event\/([a-z0-9-]+)$/;
const POLYMARKET_MARKET_RE =
  /^https?:\/\/(?:www\.)?polymarket\.com\/event\/[a-z0-9-]+\/([a-z0-9-]+)$/;
const POLYMARKET_MARKET_PATH_RE =
  /^https?:\/\/(?:www\.)?polymarket\.com\/market\/([a-z0-9-]+)$/;

export type PolymarketUrl =
  | { type: "event"; slug: string }
  | { type: "market"; slug: string }
  | { type: "trader"; address: string };

function stripFragmentAndQuery(url: string): string {
  return url.replace(/[?#].*$/, "").replace(/\/$/, "");
}

function matchPolymarketUrl(raw: string): PolymarketUrl | null {
  const url = stripFragmentAndQuery(raw);

  const marketMatch = url.match(POLYMARKET_MARKET_RE);
  if (marketMatch) return { type: "market", slug: marketMatch[1] };

  const marketPathMatch = url.match(POLYMARKET_MARKET_PATH_RE);
  if (marketPathMatch) return { type: "market", slug: marketPathMatch[1] };

  const eventMatch = url.match(POLYMARKET_EVENT_RE);
  if (eventMatch) return { type: "event", slug: eventMatch[1] };

  return null;
}

function extractUrls(text: string): string[] {
  return text.match(URL_RE) ?? [];
}

export function parsePolymarketUrl(text: string): PolymarketUrl | null {
  return matchPolymarketUrl(text.trim());
}

const EVM_ADDRESS_RE = /\b(0x[0-9a-fA-F]{40})\b/;

export function findPolymarketUrl(text: string): PolymarketUrl | null {
  for (const url of extractUrls(text)) {
    const parsed = matchPolymarketUrl(url);
    if (parsed) return parsed;
  }

  const addressMatch = text.match(EVM_ADDRESS_RE);
  if (addressMatch) return { type: "trader", address: addressMatch[1].toLowerCase() };

  return null;
}
