"use client";

import { useState, useEffect } from "react";
import { Search, MapPin, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    Popover,
    PopoverContent,
    PopoverAnchor,
} from "@/components/ui/popover";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

interface LocationSearchProps {
    value: string;
    onChange: (value: string) => void;
    className?: string;
}

interface LocationResult {
    place_id: string | number;
    display_name: string;
    lat: string;
    lon: string;
}

export default function LocationSearch({ value, onChange, className }: LocationSearchProps) {
    const [query, setQuery] = useState(value);
    const [results, setResults] = useState<LocationResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [open, setOpen] = useState(false);

    // Update local state when prop changes
    useEffect(() => {
        setQuery(value);
    }, [value]);

    const searchLocations = useAction(api.location.searchLocations);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.length < 3 || query === value) {
                setResults([]);
                return;
            }

            setIsLoading(true);
            try {
                const data = await searchLocations({ query });
                setResults(data);
                setOpen(true);
            } catch (error) {
                console.error("Failed to fetch locations", error);
            } finally {
                setIsLoading(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [query, value, searchLocations]);

    const handleSelect = (result: LocationResult) => {
        // Extract city/state/country from display_name for cleaner display
        const parts = result.display_name.split(", ");
        const shortName = parts.slice(0, 2).join(", "); // e.g., "Lagos, Nigeria"

        setQuery(shortName);
        onChange(shortName);
        setOpen(false);
    };

    const handleClear = () => {
        setQuery("");
        onChange("");
        setResults([]);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
                <div className={cn("relative", className)}>
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            if (e.target.value.length >= 3) setOpen(true);
                        }}
                        placeholder="Search city or area..."
                        className="pl-9 pr-8 h-10 bg-white border-gray-200 focus:ring-brand/20 rounded-xl"
                    />
                    {query && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClear}
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-transparent text-gray-400 hover:text-gray-600"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                    {isLoading && (
                        <div className="absolute right-8 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-brand" />
                        </div>
                    )}
                </div>
            </PopoverAnchor>
            <PopoverContent
                className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[300px]"
                align="start"
                onOpenAutoFocus={(e: Event) => e.preventDefault()}
            >
                <div className="max-h-60 overflow-y-auto">
                    {results.map((result) => (
                        <button
                            key={result.place_id}
                            onClick={() => handleSelect(result)}
                            className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3 transition-colors border-b border-gray-50 last:border-0"
                        >
                            <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-gray-700 line-clamp-2">
                                {result.display_name}
                            </span>
                        </button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
