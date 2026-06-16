import type { BotContext } from "../bot.js";
import { replyParams } from "../bot.js";
import { formatEventSearchResults, type SearchEvent } from "../format/search.js";
import { escapeHtml } from "../format/shared.js";
import { struct } from "../struct.js";
import { replyPolymarketFetchError } from "./polymarket-link.errors.js";
import { replyWithEvent } from "./polymarket-link.service.js";

const SEARCH_LIMIT = 6;

function normalizeSearchValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findExactEventMatch(query: string, events: SearchEvent[]): SearchEvent | null {
  const normalizedQuery = normalizeSearchValue(query);

  for (const event of events) {
    if (normalizeSearchValue(event.title) === normalizedQuery) {
      return event;
    }

    const slugMatch = normalizeSearchValue(event.event_slug?.replace(/-/g, " "));
    if (slugMatch === normalizedQuery) {
      return event;
    }
  }

  return null;
}

function getSearchQuery(ctx: BotContext): string {
  return ctx.match?.toString().trim() ?? "";
}

export async function handleSearch(ctx: BotContext) {
  const query = getSearchQuery(ctx);
  const params = replyParams(ctx);

  if (query.length < 2) {
    await ctx.reply(
      "Usage: <code>/search &lt;event name&gt;</code>\nAlias: <code>/s &lt;event name&gt;</code>",
      {
        parse_mode: "HTML",
        ...params,
      },
    );
    return;
  }

  try {
    const response = await struct.search.search({
      q: query,
      limit: SEARCH_LIMIT,
      sort_by: "volume",
    });

    const events = response.data.events ?? [];
    const exactMatch = findExactEventMatch(query, events);
    const selectedEvent = exactMatch ?? (events.length === 1 ? events[0] : null);
    const selectedSlug = selectedEvent?.event_slug ?? null;

    if (selectedSlug) {
      await replyWithEvent(ctx, selectedSlug);
      return;
    }

    if (events.length === 0) {
      await ctx.reply(`❌ No events found for <code>${escapeHtml(query)}</code>.`, {
        parse_mode: "HTML",
        ...params,
      });
      return;
    }

    await ctx.reply(
      formatEventSearchResults(
        query,
        events,
        ctx.me?.username,
        response.data.events_pagination?.has_more ?? false,
      ),
      {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...params,
      },
    );
  } catch (error) {
    await replyPolymarketFetchError(ctx, error);
  }
}
