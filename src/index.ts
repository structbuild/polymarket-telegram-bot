import "./env.js";
import { bot } from "./bot.js";
import { run, sequentialize } from "@grammyjs/runner";
import type { BotContext } from "./bot.js";
import { setBotUsername } from "./bot-identity.js";

function getSessionKey(ctx: BotContext) {
  return ctx.chat?.id.toString();
}

bot.use(sequentialize(getSessionKey));

await bot.init();
setBotUsername(bot.botInfo.username);

const runner = run(bot, {
  runner: {
    fetch: {
      allowed_updates: ["message", "callback_query", "inline_query"],
    },
  },
});

bot.api.setMyCommands([
  { command: "start", description: "Welcome message and how to use the bot" },
  { command: "search", description: "Search events and markets (alias: /s)" },
  { command: "jumps", description: "Price jumps across top open markets" },
  { command: "leaderboard", description: "Top traders by P&L" },
  { command: "trending", description: "Top open markets by volume" },
  { command: "tags", description: "Browse markets by tag" },
  { command: "bonds", description: "Near-resolution bond markets" },
  { command: "series", description: "Recurring market series" },
  { command: "compare", description: "Compare two markets or traders" },
  { command: "crypto", description: "Crypto up/down markets by window (5m–1d)" },
]);

runner.task()?.then(() => console.log("Bot stopped"));
console.log("Bot is running");

process.once("SIGINT", () => runner.stop());
process.once("SIGTERM", () => runner.stop());
