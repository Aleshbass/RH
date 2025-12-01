"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import PhysioCard from "@/components/marketplace/PhysioCard";
import SearchFilters from "@/components/marketplace/SearchFilters";
import { useMarketplaceStore } from "@/stores/marketplaceStore";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showDesktopFilters, setShowDesktopFilters] = useState(true);

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

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Hero Section */}
      <div className="bg-[#005b57] text-white pt-40 pb-16 md:pt-48 md:pb-20 relative overflow-hidden">
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
          </div>

          {/* Mobile Filters Button */}
          <div className="mt-8 lg:hidden">
            <Sheet open={showMobileFilters} onOpenChange={setShowMobileFilters}>
              <SheetTrigger asChild>
                <Button
                  variant="secondary"
                  className="w-full bg-white/10 text-white hover:bg-white/20 border border-white/20 backdrop-blur-sm h-12 text-base"
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Filters & Sort
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-full sm:w-[400px] overflow-y-auto p-0">
                <SheetHeader className="p-6 border-b border-gray-100 bg-white sticky top-0 z-10">
                  <SheetTitle className="text-xl font-bold text-gray-900">Filters</SheetTitle>
                  <SheetDescription>
                    Refine your search results
                  </SheetDescription>
                </SheetHeader>
                <div className="p-6">
                  <SearchFilters
                    filters={storedFilters}
                    onFiltersChange={setStoredFilters}
                    sortBy={storedSortBy}
                    onSortChange={setStoredSortBy}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Desktop Filters Sidebar */}
          {showDesktopFilters && (
            <div className="hidden lg:block w-72 flex-shrink-0">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-24">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-gray-900">Filters</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="text-xs text-gray-500 hover:text-brand h-auto p-0 hover:bg-transparent"
                  >
                    Reset
                  </Button>
                </div>
                <SearchFilters
                  filters={storedFilters}
                  onFiltersChange={setStoredFilters}
                  sortBy={storedSortBy}
                  onSortChange={setStoredSortBy}
                />
              </div>
            </div>
          )}

          {/* Results */}
          <div className="flex-1 min-w-0">
            <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
              {/* Toggle Filters Button - Desktop */}
              <Button
                onClick={() => setShowDesktopFilters(!showDesktopFilters)}
                variant="outline"
                size="sm"
                className="hidden lg:flex items-center gap-2 border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {showDesktopFilters ? 'Hide Filters' : 'Show Filters'}
              </Button>

              {/* Results Count */}
              <div className="flex-1">
                <p className="text-gray-600">
                  <span className="font-semibold text-gray-900">{displayResults?.total || 0}</span> results found
                  {cachedData && !results && (
                    <span className="text-xs text-gray-400 ml-2">(cached)</span>
                  )}
                </p>
              </div>

              {/* Sort Dropdown */}
              <Select value={storedSortBy} onValueChange={setStoredSortBy}>
                <SelectTrigger className="w-48 border-gray-200 bg-white h-10 rounded-xl">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="verified">Verified First</SelectItem>
                  <SelectItem value="rating">Highest Rated</SelectItem>
                  <SelectItem value="price_low">Price: Low to High</SelectItem>
                  <SelectItem value="price_high">Price: High to Low</SelectItem>
                  <SelectItem value="experience">Most Experienced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-24">
                <Loader2 className="h-10 w-10 animate-spin text-brand mb-4" />
                <p className="text-gray-500 text-sm">Finding the best matches...</p>
              </div>
            )}

            {/* Physiotherapist Cards */}
            {displayResults && hasResults && (
              <div className={`grid gap-6 auto-rows-fr ${showDesktopFilters
                ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                }`}>
                {physios.map((physio: any) => (
                  <PhysioCard key={physio.id} physiotherapist={physio} />
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
                  We couldn't find any physiotherapists matching your criteria. Try adjusting your filters.
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
        </div>
      </div>
    </div>
  );
}
