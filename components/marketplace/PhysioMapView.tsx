"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, Popup, NavigationControl } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import Link from "next/link";
import Image from "next/image";
import { MapPin, Star, BadgeCheck, Video, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PhysioPriceMarker from "./PhysioPriceMarker";
import {
    geocodeNigerianLocation,
    NIGERIA_CENTER,
    NIGERIA_BOUNDS,
} from "@/lib/nigeria-locations";

export interface PhysioMapItem {
    id: string;
    fullName: string;
    imageUrl?: string;
    credentials: string[];
    bio?: string;
    specializations: string[];
    yearsOfExperience: number;
    location?: string;
    hourlyRate: number;
    initialConsultRate: number;
    averageRating: number;
    reviewCount: number;
    isVerified: boolean;
    offersOnlineSessions: boolean;
    offersInPersonSessions: boolean;
}

interface PhysioMapViewProps {
    physiotherapists: PhysioMapItem[];
    hoveredPhysioId?: string | null;
    onPhysioHover?: (id: string | null) => void;
    className?: string;
}

interface GeocodedPhysio extends PhysioMapItem {
    lat: number;
    lng: number;
}

export function PhysioMapView({
    physiotherapists,
    hoveredPhysioId,
    onPhysioHover,
    className,
}: PhysioMapViewProps) {
    const [selectedPhysio, setSelectedPhysio] = useState<GeocodedPhysio | null>(
        null
    );
    const [viewState, setViewState] = useState({
        longitude: NIGERIA_CENTER.lng,
        latitude: NIGERIA_CENTER.lat,
        zoom: 6,
    });
    const hasFittedRef = useRef(false);

    // Geocode all physiotherapists with valid locations
    const geocodedPhysios = useMemo(() => {
        const result: GeocodedPhysio[] = [];

        for (const physio of physiotherapists) {
            if (!physio.location) continue;
            const coords = geocodeNigerianLocation(physio.location);
            if (coords) {
                // Add small random offset to prevent perfect overlap
                const offset = () => (Math.random() - 0.5) * 0.01;
                result.push({
                    ...physio,
                    lat: coords.lat + offset(),
                    lng: coords.lng + offset(),
                });
            }
        }

        return result;
    }, [physiotherapists]);

    // Fit map to show all markers on first load
    useEffect(() => {
        if (hasFittedRef.current || geocodedPhysios.length === 0) return;

        if (geocodedPhysios.length === 1) {
            setViewState({
                longitude: geocodedPhysios[0].lng,
                latitude: geocodedPhysios[0].lat,
                zoom: 12,
            });
        } else {
            // Calculate center of all points
            const lats = geocodedPhysios.map((p) => p.lat);
            const lngs = geocodedPhysios.map((p) => p.lng);
            const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
            const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

            // Calculate zoom based on spread
            const latSpread = Math.max(...lats) - Math.min(...lats);
            const lngSpread = Math.max(...lngs) - Math.min(...lngs);
            const maxSpread = Math.max(latSpread, lngSpread);
            const zoom = maxSpread > 5 ? 6 : maxSpread > 2 ? 7 : maxSpread > 1 ? 8 : 10;

            setViewState({
                longitude: centerLng,
                latitude: centerLat,
                zoom,
            });
        }

        hasFittedRef.current = true;
    }, [geocodedPhysios]);

    const handleMarkerClick = useCallback((physio: GeocodedPhysio) => {
        setSelectedPhysio(physio);
    }, []);

    return (
        <div className={className ?? "w-full h-full"}>
            <Map
                {...viewState}
                onMove={(evt) => setViewState(evt.viewState)}
                style={{ width: "100%", height: "100%" }}
                mapStyle="mapbox://styles/mapbox/light-v11"
                mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
                maxBounds={[
                    [NIGERIA_BOUNDS.sw.lng - 2, NIGERIA_BOUNDS.sw.lat - 2],
                    [NIGERIA_BOUNDS.ne.lng + 2, NIGERIA_BOUNDS.ne.lat + 2],
                ]}
                minZoom={5}
                reuseMaps
            >
                <NavigationControl position="top-right" showCompass={false} />

                {/* Price markers */}
                {geocodedPhysios.map((physio) => (
                    <Marker
                        key={physio.id}
                        longitude={physio.lng}
                        latitude={physio.lat}
                        anchor="bottom"
                        onClick={(e) => {
                            e.originalEvent.stopPropagation();
                            handleMarkerClick(physio);
                        }}
                    >
                        <PhysioPriceMarker
                            price={physio.initialConsultRate || physio.hourlyRate}
                            isSelected={selectedPhysio?.id === physio.id}
                            isHovered={hoveredPhysioId === physio.id}
                            onClick={() => handleMarkerClick(physio)}
                        />
                    </Marker>
                ))}

                {/* Popup card */}
                {selectedPhysio && (
                    <Popup
                        longitude={selectedPhysio.lng}
                        latitude={selectedPhysio.lat}
                        anchor="bottom"
                        offset={25}
                        onClose={() => setSelectedPhysio(null)}
                        closeButton={false}
                        closeOnClick={false}
                        className="physio-map-popup"
                        maxWidth="320px"
                    >
                        <div className="relative">
                            {/* Close button */}
                            <button
                                onClick={() => setSelectedPhysio(null)}
                                className="absolute top-2 right-2 z-10 bg-white/90 backdrop-blur-sm hover:bg-white rounded-full p-1 shadow-sm transition-colors"
                            >
                                <X className="h-3.5 w-3.5 text-gray-500" />
                            </button>

                            <Link
                                href={`/find-a-physio/${selectedPhysio.id}`}
                                className="block group"
                            >
                                <div className="p-3">
                                    {/* Header: photo + name */}
                                    <div className="flex items-start gap-3 mb-2.5">
                                        <div className="relative flex-shrink-0">
                                            {selectedPhysio.imageUrl ? (
                                                <Image
                                                    src={selectedPhysio.imageUrl}
                                                    alt={selectedPhysio.fullName}
                                                    width={48}
                                                    height={48}
                                                    className="rounded-full object-cover border border-gray-100"
                                                />
                                            ) : (
                                                <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center text-[#005b57] text-sm font-bold border border-teal-100">
                                                    {selectedPhysio.fullName
                                                        .split(" ")
                                                        .map((n) => n[0])
                                                        .join("")
                                                        .toUpperCase()}
                                                </div>
                                            )}
                                            {selectedPhysio.isVerified && (
                                                <div className="absolute -bottom-0.5 -right-0.5 bg-blue-500 rounded-full p-0.5 border-2 border-white">
                                                    <BadgeCheck className="h-2.5 w-2.5 text-white" />
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-bold text-gray-900 truncate group-hover:text-[#005b57] transition-colors">
                                                {selectedPhysio.fullName}
                                            </h3>
                                            <p className="text-[11px] text-gray-500 truncate">
                                                {selectedPhysio.credentials.length > 0
                                                    ? selectedPhysio.credentials.join(" • ")
                                                    : "Physiotherapist"}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {selectedPhysio.averageRating > 0 && (
                                                    <div className="flex items-center gap-0.5">
                                                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                                        <span className="text-[11px] font-semibold text-gray-900">
                                                            {selectedPhysio.averageRating.toFixed(1)}
                                                        </span>
                                                        <span className="text-[11px] text-gray-400">
                                                            ({selectedPhysio.reviewCount})
                                                        </span>
                                                    </div>
                                                )}
                                                <span className="text-[11px] text-gray-400">
                                                    • {selectedPhysio.yearsOfExperience}y exp.
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Specializations */}
                                    <div className="flex flex-wrap gap-1 mb-2.5">
                                        {selectedPhysio.specializations.slice(0, 3).map((spec, i) => (
                                            <Badge
                                                key={i}
                                                variant="secondary"
                                                className="text-[10px] px-1.5 py-0 bg-gray-50 text-gray-600 border-gray-100 font-normal"
                                            >
                                                {spec}
                                            </Badge>
                                        ))}
                                    </div>

                                    {/* Footer: price + session types */}
                                    <div className="flex items-end justify-between pt-2 border-t border-gray-100">
                                        <div>
                                            <div className="flex items-center gap-1.5 mb-1">
                                                {selectedPhysio.offersOnlineSessions && (
                                                    <div className="flex items-center gap-0.5 text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
                                                        <Video className="h-2.5 w-2.5 text-[#005b57]" />
                                                        <span>Online</span>
                                                    </div>
                                                )}
                                                {selectedPhysio.offersInPersonSessions && (
                                                    <div className="flex items-center gap-0.5 text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
                                                        <Users className="h-2.5 w-2.5 text-[#005b57]" />
                                                        <span>In-Person</span>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                                                From
                                            </p>
                                            <p className="text-base font-bold text-gray-900 leading-none">
                                                ₦
                                                {(
                                                    selectedPhysio.initialConsultRate ||
                                                    selectedPhysio.hourlyRate
                                                ).toLocaleString()}
                                            </p>
                                        </div>

                                        <Button
                                            size="sm"
                                            className="bg-[#005b57] hover:bg-[#00443e] text-white rounded-lg h-8 text-xs font-medium"
                                        >
                                            View Profile
                                        </Button>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    </Popup>
                )}
            </Map>

            {/* Map stats overlay */}
            <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg border border-gray-100">
                <p className="text-xs text-gray-600">
                    <span className="font-bold text-[#005b57]">{geocodedPhysios.length}</span>{" "}
                    {geocodedPhysios.length === 1 ? "physiotherapist" : "physiotherapists"} on map
                </p>
            </div>
        </div>
    );
}
