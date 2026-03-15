"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import MarketCard from "@/components/MarketCard";
import MarketFilters from "@/components/MarketFilters";
import StatsBar from "@/components/StatsBar";
import TopBets from "@/components/TopBets";
import { fetchMarkets } from "@/lib/api";
import { opportunityScore } from "@/lib/score";
import { Market } from "@/lib/types";

const PAGE_SIZE = 20;
const OPPORTUNITY_FETCH = 100; // fetch more to rank client-side

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sortBy, setSortBy] = useState("opportunity");

  const isOpportunitySort = sortBy === "opportunity";

  // Initial load / sort change → reset
  useEffect(() => {
    setLoading(true);
    setError(null);
    setOffset(0);
    const limit = isOpportunitySort ? OPPORTUNITY_FETCH : PAGE_SIZE;
    fetchMarkets({ limit, offset: 0, order: isOpportunitySort ? "volume24h" : sortBy, closed: false })
      .then((data) => {
        const sorted = isOpportunitySort
          ? [...data.markets].sort((a, b) => opportunityScore(b) - opportunityScore(a))
          : data.markets;
        setMarkets(sorted);
        setTotal(data.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    const nextOffset = offset + PAGE_SIZE;
    setLoadingMore(true);
    fetchMarkets({ limit: PAGE_SIZE, offset: nextOffset, order: sortBy, closed: false })
      .then((data) => {
        setMarkets((prev) => [...prev, ...data.markets]);
        setOffset(nextOffset);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingMore(false));
  }, [offset, sortBy]);

  const filtered = useMemo(() => {
    return markets.filter((m) => {
      const matchSearch = m.question.toLowerCase().includes(search.toLowerCase());
      const matchCategory =
        category === "All" ||
        m.tags.some((t) => t.toLowerCase() === category.toLowerCase()) ||
        m.category?.toLowerCase() === category.toLowerCase();
      return matchSearch && matchCategory;
    });
  }, [markets, search, category]);

  const categories = useMemo(() => {
    const tags = new Set<string>();
    markets.forEach((m) => m.tags.forEach((t) => tags.add(t)));
    return ["All", ...Array.from(tags).slice(0, 6)];
  }, [markets]);

  const hasMore = !isOpportunitySort && markets.length < total;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <StatsBar markets={filtered} total={total} />

        {!loading && !error && markets.length > 0 && (
          <TopBets markets={markets} />
        )}

        <MarketFilters
          search={search}
          category={category}
          sortBy={sortBy}
          categories={categories}
          onSearch={setSearch}
          onCategory={setCategory}
          onSort={setSortBy}
        />

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 h-52 animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="text-center py-16">
            <p className="text-red-400 font-medium">Failed to load markets</p>
            <p className="text-gray-500 text-sm mt-1">{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="text-center text-gray-500 py-16">No markets found.</p>
        )}

        {!loading && !error && filtered.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((market, i) => (
                <MarketCard key={market.id} market={market} index={i} />
              ))}
            </div>

            {loadingMore && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 h-52 animate-pulse" />
                ))}
              </div>
            )}

            {hasMore && !loadingMore && (
              <div className="flex flex-col items-center gap-2 pt-4">
                <button
                  onClick={loadMore}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-medium rounded-lg transition-colors"
                >
                  Load more
                </button>
                <p className="text-xs text-gray-500">
                  {markets.length} / {total} markets loaded
                </p>
              </div>
            )}

            {!hasMore && markets.length > PAGE_SIZE && (
              <p className="text-center text-xs text-gray-600 pt-4">
                All {total} markets loaded
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
