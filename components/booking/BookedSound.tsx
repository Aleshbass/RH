"use client";

import { useEffect } from "react";
import { playSound } from "@/lib/sounds";

/**
 * Plays the "booked" chord once when a confirmed booking page opens. Remembered per booking
 * for the browser session so a refresh doesn't replay it. Browsers may block audio that
 * isn't triggered by a tap; playSound then fails silently.
 */
export function BookedSound({ bookingId }: { bookingId?: string }) {
    useEffect(() => {
        const key = `rehabify:booked-sound:${bookingId || "latest"}`;
        try {
            if (sessionStorage.getItem(key)) return;
            sessionStorage.setItem(key, "1");
        } catch {
            // Storage unavailable — still play once for this mount
        }
        playSound("booked");
    }, [bookingId]);

    return null;
}
