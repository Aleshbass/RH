'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Search, Loader2, X, LocateFixed } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// Nigeria center
const NIGERIA_CENTER = { lat: 9.082, lng: 8.6753 };

interface LocationData {
    location: string;
    latitude: number;
    longitude: number;
}

interface MapboxLocationPickerProps {
    value?: {
        location: string;
        latitude?: number;
        longitude?: number;
    };
    onChange: (data: LocationData) => void;
    className?: string;
}

interface GeocoderResult {
    id: string;
    place_name: string;
    center: [number, number]; // [lng, lat]
    text: string;
}

export default function MapboxLocationPicker({ value, onChange, className }: MapboxLocationPickerProps) {
    const [query, setQuery] = useState(value?.location || '');
    const [results, setResults] = useState<GeocoderResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [markerPosition, setMarkerPosition] = useState<{ lat: number; lng: number }>({
        lat: value?.latitude || NIGERIA_CENTER.lat,
        lng: value?.longitude || NIGERIA_CENTER.lng,
    });
    const [hasPlacedPin, setHasPlacedPin] = useState(!!(value?.latitude && value?.longitude));
    const [viewState, setViewState] = useState({
        longitude: value?.longitude || NIGERIA_CENTER.lng,
        latitude: value?.latitude || NIGERIA_CENTER.lat,
        zoom: value?.latitude ? 14 : 6,
    });
    const [isDragging, setIsDragging] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Close results dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Debounced Mapbox geocoder search
    const searchLocations = useCallback(async (searchQuery: string) => {
        if (searchQuery.length < 3 || !MAPBOX_TOKEN) return;
        setIsSearching(true);

        try {
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
                    searchQuery
                )}.json?access_token=${MAPBOX_TOKEN}&country=NG&limit=5&types=place,locality,neighborhood,address`
            );
            const data = await res.json();
            if (data.features) {
                setResults(data.features);
                setShowResults(true);
            }
        } catch (err) {
            console.error('Geocoder search failed:', err);
        } finally {
            setIsSearching(false);
        }
    }, []);

    // Handle search input
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQuery(val);

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => searchLocations(val), 400);
    };

    // Handle result selection
    const handleSelectResult = (result: GeocoderResult) => {
        const [lng, lat] = result.center;
        setQuery(result.place_name);
        setMarkerPosition({ lat, lng });
        setHasPlacedPin(true);
        setShowResults(false);
        setViewState({ longitude: lng, latitude: lat, zoom: 14 });
        onChange({ location: result.place_name, latitude: lat, longitude: lng });
    };

    // Handle map click to place/move pin
    const handleMapClick = useCallback(
        async (e: any) => {
            if (isDragging) return;
            const { lng, lat } = e.lngLat;
            setMarkerPosition({ lat, lng });
            setHasPlacedPin(true);

            // Reverse geocode to get place name
            try {
                const res = await fetch(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`
                );
                const data = await res.json();
                const placeName = data.features?.[0]?.place_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                setQuery(placeName);
                onChange({ location: placeName, latitude: lat, longitude: lng });
            } catch {
                const fallbackName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                setQuery(fallbackName);
                onChange({ location: fallbackName, latitude: lat, longitude: lng });
            }
        },
        [isDragging, onChange]
    );

    // Handle marker drag end
    const handleMarkerDragEnd = useCallback(
        async (e: any) => {
            const { lng, lat } = e.lngLat;
            setMarkerPosition({ lat, lng });
            setIsDragging(false);

            // Reverse geocode
            try {
                const res = await fetch(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`
                );
                const data = await res.json();
                const placeName = data.features?.[0]?.place_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                setQuery(placeName);
                onChange({ location: placeName, latitude: lat, longitude: lng });
            } catch {
                const fallbackName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                setQuery(fallbackName);
                onChange({ location: fallbackName, latitude: lat, longitude: lng });
            }
        },
        [onChange]
    );

    // Handle "Use my location"
    const handleUseMyLocation = () => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                setMarkerPosition({ lat, lng });
                setHasPlacedPin(true);
                setViewState({ longitude: lng, latitude: lat, zoom: 14 });

                try {
                    const res = await fetch(
                        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`
                    );
                    const data = await res.json();
                    const placeName = data.features?.[0]?.place_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                    setQuery(placeName);
                    onChange({ location: placeName, latitude: lat, longitude: lng });
                } catch {
                    const fallbackName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                    setQuery(fallbackName);
                    onChange({ location: fallbackName, latitude: lat, longitude: lng });
                }
            },
            (err) => console.error('Geolocation error:', err),
            { enableHighAccuracy: true }
        );
    };

    const handleClearSearch = () => {
        setQuery('');
        setResults([]);
        setShowResults(false);
    };

    return (
        <div className={cn('space-y-3', className)}>
            {/* Search Bar */}
            <div ref={searchRef} className="relative">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        value={query}
                        onChange={handleSearchChange}
                        onFocus={() => results.length > 0 && setShowResults(true)}
                        placeholder="Search for your practice location..."
                        className="pl-9 pr-20 h-12 bg-white border-gray-200 rounded-xl text-sm"
                    />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {isSearching && <Loader2 className="h-4 w-4 animate-spin text-teal-600" />}
                        {query && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearSearch}
                                className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleUseMyLocation}
                            className="h-8 px-2 text-xs text-teal-700 hover:text-teal-900 hover:bg-teal-50 gap-1"
                            title="Use my current location"
                        >
                            <LocateFixed className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">My Location</span>
                        </Button>
                    </div>
                </div>

                {/* Search Results Dropdown */}
                {showResults && results.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                        {results.map((result) => (
                            <button
                                key={result.id}
                                type="button"
                                onClick={() => handleSelectResult(result)}
                                className="w-full text-left px-4 py-3 hover:bg-teal-50 flex items-start gap-3 transition-colors border-b border-gray-50 last:border-0"
                            >
                                <MapPin className="h-4 w-4 text-teal-600 mt-0.5 flex-shrink-0" />
                                <span className="text-sm text-gray-700 line-clamp-2">{result.place_name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Map */}
            <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: 280 }}>
                <Map
                    {...viewState}
                    onMove={(evt) => setViewState(evt.viewState)}
                    onClick={handleMapClick}
                    style={{ width: '100%', height: '100%' }}
                    mapStyle="mapbox://styles/mapbox/streets-v12"
                    mapboxAccessToken={MAPBOX_TOKEN}
                    minZoom={4}
                    reuseMaps
                    cursor={isDragging ? 'grabbing' : 'crosshair'}
                >
                    <NavigationControl position="top-right" showCompass={false} />

                    {hasPlacedPin && (
                        <Marker
                            longitude={markerPosition.lng}
                            latitude={markerPosition.lat}
                            anchor="bottom"
                            draggable
                            onDragStart={() => setIsDragging(true)}
                            onDragEnd={handleMarkerDragEnd}
                        >
                            <div className="flex flex-col items-center animate-bounce-once">
                                <div className="bg-[#005b57] text-white p-2 rounded-full shadow-lg">
                                    <MapPin className="h-5 w-5" />
                                </div>
                                <div className="w-2 h-2 bg-[#005b57] rounded-full mt-0.5 opacity-40" />
                            </div>
                        </Marker>
                    )}
                </Map>
            </div>

            {/* Helper text */}
            <p className="text-xs text-gray-500 text-center">
                {hasPlacedPin
                    ? '✓ Location pinned — drag the pin or click the map to adjust'
                    : 'Search above or click the map to pin your practice location'}
            </p>
        </div>
    );
}
