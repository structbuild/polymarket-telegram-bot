import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import { formatOrderBook } from "../format/order-book.js";
import { struct } from "../struct.js";
import { getCachedMarketInfo } from "./top-holders.js";
import { editPolymarketReply } from "./polymarket-refresh.js";

function buildMarketUrl(marketSlug: string, eventSlug?: string): string | undefined {
  if (!eventSlug) return undefined;
  return `https://polymarket.com/event/${eventSlug}/${marketSlug}`;
}

export async function handleOrderBook(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("ob:")) return;

  const marketCacheId = Number.parseInt(data.split(":")[1], 10);
  const info = getCachedMarketInfo(marketCacheId);
  if (!info) {
    await ctx.answerCallbackQuery({ text: "Session expired. Send the link again." });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Loading order book…" });

  try {
    const [bookRes, spreadRes] = await Promise.all([
      struct.orderBook.getMarketOrderBook({ market_slug: info.slug }),
      struct.orderBook.getSpreadHistory({ market_slug: info.slug, limit: 5 }),
    ]);

    const rawBooks = bookRes.data;
    const books = Array.isArray(rawBooks) ? rawBooks : rawBooks ? [rawBooks] : [];
    const outcomes = info.snapshot?.outcomes ?? [];
    const enriched = books.map((book, i) => ({
      ...book,
      outcome:
        outcomes[i]?.name ??
        outcomes.find((o) => (o as { position_id?: string | null }).position_id === book.position_id)?.name,
    }));

    const spreadRows = Array.isArray(spreadRes.data) ? spreadRes.data : spreadRes.data ? [spreadRes.data] : [];
    const text = formatOrderBook(
      enriched,
      spreadRows,
      info.question,
      buildMarketUrl(info.slug, info.eventSlug),
    );
    const kb = new InlineKeyboard()
      .text("⬅️ Back", `mb:${marketCacheId}`)
      .text("✕ Close", "close")
      .danger();
    await editPolymarketReply(ctx, text, kb);
  } catch {
    await ctx.reply("❌ Could not fetch order book for this market.");
  }
}
