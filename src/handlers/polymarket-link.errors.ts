import { HttpError } from "@structbuild/sdk";
import { type BotContext, replyParams } from "../bot.js";

export async function replyPolymarketFetchError(
  ctx: BotContext,
  error: unknown,
) {
  const params = replyParams(ctx);
  if (error instanceof HttpError && error.status === 404) {
    await ctx.reply("❌ Could not find that market or event on Polymarket.", params);
    return;
  }

  console.error("Failed to fetch Polymarket data:", error);
  await ctx.reply(
    "⚠️ Something went wrong fetching Polymarket data. Try again later.",
    params,
  );
}
