export type Outcome = { name: string; price?: number | null };
export type Metrics = { volume?: number; unique_traders?: number };
export type MetricsWindow = Record<string, Metrics | undefined>;

export type MarketRecord = {
  question?: string;
  title?: string;
  status?: string | null;
  outcomes?: Outcome[];
  market_slug?: string;
  slug?: string;
  event_slug?: string;
  end_time?: number;
  metrics?: MetricsWindow;
  volume?: number | null;
  volume_24hr?: number | null;
  liquidity_usd?: number | null;
  total_holders?: number | null;
  winning_outcome?: string | null;
} & Record<string, unknown>;

export type EventRecord = {
  title?: string;
  status?: string | null;
  end_time?: number;
  metrics?: MetricsWindow;
  markets?: MarketRecord[];
  event_slug?: string;
} & Record<string, unknown>;
