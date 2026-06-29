import { escapeHtml, formatShortDate, formatUsd, truncate } from "./shared.js";

type ChartOutcome = {
  outcome?: string | null;
  question?: string | null;
  market_slug?: string | null;
  data?: { t?: number; v?: number }[];
};

export function formatEventChartSummary(
  eventTitle: string,
  charts: ChartOutcome[],
  resolution: string,
): string {
  const lines = [
    `📈 <b>Event Volume Chart</b> · ${resolution}`,
    `<i>${escapeHtml(truncate(eventTitle, 80))}</i>`,
    "",
  ];
  if (charts.length === 0) {
    lines.push("No chart data available.");
    return lines.join("\n");
  }
  for (const chart of charts.slice(0, 4)) {
    const label = escapeHtml(truncate(chart.question ?? chart.outcome ?? "Market", 64));
    const points = chart.data ?? [];
    const latest = points.length ? points[points.length - 1] : null;
    const first = points.length ? points[0] : null;
    lines.push(`<b>${label}</b>`);
    if (latest?.v != null) {
      lines.push(`Latest vol: <code>${formatUsd(latest.v)}</code>`);
    }
    if (first?.v != null && latest?.v != null && points.length > 1) {
      const delta = latest.v - first.v;
      const sign = delta >= 0 ? "+" : "-";
      lines.push(`Change: <code>${sign}${formatUsd(Math.abs(delta))}</code> over ${resolution}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function formatEventOutcomes(
  eventTitle: string,
  outcomes: Record<string, string>,
  page: number,
  pageSize: number,
): string {
  const entries = Object.entries(outcomes);
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const slice = entries.slice(page * pageSize, (page + 1) * pageSize);
  const pageLabel = totalPages > 1 ? ` <i>(${page + 1}/${totalPages})</i>` : "";
  const lines = [
    `✅ <b>Resolved Outcomes</b>${pageLabel}`,
    `<i>${escapeHtml(truncate(eventTitle, 80))}</i>`,
    "",
  ];
  if (slice.length === 0) {
    lines.push("No resolved outcomes found.");
    return lines.join("\n");
  }
  slice.forEach(([slug, winner], i) => {
    lines.push(`${page * pageSize + i + 1}. <code>${escapeHtml(slug)}</code>`);
    lines.push(`   🏆 ${escapeHtml(winner)}`);
    if (i < slice.length - 1) lines.push("");
  });
  return lines.join("\n");
}
