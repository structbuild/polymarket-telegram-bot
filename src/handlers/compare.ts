import type { BotContext } from "../bot.js";
import { replyParams } from "../bot.js";
import { formatMarketCompare, formatTraderCompare } from "../format/compare.js";
import { struct } from "../struct.js";
import { findPolymarketUrl } from "../polymarket-url.js";
import { replyPolymarketFetchError } from "./polymarket-link.errors.js";
import { fetchTraderPnl, fetchTraderProfile } from "./trader.fetch.js";

const EVM_ADDRESS_RE = /\b(0x[0-9a-fA-F]{40})\b/g;

function parseCompareArgs(raw: string): { mode: "market" | "trader"; left: string; right: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const marketMatch = trimmed.match(/^market\s+(\S+)\s+(\S+)$/i);
  if (marketMatch) {
    return { mode: "market", left: marketMatch[1], right: marketMatch[2] };
  }

  const traderMatch = trimmed.match(/^trader\s+(\S+)\s+(\S+)$/i);
  if (traderMatch) {
    return { mode: "trader", left: normalizeAddress(traderMatch[1]), right: normalizeAddress(traderMatch[2]) };
  }

  const urls = [...trimmed.matchAll(/https?:\/\/[^\s]+/g)].map((m) => m[0]);
  if (urls.length >= 2) {
    const left = findPolymarketUrl(urls[0]);
    const right = findPolymarketUrl(urls[1]);
    if (left?.type === "market" && right?.type === "market") {
      return { mode: "market", left: left.slug, right: right.slug };
    }
    if (left?.type === "trader" && right?.type === "trader") {
      return { mode: "trader", left: left.address, right: right.address };
    }
  }

  const addresses = [...trimmed.matchAll(EVM_ADDRESS_RE)].map((m) => normalizeAddress(m[1]));
  if (addresses.length >= 2) {
    return { mode: "trader", left: addresses[0], right: addresses[1] };
  }

  return null;
}

function normalizeAddress(value: string): string {
  const match = value.match(/(0x[0-9a-fA-F]{40})/);
  return (match?.[1] ?? value).toLowerCase();
}

export async function handleCompareCommand(ctx: BotContext) {
  const params = replyParams(ctx);
  const raw = ctx.match?.toString().trim() ?? "";
  const parsed = parseCompareArgs(raw);

  if (!parsed) {
    await ctx.reply(
      [
        "Usage:",
        "<code>/compare market &lt;slug1&gt; &lt;slug2&gt;</code>",
        "<code>/compare trader &lt;0x…&gt; &lt;0x…&gt;</code>",
        "Or paste two Polymarket URLs / wallet addresses.",
      ].join("\n"),
      { parse_mode: "HTML", ...params },
    );
    return;
  }

  try {
    if (parsed.mode === "market") {
      const [leftRes, rightRes] = await Promise.all([
        struct.markets.getMarketBySlug({ marketSlug: parsed.left, include_tags: false }),
        struct.markets.getMarketBySlug({ marketSlug: parsed.right, include_tags: false }),
      ]);
      const left = leftRes.data;
      const right = rightRes.data;
      if (!left || !right) {
        await ctx.reply("❌ One or both markets were not found.", params);
        return;
      }
      await ctx.reply(formatMarketCompare(left, right), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...params,
      });
      return;
    }

    const [leftProfile, leftPnl, rightProfile, rightPnl] = await Promise.all([
      fetchTraderProfile(parsed.left),
      fetchTraderPnl(parsed.left),
      fetchTraderProfile(parsed.right),
      fetchTraderPnl(parsed.right),
    ]);
    if (!leftPnl || !rightPnl) {
      await ctx.reply("❌ Could not load P&amp;L for one or both traders.", {
        parse_mode: "HTML",
        ...params,
      });
      return;
    }
    const leftEntry = {
      ...leftPnl,
      trader: {
        address: parsed.left,
        name: leftProfile?.name ?? leftPnl.trader?.name,
        pseudonym: leftProfile?.pseudonym ?? leftPnl.trader?.pseudonym,
        verified_badge: leftProfile?.verified_badge ?? leftPnl.trader?.verified_badge ?? false,
      },
    };
    const rightEntry = {
      ...rightPnl,
      trader: {
        address: parsed.right,
        name: rightProfile?.name ?? rightPnl.trader?.name,
        pseudonym: rightProfile?.pseudonym ?? rightPnl.trader?.pseudonym,
        verified_badge: rightProfile?.verified_badge ?? rightPnl.trader?.verified_badge ?? false,
      },
    };
    await ctx.reply(formatTraderCompare(leftEntry, rightEntry), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...params,
    });
  } catch (error) {
    await replyPolymarketFetchError(ctx, error);
  }
}
