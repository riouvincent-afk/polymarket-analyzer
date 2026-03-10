"use client";

import { useState, useMemo } from "react";
import Header from "@/components/Header";
import MarketCard from "@/components/MarketCard";
import MarketFilters from "@/components/MarketFilters";
import StatsBar from "@/components/StatsBar";
import { mockMarkets } from "@/lib/mockData";
import { Market } from "@/lib/types";

export default function Home() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sortBy, setSortBy] = useState("volume24h");

  const filtered = useMemo(() => {
    return mockMarkets
      .filter((m) => {
        const matchSearch = m.question.toLowerCase().includes(search.toLowerCase());
        const matchCategory = category === "All" || m.category === category;
        return matchSearch && matchCategory;
      })
      .sort((a, b) => b[sortBy as keyof Market] as number - (a[sortBy as keyof Market] as number));
  }, [search, category, sortBy]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <StatsBar markets={mockMarkets} />

        <MarketFilters
          search={search}
          category={category}
          sortBy={sortBy}
          onSearch={setSearch}
          onCategory={setCategory}
          onSort={setSortBy}
        />

        {filtered.length === 0 ? (
          <p className="text-center text-gray-500 py-16">No markets found.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
