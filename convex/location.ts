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

        const apiKey = process.env.LOCATIONIQ_API_KEY;
        if (!apiKey) {
            console.error("LOCATIONIQ_API_KEY is not set");
            // Fallback to empty or throw error? Better to return empty and log
            return [];
        }

        try {
            const response = await fetch(
                `https://us1.locationiq.com/v1/search.php?key=${apiKey}&q=${encodeURIComponent(
                    args.query
                )}&format=json&limit=5`,
                {
                    headers: {
                        "User-Agent": "RehabifyHealth/1.0",
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`LocationIQ API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error("Failed to fetch locations:", error);
            return [];
        }
    },
});
