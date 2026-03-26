import type { BotContext } from "../bot.js";
import { findPolymarketUrl } from "../polymarket-url.js";
import { handleParsedPolymarketLink } from "./polymarket-link.service.js";

export async function handlePolymarketLink(ctx: BotContext) {
  const text = ctx.message?.text;
  if (!text) return;

  const parsed = findPolymarketUrl(text);
  if (!parsed) return;

  await handleParsedPolymarketLink(ctx, parsed);
}
