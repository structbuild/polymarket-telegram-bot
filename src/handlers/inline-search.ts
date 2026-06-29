import { InlineKeyboard } from "grammy";
import type { InlineQueryResultArticle } from "grammy/types";
import type { BotContext } from "../bot.js";
import { escapeHtml, formatUsd, truncate } from "../format/shared.js";
import { struct } from "../struct.js";

const INLINE_LIMIT = 5;

function buildEventDeepLink(slug: string, botUsername?: string): string | null {
  if (!botUsername) return null;
  return `https://t.me/${botUsername}?start=e_${encodeURIComponent(slug)}`;
}

function buildMarketDeepLink(slug: string, botUsername?: string): string | null {
  if (!botUsername) return null;
  return `https://t.me/${botUsername}?start=m_${slug}`;
}

function buildTraderDeepLink(address: string, botUsername?: string): string | null {
  if (!botUsername) return null;
  const hex = address.replace(/^0x/, "").toLowerCase();
  return `https://t.me/${botUsername}?start=${hex}`;
}

function getEventVolume(event: {
  metrics?: Record<string, { volume?: number } | undefined> | null;
}): number | undefined {
  return (
    event.metrics?.["30d"]?.volume ??
    event.metrics?.["7d"]?.volume ??
    event.metrics?.["24h"]?.volume
  );
}

function getMarketVolume(market: {
  metrics?: Record<string, { volume?: number } | undefined> | null;
  volume_usd?: number | null;
}): number | undefined {
  return (
    market.metrics?.["30d"]?.volume ??
    market.metrics?.["7d"]?.volume ??
    market.metrics?.["24h"]?.volume ??
    market.volume_usd ??
    undefined
  );
}

function formatEventDescription(event: {
  market_count?: number;
  metrics?: Record<string, { volume?: number } | undefined> | null;
}): string {
  const parts: string[] = ["Event"];
  if (event.market_count) {
    parts.push(`${event.market_count} market${event.market_count === 1 ? "" : "s"}`);
  }
  const volume = getEventVolume(event);
  if (volume != null && volume > 0) parts.push(`${formatUsd(volume)} vol`);
  return parts.join(" · ");
}

function formatMarketDescription(market: {
  metrics?: Record<string, { volume?: number } | undefined> | null;
  volume_usd?: number | null;
  outcomes?: { name: string; price: number | null }[] | null;
}): string {
  const parts: string[] = ["Market"];
  const volume = getMarketVolume(market);
  if (volume != null && volume > 0) parts.push(`${formatUsd(volume)} vol`);

  const topOutcome = market.outcomes?.find((o) => o.price != null);
  if (topOutcome?.price != null) {
    parts.push(`${topOutcome.name} ${(topOutcome.price * 100).toFixed(0)}%`);
  }

  return parts.join(" · ");
}

function buildInlineMessage(title: string, subtitle: string, deepLink: string | null): string {
  const lines = [`🔎 <b>${escapeHtml(title)}</b>`, `<i>${escapeHtml(subtitle)}</i>`];
  if (deepLink) {
    lines.push("");
    lines.push(`👉 <a href="${deepLink}">Open in Polymarket Scanner Bot</a>`);
  }
  return lines.join("\n");
}

function buildInlineKeyboard(deepLink: string | null): InlineKeyboard | undefined {
  if (!deepLink) return undefined;
  return new InlineKeyboard().url("📊 Open in bot", deepLink);
}

export async function handleInlineSearch(ctx: BotContext) {
  const inlineQuery = ctx.inlineQuery;
  if (!inlineQuery) return;

  const query = inlineQuery.query.trim();
  const botUsername = ctx.me.username;

  if (query.length < 2) {
    await ctx.answerInlineQuery([], {
      cache_time: 5,
      button: botUsername
        ? {
            text: "Open bot to search",
            start_parameter: "search_help",
          }
        : undefined,
    });
    return;
  }

  try {
    const response = await struct.search.search({
      q: query,
      type: "events,markets,traders",
      limit: INLINE_LIMIT,
      sort_by: "volume",
    });

    const results: InlineQueryResultArticle[] = [];

    for (const event of response.data.events ?? []) {
      const slug = event.event_slug;
      if (!slug) continue;

      const title = truncate(event.title ?? "Untitled Event", 64);
      const deepLink = buildEventDeepLink(slug, botUsername);
      results.push({
        type: "article",
        id: `event:${slug}`,
        title,
        description: formatEventDescription(event),
        input_message_content: {
          message_text: buildInlineMessage(title, formatEventDescription(event), deepLink),
          parse_mode: "HTML",
        },
        reply_markup: buildInlineKeyboard(deepLink),
        thumbnail_url: event.image_url ?? undefined,
      });
    }

    for (const market of response.data.markets ?? []) {
      const slug = market.market_slug;
      if (!slug) continue;

      const title = truncate(market.question ?? market.title ?? "Untitled Market", 64);
      const deepLink = buildMarketDeepLink(slug, botUsername);
      results.push({
        type: "article",
        id: `market:${slug}`,
        title,
        description: formatMarketDescription(market),
        input_message_content: {
          message_text: buildInlineMessage(title, formatMarketDescription(market), deepLink),
          parse_mode: "HTML",
        },
        reply_markup: buildInlineKeyboard(deepLink),
        thumbnail_url: market.image_url ?? undefined,
      });
    }

    for (const trader of response.data.traders ?? []) {
      const address = trader.address;
      if (!address) continue;

      const name = trader.name ?? trader.pseudonym ?? `${address.slice(0, 6)}...${address.slice(-4)}`;
      const title = truncate(name, 64);
      const deepLink = buildTraderDeepLink(address, botUsername);
      results.push({
        type: "article",
        id: `trader:${address.toLowerCase()}`,
        title,
        description: "Trader profile",
        input_message_content: {
          message_text: buildInlineMessage(title, "Trader profile", deepLink),
          parse_mode: "HTML",
        },
        reply_markup: buildInlineKeyboard(deepLink),
        thumbnail_url: trader.profile_image ?? undefined,
      });
    }

    await ctx.answerInlineQuery(results.slice(0, 50), {
      cache_time: 30,
      is_personal: true,
    });
  } catch (error) {
    console.error("Inline search failed:", error);
    await ctx.answerInlineQuery([], { cache_time: 5 });
  }
}
