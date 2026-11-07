"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowRight, List, Loader2, Map, Search, WhatsApp, X } from "@/components/icons";
import PhysioCard from "@/components/marketplace/PhysioCard";
import { DynamicPhysioMapView } from "@/components/marketplace/DynamicPhysioMapView";
import { useMarketplaceStore } from "@/stores/marketplaceStore";
import { joyWhatsAppUrl } from "@/lib/joyWhatsApp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CareBrowsingSignal } from "@/components/marketplace/CareBrowsingSignal";
import { HelpMeChoose } from "@/components/marketplace/HelpMeChoose";

type ViewMode = "list" | "map";

const PAGE_SIZE = 24;
const JOY_MATCH_URL = joyWhatsAppUrl("Hi Joy, I'd like help finding the right physiotherapist.");

type SearchResults = {
  results: any[];
  total: number;
  hasMore: boolean;
};

export default function FindAPhysioPage() {
  // Only the search text and sort are remembered. Old filter values in storage are ignored:
  // there's no filter panel any more, so they would hide physios with no way to clear them.
  const {
    searchQuery: storedQuery,
    sortBy: storedSortBy,
    setSearchQuery: setStoredQuery,
    setSortBy: setStoredSortBy,
  } = useMarketplaceStore();

  const [query, setQuery] = useState(storedQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(storedQuery);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [hoveredPhysioId, setHoveredPhysioId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = query.trim();
      if (next !== debouncedQuery) {
        setDebouncedQuery(next);
        // A new search starts again from the first page
        setLimit(PAGE_SIZE);
      }
      setStoredQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, debouncedQuery, setStoredQuery]);

  const changeSort = (value: string) => {
    setStoredSortBy(value);
    setLimit(PAGE_SIZE);
  };

  const results = useQuery(api.marketplace.search.searchPhysiotherapists, {
    searchQuery: debouncedQuery || undefined,
    sortBy: storedSortBy,
    limit,
  }) as SearchResults | undefined;

  // Keep showing the last results while the next page or search loads
  const lastResults = useRef<SearchResults | undefined>(undefined);
  if (results) lastResults.current = results;
  const shown = results ?? lastResults.current;
  const physios = shown?.results ?? [];
  const isFirstLoad = shown === undefined;
  const isRefreshing = results === undefined && shown !== undefined;

  const clearSearch = () => {
    setQuery("");
    setDebouncedQuery("");
    setStoredQuery("");
    setLimit(PAGE_SIZE);
  };

  const total = shown?.total ?? 0;
  const countLabel = `${total} ${total === 1 ? "physiotherapist" : "physiotherapists"}`;

  return (
    <div className="min-h-screen bg-rh-canvas text-rh-ink">
      {/* A signed-in patient browsing here: the team is told so someone can help them book */}
      <CareBrowsingSignal looking={debouncedQuery} />
      <section className="mx-auto max-w-7xl px-4 pb-8 pt-28 sm:px-6 md:pt-36 lg:px-8">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">Find a physiotherapist</h1>
        <p className="mt-4 max-w-xl text-lg text-rh-ink/70">
          Search by condition, specialty or name, then book a session in a few taps.
        </p>

        <div className="relative mt-8 max-w-2xl">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-rh-ink/40" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Back pain, knee, sports injury, a name…"
            aria-label="Search physiotherapists"
            className="h-14 w-full rounded-full border border-rh-ink/10 bg-white pl-14 pr-14 text-base text-rh-ink placeholder:text-rh-ink/40 focus:border-rh-ink/40 focus:outline-none focus:ring-2 focus:ring-rh-ink/10 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-rh-ink/50 transition-colors hover:bg-rh-canvas hover:text-rh-ink"
            >
              {query.trim() !== debouncedQuery ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Three questions; the care team matches them (convex/findHelp.ts) */}
        <HelpMeChoose />
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-t border-rh-ink/10 pt-6">
          <p className="text-sm text-rh-ink/70" aria-live="polite">
            {isFirstLoad ? (
              "Finding physiotherapists…"
            ) : (
              <>
                <span className="font-semibold text-rh-ink">{countLabel}</span>
                {debouncedQuery && <> for &ldquo;{debouncedQuery}&rdquo;</>}
              </>
            )}
          </p>

          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-rh-ink/10 bg-white p-1" role="group" aria-label="View">
              {(
                [
                  { mode: "list", label: "List", icon: List },
                  { mode: "map", label: "Map", icon: Map },
                ] as const
              ).map(({ mode, label, icon: Icon }) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
                    viewMode === mode ? "bg-rh-ink text-white" : "text-rh-ink/60 hover:text-rh-ink"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <Select value={storedSortBy} onValueChange={changeSort}>
              <SelectTrigger
                aria-label="Sort"
                className="h-10 w-40 rounded-full border-rh-ink/10 bg-white text-sm text-rh-ink focus:ring-rh-ink/10"
              >
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="verified">Verified first</SelectItem>
                <SelectItem value="rating">Highest rated</SelectItem>
                <SelectItem value="experience">Most experienced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className={cn(viewMode === "map" && "lg:grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-6")}>
          {/* On phones the map replaces the list; on wider screens they sit side by side */}
          <div
            className={cn(
              viewMode === "map" && "hidden lg:block lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-1",
              isRefreshing && "opacity-60 transition-opacity"
            )}
          >
            {isFirstLoad && (
              <div className={cn("grid grid-cols-1 gap-5", viewMode === "list" && "sm:grid-cols-2 xl:grid-cols-3")}>
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="h-64 animate-pulse rounded-2xl bg-white/70" />
                ))}
              </div>
            )}

            {/* grid-cols-1: one column that shrinks to the phone; an auto column grows to a card's longest line */}
            {physios.length > 0 && (
              <div className={cn("grid grid-cols-1 gap-5", viewMode === "list" && "sm:grid-cols-2 xl:grid-cols-3")}>
                {physios.map((physio) => (
                  <div
                    key={physio.id}
                    className="min-w-0"
                    onMouseEnter={() => setHoveredPhysioId(physio.id)}
                    onMouseLeave={() => setHoveredPhysioId(null)}
                  >
                    <PhysioCard physiotherapist={physio} />
                  </div>
                ))}
              </div>
            )}

            {shown && physios.length === 0 && (
              <div className="rounded-3xl bg-white px-6 py-16 text-center">
                <h2 className="text-xl font-semibold">
                  {debouncedQuery ? `No physiotherapists match “${debouncedQuery}”` : "No physiotherapists are listed right now"}
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-rh-ink/60">
                  {debouncedQuery
                    ? "Try a different word, or let Joy find the right person for you."
                    : "Joy can still match you with a physiotherapist on WhatsApp."}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  {debouncedQuery && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="h-11 rounded-full border border-rh-ink/15 px-5 text-sm font-semibold transition-colors hover:border-rh-ink/40"
                    >
                      Clear search
                    </button>
                  )}
                  <a
                    href={JOY_MATCH_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-rh-lime px-5 text-sm font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep"
                  >
                    <WhatsApp className="h-4 w-4" />
                    Ask Joy to match me
                  </a>
                </div>
              </div>
            )}

            {shown?.hasMore && (
              <div className="mt-10 text-center">
                <button
                  type="button"
                  onClick={() => setLimit((current) => current + PAGE_SIZE)}
                  disabled={isRefreshing}
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-rh-ink/15 bg-white px-6 text-sm font-semibold transition-colors hover:border-rh-ink/40 disabled:opacity-60"
                >
                  {isRefreshing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Show more physiotherapists
                </button>
              </div>
            )}
          </div>

          {viewMode === "map" && (
            <div className="relative h-[70vh] overflow-hidden rounded-2xl border border-rh-ink/10 bg-white lg:sticky lg:top-28 lg:h-[calc(100vh-8rem)]">
              <DynamicPhysioMapView
                physiotherapists={physios}
                hoveredPhysioId={hoveredPhysioId}
                onPhysioHover={setHoveredPhysioId}
                className="h-full w-full"
              />
            </div>
          )}
        </div>

        <div className="mt-16 flex flex-col gap-6 rounded-3xl bg-rh-ink p-8 text-white md:flex-row md:items-center md:justify-between md:p-10">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Not sure who to choose?</h2>
            <p className="mt-2 text-white/70">
              Tell Joy what hurts and we&apos;ll match you with the right physiotherapist, usually within 24 hours.
            </p>
          </div>
          <a
            href={JOY_MATCH_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-rh-lime px-6 text-sm font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep"
          >
            <WhatsApp className="h-4 w-4" />
            Chat with Joy
          </a>
        </div>

        <p className="mt-8 text-sm text-rh-ink/60">
          Are you a physiotherapist?{" "}
          <Link href="/platform/physiotherapists" className="inline-flex items-center gap-1 font-semibold text-rh-ink hover:underline">
            Join the Rehabify network
            <ArrowRight className="h-3 w-3" />
          </Link>
        </p>
      </section>
    </div>
  );
}
