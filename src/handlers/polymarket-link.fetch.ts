import { struct } from "../struct.js";

type StructEntity = Record<string, any>;

function unwrapStructData(data: StructEntity | StructEntity[]): StructEntity | null {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return data ?? null;
}

export async function fetchEventBySlug(
  slug: string,
): Promise<StructEntity | null> {
  const response = await struct.events.getEventBySlug({ slug, include_tags: false });
  return unwrapStructData(response.data);
}

export async function fetchMarketBySlug(
  slug: string,
): Promise<StructEntity | null> {
  const response = await struct.markets.getMarketBySlug({ slug, include_tags: false });
  return unwrapStructData(response.data);
}

export async function fetchMarketByConditionId(
  conditionId: string,
): Promise<StructEntity | null> {
  const response = await struct.markets.getMarket({ conditionId, include_tags: false });
  return unwrapStructData(response.data);
}
