'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface GeocoderResult {
    id: string;
    place_name: string;
    center: [number, number]; // [lng, lat]
    text: string;
    place_type?: string[];
    address?: string; // house number on address results
    properties?: { address?: string };
    context?: { id: string; text: string }[];
}

/** The parts of a picked result, for filling in address fields. */
export interface MapboxPlace {
    placeName: string;
    /** House number and street (or a named place with its street). Empty for area results. */
    street: string;
    /** Neighbourhood or locality, when it is not the city itself. */
    area: string;
    city: string;
    state: string;
    country: string;
    latitude: number;
    longitude: number;
}

function toMapboxPlace(result: GeocoderResult): MapboxPlace {
    const types = result.place_type ?? [];
    // A result's own level comes from its text; the levels above it come from its context
    const level = (type: string) =>
        types.includes(type)
            ? result.text
            : result.context?.find((c) => c.id.startsWith(`${type}.`))?.text ?? '';

    const city = level('place') || level('locality');
    const area = [level('neighborhood'), level('locality')].find((t) => t && t !== city) ?? '';
    let street = '';
    if (types.includes('address')) {
        street = [result.address, result.text].filter(Boolean).join(' ');
    } else if (types.includes('poi')) {
        street = [result.text, result.properties?.address].filter(Boolean).join(', ');
    }

    return {
        placeName: result.place_name,
        street,
        area,
        city,
        state: level('region'),
        country: level('country'),
        latitude: result.center[1],
        longitude: result.center[0],
    };
}

interface MapboxAddressInputProps {
    value?: string;
    onChange: (address: string) => void;
    /** Called with the parsed parts when a suggestion is picked */
    onSelectPlace?: (place: MapboxPlace) => void;
    placeholder?: string;
    className?: string;
}

/**
 * Lightweight Mapbox address autocomplete input (no map, just search + dropdown).
 */
export default function MapboxAddressInput({
    value = '',
    onChange,
    onSelectPlace,
    placeholder = 'Start typing an address...',
    className,
}: MapboxAddressInputProps) {
    const [query, setQuery] = useState(value);
    const [results, setResults] = useState<GeocoderResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchTimeout = useRef<NodeJS.Timeout | null>(null);
    const controllerRef = useRef<AbortController | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (searchTimeout.current) clearTimeout(searchTimeout.current);
            if (controllerRef.current) controllerRef.current.abort();
        };
    }, []);

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

        if (controllerRef.current) {
            controllerRef.current.abort();
        }
        controllerRef.current = new AbortController();

        setIsSearching(true);
        try {
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&country=NG&limit=5&types=place,locality,neighborhood,address`,
                { signal: controllerRef.current.signal }
            );
            if (!res.ok) {
                throw new Error(`Mapbox API error: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            if (data.features) {
                setResults(data.features);
                setShowResults(true);
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error('Mapbox search failed:', err);
            }
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
        onSelectPlace?.(toMapboxPlace(result));
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
