export interface Market {
  id: string;
  question: string;
  category: string;
  yesPrice: number; // 0-1
  noPrice: number;  // 0-1
  volume24h: number;
  volumeTotal: number;
  liquidity: number;
  endDate: string;
  active: boolean;
}
