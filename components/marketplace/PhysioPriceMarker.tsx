"use client";

import { cn } from "@/lib/utils";

interface PhysioPriceMarkerProps {
    price: number;
    isSelected?: boolean;
    isHovered?: boolean;
    onClick?: () => void;
}

/**
 * Airbnb-style price marker for the map.
 * Shows the physiotherapist's rate as a pill on the map.
 */
export default function PhysioPriceMarker({
    price,
    isSelected,
    isHovered,
    onClick,
}: PhysioPriceMarkerProps) {
    const formatPrice = (price: number) => {
        if (price >= 1000000) {
            return `₦${(price / 1000000).toFixed(1)}M`;
        }
        if (price >= 1000) {
            return `₦${(price / 1000).toFixed(0)}K`;
        }
        return `₦${price.toLocaleString()}`;
    };

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "relative px-3 py-1.5 rounded-full text-xs font-bold shadow-lg transition-all duration-200 cursor-pointer border-2 whitespace-nowrap",
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
            {formatPrice(price)}
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
