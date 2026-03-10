import { MarketsResponse, Market } from "./types";

const API = "/api";

export async function fetchMarkets(params: {
  limit?: number;
  offset?: number;
  order?: string;
  ascending?: boolean;
  active?: boolean;
}): Promise<MarketsResponse> {
  const q = new URLSearchParams({
    limit: String(params.limit ?? 50),
    offset: String(params.offset ?? 0),
    order: params.order ?? "volume24h",
    ascending: String(params.ascending ?? false),
    active: String(params.active ?? true),
  });

  const res = await fetch(`${API}/markets/?${q}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchMarket(id: string): Promise<Market> {
  const res = await fetch(`${API}/markets/${id}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
