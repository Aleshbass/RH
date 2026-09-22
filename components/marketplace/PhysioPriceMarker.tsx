"use client";

import { cn } from "@/lib/utils";
import { Star, Stethoscope } from "lucide-react";

interface PhysioPriceMarkerProps {
    price?: number;
    name?: string;
    rating?: number;
    isSelected?: boolean;
    isHovered?: boolean;
    onClick?: () => void;
}

/**
 * Map marker for physiotherapist on the map.
 * Displays professional rating and name (no prices displayed to users).
 */
export default function PhysioPriceMarker({
    name,
    rating,
    isSelected,
    isHovered,
    onClick,
}: PhysioPriceMarkerProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "relative px-2.5 py-1 rounded-full text-xs font-bold shadow-lg transition-all duration-200 cursor-pointer border-2 whitespace-nowrap flex items-center gap-1.5",
                "hover:scale-110 hover:z-50",
                isSelected || isHovered
                    ? "bg-[#002e2c] text-white border-[#002e2c] scale-110 z-50 shadow-xl shadow-teal-900/30"
                    : "bg-white text-gray-900 border-white hover:bg-[#005b57] hover:text-white hover:border-[#005b57]"
            )}
            style={{
                // Prevent marker from being clipped
                transform: isSelected || isHovered ? "scale(1.1)" : "scale(1)",
            }}
        >
            {rating && rating > 0 ? (
                <>
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                    <span>{rating.toFixed(1)}</span>
                </>
            ) : (
                <Stethoscope className={cn("w-3 h-3 shrink-0", isSelected || isHovered ? "text-teal-300" : "text-[#005b57]")} />
            )}
            {name && (
                <span className="font-semibold text-[11px] truncate max-w-[70px]">{name}</span>
            )}
            {/* Arrow/pointer at bottom */}
            <span
                className={cn(
                    "absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 border-b-2 border-r-2",
                    isSelected || isHovered
                        ? "bg-[#002e2c] border-[#002e2c]"
                        : "bg-white border-white"
                )}
            />
        </button>
    );
}
