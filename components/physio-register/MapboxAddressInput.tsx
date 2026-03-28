'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Search, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface GeocoderResult {
    id: string;
    place_name: string;
    center: [number, number]; // [lng, lat]
    text: string;
}

interface MapboxAddressInputProps {
    value?: string;
    onChange: (address: string) => void;
    placeholder?: string;
    className?: string;
}

/**
 * Lightweight Mapbox address autocomplete input (no map, just search + dropdown).
 */
export default function MapboxAddressInput({
    value = '',
    onChange,
    placeholder = 'Start typing an address...',
    className,
}: MapboxAddressInputProps) {
    const [query, setQuery] = useState(value);
    const [results, setResults] = useState<GeocoderResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchTimeout = useRef<NodeJS.Timeout | null>(null);

    // Sync external value
    useEffect(() => {
        if (value !== query) setQuery(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Debounced search
    const search = useCallback(async (q: string) => {
        if (q.length < 3 || !MAPBOX_TOKEN) {
            setResults([]);
            return;
        }
        setIsSearching(true);
        try {
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&country=NG&limit=5&types=place,locality,neighborhood,address`
            );
            const data = await res.json();
            if (data.features) {
                setResults(data.features);
                setShowResults(true);
            }
        } catch (err) {
            console.error('Mapbox search failed:', err);
        } finally {
            setIsSearching(false);
        }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQuery(val);
        onChange(val);

        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => search(val), 400);
    };

    const handleSelect = (result: GeocoderResult) => {
        setQuery(result.place_name);
        onChange(result.place_name);
        setShowResults(false);
        setResults([]);
    };

    const handleClear = () => {
        setQuery('');
        onChange('');
        setResults([]);
        setShowResults(false);
    };

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                    value={query}
                    onChange={handleChange}
                    onFocus={() => results.length > 0 && setShowResults(true)}
                    placeholder={placeholder}
                    className="pl-9 pr-10 h-12 bg-white border-gray-200 rounded-xl text-sm"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {isSearching && <Loader2 className="h-4 w-4 animate-spin text-teal-600" />}
                    {query && !isSearching && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="h-6 w-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Dropdown */}
            {showResults && results.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    {results.map((result) => (
                        <button
                            key={result.id}
                            type="button"
                            onClick={() => handleSelect(result)}
                            className="w-full text-left px-4 py-3 hover:bg-teal-50 flex items-start gap-3 transition-colors border-b border-gray-50 last:border-0"
                        >
                            <MapPin className="h-4 w-4 text-teal-600 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-gray-700 line-clamp-2">{result.place_name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
