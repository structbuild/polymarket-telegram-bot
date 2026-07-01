import { getBotUsername } from "../bot-identity.js";

export const TELEGRAM_START_PAYLOAD_MAX = 64;

export type MarketIds = {
  marketSlug?: string | null;
  conditionId?: string | null;
  eventSlug?: string | null;
  eventId?: string | null;
};

type CachedStart =
  | { kind: "event"; slug: string }
  | { kind: "market"; slug: string };

const startPayloadCache = new Map<number, CachedStart>();
let nextStartCacheId = 1;
const MAX_START_CACHE = 10_000;

const CONDITION_ID_RE = /^[0-9a-f]{64}$/;
const ADDRESS_RE = /^[0-9a-f]{40}$/;

function allocCachedStart(entry: CachedStart): string {
  if (startPayloadCache.size >= MAX_START_CACHE) {
    startPayloadCache.delete(startPayloadCache.keys().next().value!);
  }
  const id = nextStartCacheId++;
  startPayloadCache.set(id, entry);
  return entry.kind === "event" ? `ce${id}` : `cm${id}`;
}

export function lookupCachedStart(payload: string): CachedStart | null {
  if (payload.startsWith("ce")) {
    const id = Number.parseInt(payload.slice(2), 10);
    if (!Number.isFinite(id)) return null;
    const entry = startPayloadCache.get(id);
    return entry?.kind === "event" ? entry : null;
  }
  if (payload.startsWith("cm")) {
    const id = Number.parseInt(payload.slice(2), 10);
    if (!Number.isFinite(id)) return null;
    const entry = startPayloadCache.get(id);
    return entry?.kind === "market" ? entry : null;
  }
  return null;
}

export type StartTarget =
  | { kind: "trader"; address: string }
  | { kind: "market"; slug?: string; conditionId?: string }
  | { kind: "event"; slug?: string; id?: string };

export function parseStartPayload(payload: string): StartTarget | null {
  if (ADDRESS_RE.test(payload)) {
    return { kind: "trader", address: `0x${payload}` };
  }
  if (CONDITION_ID_RE.test(payload)) {
    return { kind: "market", conditionId: `0x${payload}` };
  }

  const cached = lookupCachedStart(payload);
  if (cached?.kind === "event") return { kind: "event", slug: cached.slug };
  if (cached?.kind === "market") return { kind: "market", slug: cached.slug };

  if (payload.startsWith("i_") && payload.length > 2) {
    return { kind: "event", id: payload.slice(2) };
  }
  if (payload.startsWith("e_") && payload.length > 2) {
    return { kind: "event", slug: payload.slice(2) };
  }
  if (payload.startsWith("m_") && payload.length > 2) {
    return { kind: "market", slug: payload.slice(2) };
  }

  return null;
}

export function eventStartPayload(input: {
  eventSlug?: string | null;
  eventId?: string | null;
}): string | null {
  const slug = input.eventSlug?.trim() || null;
  const eventId = input.eventId?.trim() || null;

  if (eventId) {
    const byId = `i_${eventId}`;
    if (byId.length <= TELEGRAM_START_PAYLOAD_MAX) return byId;
  }

  if (slug) {
    const bySlug = `e_${slug}`;
    if (bySlug.length <= TELEGRAM_START_PAYLOAD_MAX) return bySlug;
  }

  if (slug) return allocCachedStart({ kind: "event", slug });
  if (eventId) return allocCachedStart({ kind: "event", slug: eventId });

  return null;
}

export function marketStartPayload(ids: MarketIds): string | null {
  const slug = ids.marketSlug?.trim() || null;

  if (slug) {
    const bySlug = `m_${slug}`;
    if (bySlug.length <= TELEGRAM_START_PAYLOAD_MAX) return bySlug;
  }

  if (ids.conditionId) {
    const hex = ids.conditionId.replace(/^0x/, "").toLowerCase();
    if (CONDITION_ID_RE.test(hex)) return hex;
  }

  if (slug) return allocCachedStart({ kind: "market", slug });

  return eventStartPayload({ eventSlug: ids.eventSlug, eventId: ids.eventId });
}

export function traderStartPayload(address: string | null | undefined): string | null {
  if (!address) return null;
  const hex = address.replace(/^0x/, "").toLowerCase();
  return ADDRESS_RE.test(hex) ? hex : null;
}

export function deepLink(payload: string | null): string | null {
  const username = getBotUsername();
  if (!username || !payload || payload.length > TELEGRAM_START_PAYLOAD_MAX) return null;
  return `https://t.me/${username}?start=${payload}`;
}

export function eventDeepLink(input: {
  eventSlug?: string | null;
  eventId?: string | null;
}): string | null {
  return deepLink(eventStartPayload(input));
}

export function marketDeepLink(ids: MarketIds): string | null {
  return deepLink(marketStartPayload(ids));
}

export function linkify(label: string, url: string | null): string {
  return url ? `<a href="${url}">${label}</a>` : label;
}
