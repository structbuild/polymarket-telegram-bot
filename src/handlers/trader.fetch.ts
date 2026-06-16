import { struct } from "../struct.js";
import type {
  CategoryEntry,
  GlobalEntry,
  MarketEntry,
  PnlExitMarker,
  PositionEntry,
  Trade,
  UserProfile,
} from "@structbuild/sdk";

export type PositionStatus = "open" | "closed";
export type TopTradesKind = "w" | "l";

export type Paged<T> = { items: T[]; hasMore: boolean };

export async function fetchTraderProfile(
  address: string,
): Promise<UserProfile | null> {
  try {
    const response = await struct.trader.getTraderProfile({ address });
    return response.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchTraderPnl(
  address: string,
): Promise<GlobalEntry | null> {
  try {
    const response = await struct.trader.getTraderPnl({
      address,
      timeframe: "lifetime",
    });
    return response.data ?? null;
  } catch {
    return null;
  }
}

async function fetchPaged<T>(
  loader: (limit: number, offset: number) => Promise<{ data: T[] }>,
  page: number,
  size: number,
): Promise<Paged<T>> {
  try {
    const all = (await loader(size + 1, page * size)).data ?? [];
    return { items: all.slice(0, size), hasMore: all.length > size };
  } catch {
    return { items: [], hasMore: false };
  }
}

export function fetchTraderPositions(
  address: string,
  status: PositionStatus,
  page: number,
  size: number,
): Promise<Paged<PositionEntry>> {
  return fetchPaged(
    (limit, offset) =>
      struct.trader.getTraderOutcomePnl({
        address,
        status,
        sort_by: status === "open" ? "current_value" : "realized_pnl_usd",
        sort_direction: "desc",
        limit,
        offset,
      }),
    page,
    size,
  );
}

export function fetchTraderActivity(
  address: string,
  page: number,
  size: number,
): Promise<Paged<Trade>> {
  return fetchPaged(
    (limit, offset) =>
      struct.trader.getTraderTrades({ address, sort_desc: true, limit, offset }),
    page,
    size,
  );
}

export function fetchTraderCategories(
  address: string,
  page: number,
  size: number,
): Promise<Paged<CategoryEntry>> {
  return fetchPaged(
    (limit, offset) =>
      struct.trader.getTraderCategoryPnl({
        address,
        sort_by: "total_pnl_usd",
        sort_direction: "desc",
        limit,
        offset,
      }),
    page,
    size,
  );
}

export function fetchTraderMarkets(
  address: string,
  page: number,
  size: number,
): Promise<Paged<MarketEntry>> {
  return fetchPaged(
    (limit, offset) =>
      struct.trader.getTraderMarketPnl({
        address,
        sort_by: "total_pnl_usd",
        sort_direction: "desc",
        limit,
        offset,
      }),
    page,
    size,
  );
}

export function fetchTraderTopTrades(
  address: string,
  kind: TopTradesKind,
  page: number,
  size: number,
): Promise<Paged<PnlExitMarker>> {
  return fetchPaged(
    (limit, offset) =>
      struct.trader.getTraderPnlExits({
        address,
        sort_by: "pnl_usd",
        sort_direction: kind === "w" ? "desc" : "asc",
        limit,
        offset,
      }),
    page,
    size,
  );
}
