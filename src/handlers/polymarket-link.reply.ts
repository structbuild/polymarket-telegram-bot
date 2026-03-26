import type { InlineKeyboard } from "grammy";
import { type BotContext, replyParams } from "../bot.js";

export async function replyWithOptionalPhoto(
  ctx: BotContext,
  caption: string,
  imageUrl?: string | null,
  replyMarkup?: InlineKeyboard,
) {
  const params = replyParams(ctx);
  if (imageUrl) {
    try {
      await ctx.replyWithPhoto(imageUrl, {
        caption,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
        ...params,
      });
      return;
    } catch {
    }
  }

  await ctx.reply(caption, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: replyMarkup,
    ...params,
  });
}

export async function replyMissingEvent(ctx: BotContext) {
  await ctx.reply("❌ Event not found.", replyParams(ctx));
}

export async function replyMissingMarket(ctx: BotContext) {
  await ctx.reply("❌ Market not found.", replyParams(ctx));
}
