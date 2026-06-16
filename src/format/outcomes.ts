import type { MarketRecord, Outcome } from "./types.js";

function findYesOutcome(outcomes: Outcome[]): Outcome | undefined {
  return outcomes.find((outcome) => outcome.name.toLowerCase() === "yes");
}

export function getMarketProbability(
  market: Pick<MarketRecord, "outcomes">,
): number | null {
  const outcomes = market.outcomes ?? [];
  return findYesOutcome(outcomes)?.price ?? outcomes[0]?.price ?? null;
}

export function getWinningOutcomeName(
  market: Pick<MarketRecord, "outcomes" | "winning_outcome">,
): string | null {
  const winning = market.winning_outcome;
  if (typeof winning === "string") {
    return winning || null;
  }
  if (winning && typeof winning === "object" && typeof winning.name === "string") {
    return winning.name || null;
  }
  const outcomes = market.outcomes ?? [];
  if (outcomes.length === 0) return null;
  const winner = outcomes.reduce((best, o) =>
    (o.price ?? 0) > (best.price ?? 0) ? o : best,
  );
  if ((winner.price ?? 0) <= 0) return null;
  return winner.name;
}
