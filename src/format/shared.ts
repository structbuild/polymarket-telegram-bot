export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatPercent(price: number | null | undefined): string {
  if (price == null) return "—";
  return `${(price * 100).toFixed(0)}%`;
}

export function formatCents(price: number | null | undefined): string {
  if (price == null) return "—";
  return `${(price * 100).toFixed(0)}¢`;
}

export function statusEmoji(status: string | null | undefined): string {
  const normalized = status?.toLowerCase();
  if (normalized === "closed" || normalized === "resolved") return "🔴";
  return "🟢";
}

export function formatShortDate(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatLastUpdatedFooter(): string {
  const d = new Date();
  const pad2 = (n: number) => n.toString().padStart(2, "0");
  const h = pad2(d.getHours());
  const m = pad2(d.getMinutes());
  const s = pad2(d.getSeconds());
  const ms = d.getMilliseconds().toString().padStart(3, "0");
  return `\n\n🕒 Last updated: ${h}:${m}:${s}.${ms}`;
}

export function withLastUpdatedFooter(text: string): string {
  return `${text}${formatLastUpdatedFooter()}`;
}
