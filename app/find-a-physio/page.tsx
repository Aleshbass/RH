"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, Search, SlidersHorizontal, Map, List, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import PhysioCard from "@/components/marketplace/PhysioCard";
import { DynamicPhysioMapView } from "@/components/marketplace/DynamicPhysioMapView";
import { useMarketplaceStore } from "@/stores/marketplaceStore";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ViewMode = "list" | "map" | "split";

export default function FindAPhysioPage() {
  // Use marketplace store for persistent state
  const {
    searchQuery: storedQuery,
    filters: storedFilters,
    sortBy: storedSortBy,
    setSearchQuery: setStoredQuery,
    setFilters: setStoredFilters,
    setSortBy: setStoredSortBy,
    clearFilters: clearStoredFilters,
    getCachedResults,
    setCachedResults,
  } = useMarketplaceStore();

  // Local state for UI
  const [localSearchQuery, setLocalSearchQuery] = useState(storedQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(storedQuery);

  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [hoveredPhysioId, setHoveredPhysioId] = useState<string | null>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(localSearchQuery);
      setStoredQuery(localSearchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [localSearchQuery, setStoredQuery]);

  // Generate cache key
  const cacheKey = useMemo(() => {
    return JSON.stringify({
      query: debouncedQuery,
      filters: storedFilters,
      sortBy: storedSortBy,
    });
  }, [debouncedQuery, storedFilters, storedSortBy]);

  // Search physiotherapists with caching
  const results = useQuery(
    api.marketplace.search.searchPhysiotherapists,
    {
      searchQuery: debouncedQuery || undefined,
      ...storedFilters,
      sortBy: storedSortBy,
    }
  );

  // Update cache when results change
  useEffect(() => {
    if (results) {
      setCachedResults(cacheKey, results);
    }
  }, [results, cacheKey, setCachedResults]);

  // Use cached results if available while loading
  const cachedData = getCachedResults(cacheKey);
  const displayResults = results || cachedData;
  const physios = displayResults?.results || [];
  const hasResults = physios.length > 0;
  const isLoading = results === undefined && !cachedData;

  const clearFilters = useCallback(() => {
    clearStoredFilters();
    setLocalSearchQuery("");
    setDebouncedQuery("");
  }, [clearStoredFilters]);

  // Show map on larger screens, list on mobile by default
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setViewMode("list");
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Hero Section */}
      <div className="bg-[#005b57] text-white pt-24 pb-12 md:pt-32 md:pb-16 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute right-0 top-0 w-96 h-96 bg-white rounded-full blur-3xl -mr-20 -mt-20" />
          <div className="absolute left-0 bottom-0 w-64 h-64 bg-teal-400 rounded-full blur-3xl -ml-10 -mb-10" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-3xl">
            <h1 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight leading-tight">
              Find your Physiotherapist
            </h1>
            <p className="text-lg md:text-xl text-teal-50/90 mb-8 font-light max-w-2xl">
              Connect with verified professionals for your recovery journey.
            </p>

            {/* Search Bar */}
            <div className="relative max-w-2xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by condition, specialization, or name..."
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
                className="pl-12 h-14 text-base bg-white shadow-lg border-0 rounded-2xl focus:ring-2 focus:ring-teal-300 text-gray-900 placeholder:text-gray-400"
              />
              {localSearchQuery !== debouncedQuery && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-5 w-5 animate-spin text-brand" />
                </div>
              )}
            </div>
            
            <div className="mt-8 flex items-center gap-3 text-sm text-teal-50/90 bg-white/10 w-fit px-4 py-2.5 rounded-full border border-teal-500/30 backdrop-blur-sm">
              <span className="font-medium">Are you a Physiotherapist?</span>
              <div className="w-px h-4 bg-teal-500/50" />
              <Link href="/physiotherapist" className="font-semibold text-white hover:text-teal-200 transition-colors">
                Register your practice →
              </Link>
            </div>
          </div>


        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <div className="flex flex-col lg:flex-row gap-8">


          {/* Results + Map */}
          <div className="flex-1 min-w-0">
            <div className="mb-6 flex items-center justify-between flex-wrap gap-4">


              {/* Results Count */}
              <div className="flex-1">
                <p className="text-gray-600">
                  <span className="font-semibold text-gray-900">{displayResults?.total || 0}</span> results found
                  {cachedData && !results && (
                    <span className="text-xs text-gray-400 ml-2">(cached)</span>
                  )}
                </p>
              </div>

              {/* View Toggle - Desktop */}
              <div className="hidden lg:flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                    viewMode === "list"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                  List
                </button>
                <button
                  onClick={() => setViewMode("split")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                    viewMode === "split"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <div className="flex gap-0.5">
                    <div className="w-1.5 h-3 bg-current rounded-sm" />
                    <div className="w-1.5 h-3 bg-current rounded-sm opacity-50" />
                  </div>
                  Split
                </button>
                <button
                  onClick={() => setViewMode("map")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                    viewMode === "map"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <Map className="h-3.5 w-3.5" />
                  Map
                </button>
              </div>

              {/* Mobile Map Toggle */}
              <button
                onClick={() => setViewMode(viewMode === "map" ? "list" : "map")}
                className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
              >
                {viewMode === "map" ? (
                  <>
                    <List className="h-4 w-4" />
                    Show List
                  </>
                ) : (
                  <>
                    <Map className="h-4 w-4" />
                    Show Map
                  </>
                )}
              </button>

              {/* Sort Dropdown */}
              <Select value={storedSortBy} onValueChange={setStoredSortBy}>
                <SelectTrigger className="w-48 border-gray-200 bg-white h-10 rounded-xl">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="verified">Verified First</SelectItem>
                  <SelectItem value="rating">Highest Rated</SelectItem>
                  <SelectItem value="experience">Most Experienced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Split View Layout */}
            <div
              className={cn(
                "flex gap-6",
                viewMode === "split" && "lg:flex-row",
                viewMode === "list" && "flex-col",
                viewMode === "map" && "flex-col"
              )}
            >
              {/* List Panel */}
              {viewMode !== "map" && (
                <div
                  className={cn(
                    "min-w-0",
                    viewMode === "split" ? "lg:w-1/2 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:pr-2 custom-scrollbar" : "w-full"
                  )}
                >
                  {/* Loading State */}
                  {isLoading && (
                    <div className="flex flex-col items-center justify-center py-24">
                      <Loader2 className="h-10 w-10 animate-spin text-brand mb-4" />
                      <p className="text-gray-500 text-sm">Finding the best matches...</p>
                    </div>
                  )}

                  {/* Physiotherapist Cards */}
                  {displayResults && hasResults && (
                    <div
                      className={cn(
                        "grid gap-6 auto-rows-fr",
                        viewMode === "split"
                          ? "grid-cols-1 xl:grid-cols-2"
                          : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                      )}
                    >
                      {physios.map((physio: any) => (
                        <div
                          key={physio.id}
                          onMouseEnter={() => setHoveredPhysioId(physio.id)}
                          onMouseLeave={() => setHoveredPhysioId(null)}
                        >
                          <PhysioCard physiotherapist={physio} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty State */}
                  {displayResults && !hasResults && (
                    <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-gray-200">
                      <div className="w-16 h-16 mx-auto bg-gray-50 rounded-full flex items-center justify-center mb-4">
                        <Search className="h-8 w-8 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        No matches found
                      </h3>
                      <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                        We couldn&apos;t find any physiotherapists matching your criteria. Try adjusting your filters.
                      </p>
                      <Button
                        onClick={clearFilters}
                        variant="outline"
                        className="border-gray-200"
                      >
                        Clear All Filters
                      </Button>
                    </div>
                  )}

                  {/* Load More */}
                  {displayResults && displayResults.hasMore && (
                    <div className="mt-12 text-center">
                      <Button
                        variant="outline"
                        className="px-8 h-12 rounded-xl border-gray-200 text-gray-900 hover:bg-gray-50 hover:text-gray-900 transition-all font-medium"
                      >
                        Load More Results
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Map Panel */}
              {(viewMode === "map" || viewMode === "split") && (
                <div
                  className={cn(
                    "relative rounded-2xl overflow-hidden border border-gray-200 shadow-sm",
                    viewMode === "split"
                      ? "hidden lg:block lg:w-1/2 lg:sticky lg:top-24 lg:h-[calc(100vh-200px)]"
                      : "w-full h-[60vh] lg:h-[calc(100vh-200px)]"
                  )}
                >
                  <DynamicPhysioMapView
                    physiotherapists={physios}
                    hoveredPhysioId={hoveredPhysioId}
                    onPhysioHover={setHoveredPhysioId}
                    className="w-full h-full"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
