import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MarketplaceFilters {
  specializations: string[];
  location: string;
  minPrice?: number;
  maxPrice?: number;
  offersOnline?: boolean;
  offersInPerson?: boolean;
  minYearsExperience?: number;
}

interface MarketplaceState {
  // Search state
  searchQuery: string;
  filters: MarketplaceFilters;
  sortBy: string;
  
  // Cached results
  cachedResults: Map<string, { data: any; timestamp: number }>;
  cacheExpiry: number; // 5 minutes
  
  // Actions
  setSearchQuery: (query: string) => void;
  setFilters: (filters: MarketplaceFilters) => void;
  setSortBy: (sortBy: string) => void;
  clearFilters: () => void;
  
  // Cache management
  getCachedResults: (key: string) => any | null;
  setCachedResults: (key: string, data: any) => void;
  clearCache: () => void;
}

const defaultFilters: MarketplaceFilters = {
  specializations: [],
  location: "",
  minPrice: undefined,
  maxPrice: undefined,
  offersOnline: undefined,
  offersInPerson: undefined,
  minYearsExperience: undefined,
};

export const useMarketplaceStore = create<MarketplaceState>()(
  persist(
    (set, get) => ({
      // Initial state
      searchQuery: "",
      filters: defaultFilters,
      sortBy: "verified",
      cachedResults: new Map(),
      cacheExpiry: 5 * 60 * 1000, // 5 minutes
      
      // Actions
      setSearchQuery: (query) => set({ searchQuery: query }),
      
      setFilters: (filters) => set({ filters }),
      
      setSortBy: (sortBy) => set({ sortBy }),
      
      clearFilters: () =>
        set({
          searchQuery: "",
          filters: defaultFilters,
        }),
      
      // Cache management
      getCachedResults: (key) => {
        const cached = get().cachedResults.get(key);
        if (!cached) return null;
        
        const now = Date.now();
        if (now - cached.timestamp > get().cacheExpiry) {
          // Cache expired
          const newCache = new Map(get().cachedResults);
          newCache.delete(key);
          set({ cachedResults: newCache });
          return null;
        }
        
        return cached.data;
      },
      
      setCachedResults: (key, data) => {
        const newCache = new Map(get().cachedResults);
        newCache.set(key, { data, timestamp: Date.now() });
        
        // Limit cache size to 50 entries
        if (newCache.size > 50) {
          const iter = newCache.keys().next();
          if (!iter.done) {
            newCache.delete(iter.value as string);
          }
        }
        
        set({ cachedResults: newCache });
      },
      
      clearCache: () => set({ cachedResults: new Map() }),
    }),
    {
      name: "marketplace-storage",
      // Only persist filters and search query, not cached results
      partialize: (state) => ({
        searchQuery: state.searchQuery,
        filters: state.filters,
        sortBy: state.sortBy,
      }),
    }
  )
);
