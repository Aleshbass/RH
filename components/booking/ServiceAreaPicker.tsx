"use client";

import type { ReactNode } from "react";
import { ChevronDown, Loader2, MapPin } from "@/components/icons";
import { cn } from "@/lib/utils";
import { cityAreas, zoneCities, type TravelZone } from "./booking-shared";

/** Select value for "my city / area isn't listed". */
export const NOT_LISTED = "__not_listed__";

const selectClass =
    "w-full appearance-none rounded-xl border border-rh-night/15 bg-white py-2.5 pl-3.5 pr-10 text-base text-rh-night transition-[border-color,box-shadow] focus:border-rh-night focus:outline-none focus:ring-4 focus:ring-rh-lime/25 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm";

/**
 * City + area picker for home visits. Only areas inside a travel zone are listed; picking
 * "isn't listed" shows `notCovered` (we can't visit there yet).
 */
export function ServiceAreaPicker({
    zones,
    city,
    area,
    onChange,
    notCovered,
    idPrefix = "visit",
    className,
}: {
    zones: TravelZone[] | undefined;
    city: string;
    area: string;
    onChange: (next: { city: string; area: string }) => void;
    notCovered: ReactNode;
    idPrefix?: string;
    className?: string;
}) {
    if (zones === undefined) {
        return (
            <div className={cn("flex items-center gap-2 text-sm text-rh-night/60", className)}>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the areas we cover…
            </div>
        );
    }
    if (zones.length === 0) return <div className={className}>{notCovered}</div>;

    const cities = zoneCities(zones);
    const areas = city && city !== NOT_LISTED ? cityAreas(zones, city) : [];
    const outside = city === NOT_LISTED || area === NOT_LISTED;

    return (
        <div className={cn("space-y-4", className)}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                    <label htmlFor={`${idPrefix}-city`} className="mb-1.5 block text-sm font-semibold text-rh-night">
                        City
                    </label>
                    <div className="relative">
                        <select
                            id={`${idPrefix}-city`}
                            value={city}
                            onChange={(e) => onChange({ city: e.target.value, area: "" })}
                            className={selectClass}
                        >
                            <option value="">Choose your city</option>
                            {cities.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                            <option value={NOT_LISTED}>My city isn&#39;t listed</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-night/45" aria-hidden />
                    </div>
                </div>
                <div>
                    <label htmlFor={`${idPrefix}-area`} className="mb-1.5 block text-sm font-semibold text-rh-night">
                        Area
                    </label>
                    <div className="relative">
                        <select
                            id={`${idPrefix}-area`}
                            value={area}
                            onChange={(e) => onChange({ city, area: e.target.value })}
                            disabled={!city || city === NOT_LISTED}
                            className={selectClass}
                        >
                            <option value="">{city && city !== NOT_LISTED ? "Choose your area" : "Choose a city first"}</option>
                            {areas.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                            {city && city !== NOT_LISTED && <option value={NOT_LISTED}>My area isn&#39;t listed</option>}
                        </select>
                        <MapPin className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-night/45" aria-hidden />
                    </div>
                </div>
            </div>
            {outside && notCovered}
        </div>
    );
}
