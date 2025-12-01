import { action } from "./_generated/server";
import { v } from "convex/values";

export const searchLocations = action({
    args: {
        query: v.string(),
    },
    handler: async (ctx, args) => {
        if (args.query.length < 3) {
            return [];
        }

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                    args.query
                )}&limit=5&addressdetails=1`,
                {
                    headers: {
                        "User-Agent": "RehabifyHealth/1.0",
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`Nominatim API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error("Failed to fetch locations:", error);
            return [];
        }
    },
});
