import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import { replyParams } from "../bot.js";
import {
  CRYPTO_ASSETS,
  CRYPTO_VARIANT_LABELS,
  CRYPTO_VARIANTS,
  cryptoEventSlug,
  cryptoSeriesSlug,
  formatCryptoMarkets,
  normalizeCryptoVariant,
  pickActiveMarket,
  type CryptoAsset,
  type CryptoMarketEntry,
  type CryptoVariant,
} from "../format/crypto.js";
import { struct } from "../struct.js";
import { editPolymarketReply } from "./polymarket-refresh.js";
import { replyPolymarketFetchError } from "./polymarket-link.errors.js";

const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_CACHE_SIZE = 100;

type CachedCrypto = {
  variant: CryptoVariant;
  botUsername?: string;
  expiresAt: number;
};

const cryptoCache = new Map<number, CachedCrypto>();
let nextCacheId = 1;

function pruneCache(): void {
  const now = Date.now();
  for (const [id, entry] of cryptoCache) {
    if (now > entry.expiresAt) cryptoCache.delete(id);
  }
  if (cryptoCache.size >= MAX_CACHE_SIZE) {
    cryptoCache.delete(cryptoCache.keys().next().value!);
  }
}

function cacheCrypto(variant: CryptoVariant, botUsername?: string): number {
  pruneCache();
  const id = nextCacheId++;
  cryptoCache.set(id, {
    variant,
    botUsername,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return id;
}

function getCachedCrypto(id: number): CachedCrypto | undefined {
  const entry = cryptoCache.get(id);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cryptoCache.delete(id);
    return undefined;
  }
  entry.expiresAt = Date.now() + CACHE_TTL_MS;
  return entry;
}

async function fetchAssetSpot(asset: CryptoAsset): Promise<number | null> {
  for (const resolution of ["1S", "1"] as const) {
    try {
      const response = await struct.assets.getAssetCandlestick({
        asset_symbol: asset,
        resolution,
        count_back: 1,
      });
      const bars = response.data ?? [];
      const bar = bars[bars.length - 1];
      const price = bar?.c ?? bar?.o;
      if (price != null && price > 0) return price;
    } catch {}
  }
  return null;
}

async function fetchAssetWindow(asset: CryptoAsset, variant: CryptoVariant) {
  try {
    const response = await struct.assets.getAssetHistory({
      asset_symbol: asset,
      variant,
      limit: 1,
    });
    return response.data?.[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchCryptoEvent(
  asset: CryptoAsset,
  variant: CryptoVariant,
  priceRow: CryptoMarketEntry["priceRow"],
) {
  if (priceRow?.start_time) {
    try {
      const slug = cryptoEventSlug(asset, variant, priceRow.start_time);
      const response = await struct.events.getEventBySlug({
        slug,
        include_tags: false,
        include_markets: true,
        include_metrics: false,
      });
      const data = response.data;
      const event = Array.isArray(data) ? data[0] : data;
      if (event) return event;
    } catch {}
  }

  try {
    const response = await struct.series.getSeriesEvents({
      identifier: cryptoSeriesSlug(asset, variant),
      active: true,
      limit: 1,
      include_metrics: false,
      include_tags: false,
    });
    return response.data?.[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchCryptoEntries(variant: CryptoVariant): Promise<CryptoMarketEntry[]> {
  const results = await Promise.all(
    CRYPTO_ASSETS.map(async (asset) => {
      const [priceRow, spotPrice] = await Promise.all([
        fetchAssetWindow(asset, variant),
        fetchAssetSpot(asset),
      ]);
      const event = await fetchCryptoEvent(asset, variant, priceRow);
      const market = pickActiveMarket(event);
      return { asset, priceRow, spotPrice, event, market };
    }),
  );
  return results;
}

export function buildCryptoKeyboard(cacheId: number, variant: CryptoVariant): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const v of CRYPTO_VARIANTS) {
    const label = CRYPTO_VARIANT_LABELS[v];
    const prefix = v === variant ? "• " : "";
    kb.text(`${prefix}${label}`, `crt:${cacheId}:${v}`);
  }
  kb.row();
  kb.text("🔄 Refresh", `cr:${cacheId}:refresh`).row();
  return kb.text("✕ Close", "close").danger();
}

async function replyWithCrypto(ctx: BotContext, variant: CryptoVariant) {
  const params = replyParams(ctx);
  const loading = await ctx.reply("🪙 Loading crypto up/down markets…", params);

  try {
    const entries = await fetchCryptoEntries(variant);
    const cacheId = cacheCrypto(variant, ctx.me?.username);
    const text = formatCryptoMarkets(entries, variant, ctx.me?.username);
    const keyboard = buildCryptoKeyboard(cacheId, variant);

    await ctx.api.editMessageText(loading.chat.id, loading.message_id, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
    });
  } catch (error) {
    await ctx.api.deleteMessage(loading.chat.id, loading.message_id).catch(() => {});
    await replyPolymarketFetchError(ctx, error);
  }
}

async function refreshCryptoView(ctx: BotContext, cached: CachedCrypto, cacheId: number) {
  const entries = await fetchCryptoEntries(cached.variant);
  const text = formatCryptoMarkets(
    entries,
    cached.variant,
    cached.botUsername ?? ctx.me?.username,
  );
  const keyboard = buildCryptoKeyboard(cacheId, cached.variant);
  await editPolymarketReply(ctx, text, keyboard);
}

export async function handleCryptoCommand(ctx: BotContext) {
  await replyWithCrypto(ctx, "5m");
}

export async function handleCryptoRefresh(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("cr:")) return;

  const parts = data.split(":");
  const cacheId = Number.parseInt(parts[1], 10);
  const action = parts[2];

  if (action !== "refresh") {
    await ctx.answerCallbackQuery();
    return;
  }

  const cached = getCachedCrypto(cacheId);
  if (!cached) {
    await ctx.answerCallbackQuery({ text: "Session expired — run /crypto again." });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Refreshing…" });
  try {
    await refreshCryptoView(ctx, cached, cacheId);
  } catch {
    await ctx.answerCallbackQuery({ text: "Could not refresh crypto markets." });
  }
}

export async function handleCryptoTimeframe(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("crt:")) return;

  const parts = data.split(":");
  const cacheId = Number.parseInt(parts[1], 10);
  const variant = normalizeCryptoVariant(parts[2] ?? "5m");

  const cached = getCachedCrypto(cacheId);
  if (!cached) {
    await ctx.answerCallbackQuery({ text: "Session expired — run /crypto again." });
    return;
  }

  if (cached.variant === variant) {
    await ctx.answerCallbackQuery();
    return;
  }

  cached.variant = variant;

  try {
    await refreshCryptoView(ctx, cached, cacheId);
    await ctx.answerCallbackQuery();
  } catch {
    await ctx.answerCallbackQuery({ text: "Could not load crypto markets." });
  }
}
