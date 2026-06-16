import { getBotUsername } from "../bot-identity.js";

type MarketIds = {
  marketSlug?: string | null;
  conditionId?: string | null;
  eventSlug?: string | null;
};

export function marketStartPayload(ids: MarketIds): string | null {
  if (ids.marketSlug) return `m_${ids.marketSlug}`;
  if (ids.conditionId) {
    const hex = ids.conditionId.replace(/^0x/, "").toLowerCase();
    if (hex) return hex;
  }
  if (ids.eventSlug) return `e_${encodeURIComponent(ids.eventSlug)}`;
  return null;
}

export function traderStartPayload(address: string | null | undefined): string | null {
  if (!address) return null;
  const hex = address.replace(/^0x/, "").toLowerCase();
  return /^[0-9a-f]{40}$/.test(hex) ? hex : null;
}

export function deepLink(payload: string | null): string | null {
  const username = getBotUsername();
  if (!username || !payload || payload.length > 64) return null;
  return `https://t.me/${username}?start=${payload}`;
}

export function linkify(label: string, url: string | null): string {
  return url ? `<a href="${url}">${label}</a>` : label;
}
