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
  { command: "search", description: "Search Polymarket events (alias: /s)" },
  { command: "jumps", description: "Price jumps across top open markets" },
  { command: "leaderboard", description: "Top traders by P&L" },
]);

runner.task()?.then(() => console.log("Bot stopped"));
console.log("Bot is running");

process.once("SIGINT", () => runner.stop());
process.once("SIGTERM", () => runner.stop());
