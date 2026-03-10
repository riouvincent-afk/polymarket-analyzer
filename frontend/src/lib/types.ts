export interface Market {
  id: string;
  question: string;
  slug: string | null;
  category: string | null;
  yes_price: number;
  no_price: number;
  volume: number;
  volume24h: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  end_date: string | null;
  image: string | null;
  tags: string[];
}

export interface MarketsResponse {
  markets: Market[];
  total: number;
  limit: number;
  offset: number;
}

export type SortField = "volume24h" | "volume" | "liquidity" | "endDate";
