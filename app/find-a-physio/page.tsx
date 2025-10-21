"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import PhysioCard from "@/components/marketplace/PhysioCard";
import SearchFilters from "@/components/marketplace/SearchFilters";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    specializations: [] as string[],
    location: "",
    minPrice: undefined as number | undefined,
    maxPrice: undefined as number | undefined,
    offersOnline: undefined as boolean | undefined,
    offersInPerson: undefined as boolean | undefined,
    minYearsExperience: undefined as number | undefined,
  });
  const [sortBy, setSortBy] = useState("verified");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showDesktopFilters, setShowDesktopFilters] = useState(true);

  // Search physiotherapists
  const results = useQuery(api.marketplace.search.searchPhysiotherapists, {
    searchQuery: searchQuery || undefined,
    ...filters,
    sortBy,
  });

  const physios = results?.results || [];
  const hasResults = physios.length > 0;

  const clearFilters = () => {
    setFilters({
      specializations: [],
      location: "",
      minPrice: undefined,
      maxPrice: undefined,
      offersOnline: undefined,
      offersInPerson: undefined,
      minYearsExperience: undefined,
    });
    setSearchQuery("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-pink-50/30 to-purple-50/20">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-[#005b57] via-[#00766f] to-pink-600 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Find a Physiotherapist
          </h1>
          <p className="text-xl text-white/90 mb-8">
            Search and book verified physiotherapists near you
          </p>

          {/* Search Bar */}
          <div className="max-w-3xl relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by condition, specialization, or therapist name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-14 text-lg bg-white shadow-xl border-0 focus:ring-4 focus:ring-pink-300"
            />
          </div>

          {/* Mobile Filters Button */}
          <div className="mt-6 lg:hidden">
            <Sheet open={showMobileFilters} onOpenChange={setShowMobileFilters}>
              <SheetTrigger asChild>
                <Button
                  variant="secondary"
                  className="w-full bg-white text-[#005b57] hover:bg-gray-100"
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Filters & Sort
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-full sm:w-96 overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                  <SheetDescription>
                    Refine your search results
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6">
                  <SearchFilters
                    filters={filters}
                    onFiltersChange={setFilters}
                    sortBy={sortBy}
                    onSortChange={setSortBy}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Desktop Filters Sidebar */}
          {showDesktopFilters && (
            <div className="hidden lg:block w-80 flex-shrink-0 transition-all duration-300">
              <div className="bg-gradient-to-br from-[#005b57] to-[#00443e] rounded-xl shadow-xl p-6 sticky top-8 text-white">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white">Filters</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="text-sm text-white hover:bg-white/20 hover:text-white"
                  >
                    Clear all
                  </Button>
                </div>
                <SearchFilters
                  filters={filters}
                  onFiltersChange={setFilters}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                />
              </div>
            </div>
          )}

          {/* Results */}
          <div className="flex-1 transition-all duration-300">
            <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
              {/* Toggle Filters Button - Desktop */}
              <Button
                onClick={() => setShowDesktopFilters(!showDesktopFilters)}
                variant="outline"
                className="hidden lg:flex items-center gap-2 border-2 border-[#005b57] text-[#005b57] hover:bg-[#005b57] hover:text-white transition-colors"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {showDesktopFilters ? 'Hide' : 'Show'} Filters
              </Button>

              {/* Results Count */}
              <div className="flex-1">
                <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-gradient-to-r from-pink-50 to-purple-50 rounded-full border-2 border-pink-200 shadow-sm">
                  {results === undefined ? (
                    <span className="text-sm font-medium text-gray-600">Loading...</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold bg-gradient-to-r from-[#005b57] to-pink-600 bg-clip-text text-transparent">
                        {physios.length}
                      </span>
                      <span className="text-sm font-semibold text-gray-700">
                        physiotherapist{physios.length !== 1 ? "s" : ""} available
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Sort Dropdown */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-48 border-2 border-pink-200 focus:ring-pink-500 bg-white">
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
            {results === undefined && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-12 w-12 animate-spin text-[#005b57]" />
              </div>
            )}

            {/* Physiotherapist Cards */}
            {results && hasResults && (
              <div className={`grid gap-6 transition-all duration-300 ${
                showDesktopFilters
                  ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3'
                  : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              }`}>
                {physios.map((physio: any) => (
                  <PhysioCard key={physio.id} physiotherapist={physio} />
                ))}
              </div>
            )}

            {/* Empty State */}
            {results && !hasResults && (
              <div className="text-center py-20">
                <div className="mb-6">
                  <div className="w-24 h-24 mx-auto bg-gradient-to-br from-pink-100 to-purple-100 rounded-full flex items-center justify-center">
                    <Search className="h-12 w-12 text-gray-400" />
                  </div>
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-2">
                  No physiotherapists found
                </h3>
                <p className="text-gray-600 mb-6">
                  Try adjusting your filters or search query
                </p>
                <Button
                  onClick={clearFilters}
                  className="bg-gradient-to-r from-[#005b57] to-pink-600 hover:from-[#00443e] hover:to-pink-700"
                >
                  Clear Filters
                </Button>
              </div>
            )}

            {/* Load More */}
            {results && results.hasMore && (
              <div className="mt-8 text-center">
                <Button
                  variant="outline"
                  className="px-8 py-6 text-lg border-2 border-pink-300 text-[#005b57] hover:bg-gradient-to-r hover:from-[#005b57] hover:to-pink-600 hover:text-white hover:border-transparent transition-all"
                >
                  Load More
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
