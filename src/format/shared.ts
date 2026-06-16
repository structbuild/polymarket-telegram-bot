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

export function formatPnlValue(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatUsd(Math.abs(value))}`;
}

export function formatSignedUsd(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "-";
  const amount = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$${amount}`;
}

export function formatPctSuffix(pct: number | null | undefined): string {
  if (pct == null) return "";
  const sign = pct >= 0 ? "+" : "";
  return ` (${sign}${pct.toFixed(1)}%)`;
}

export function formatRelativeTime(timestampSeconds: number | null | undefined): string {
  if (timestampSeconds == null) return "—";
  const diffSeconds = Math.floor(Date.now() / 1000 - timestampSeconds);
  if (diffSeconds < 60) return "just now";
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatShortDate(timestampSeconds);
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
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
