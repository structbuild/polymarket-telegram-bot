import { struct } from "../struct.js";
import type { TraderPnlSummary, UserProfile } from "@structbuild/sdk";

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
): Promise<TraderPnlSummary | null> {
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
