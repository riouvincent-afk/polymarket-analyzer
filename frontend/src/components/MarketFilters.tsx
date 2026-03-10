"use client";

import { CATEGORIES } from "@/lib/mockData";

interface Props {
  search: string;
  category: string;
  sortBy: string;
  onSearch: (v: string) => void;
  onCategory: (v: string) => void;
  onSort: (v: string) => void;
}

export default function MarketFilters({ search, category, sortBy, onSearch, onCategory, onSort }: Props) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Search */}
      <input
        type="text"
        placeholder="Search markets..."
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
      />

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => onCategory(cat)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              category === cat
                ? "bg-emerald-500 text-white"
                : "bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Sort */}
      <select
        value={sortBy}
        onChange={(e) => onSort(e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
      >
        <option value="volume24h">Sort: Vol 24h</option>
        <option value="volumeTotal">Sort: Total Vol</option>
        <option value="liquidity">Sort: Liquidity</option>
        <option value="yesPrice">Sort: YES %</option>
      </select>
    </div>
  );
}
