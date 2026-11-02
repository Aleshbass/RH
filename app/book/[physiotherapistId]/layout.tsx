import type { Metadata, Viewport } from "next";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { pageMetadata, physioOgCard } from "@/lib/seo/utils";

// Browser chrome matches the night-green booking pages on mobile.
export const viewport: Viewport = {
    themeColor: "#002e2c",
};

type Props = {
    params: Promise<{ physiotherapistId: string }>;
};

// Titles carry no brand: the root layout's template appends it
function genericBookingMetadata(path: string): Metadata {
    return pageMetadata({
        title: "Book a session",
        description: "Book an online or in-person physiotherapy session with a verified physiotherapist.",
        path,
    });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { physiotherapistId } = await params;
    const path = `/book/${physiotherapistId}`;

    try {
        const convex = getConvexClient();

        // Determine the real user ID — resolve slug first, fall back to raw param
        let userId: string = physiotherapistId;

        // Check if this looks like a slug (contains hyphens) vs a raw Convex ID
        if (physiotherapistId.includes("-")) {
            const slugResult = await convex.query(api.marketplace.search.resolveBookingSlug, {
                slug: physiotherapistId,
            });
            if (slugResult?.userId) {
                userId = slugResult.userId;
            } else {
                // Slug not found — return generic metadata
                return genericBookingMetadata(path);
            }
        }

        // Fetch the physio profile for dynamic OG tags
        const profile = await convex.query(api.marketplace.search.getPhysiotherapistProfile, {
            physiotherapistId: userId as Id<"users">,
        });

        if (!profile) {
            return genericBookingMetadata(path);
        }

        const description = profile.specializations?.length
            ? `Book a physiotherapy session with ${profile.fullName}. Specializing in ${profile.specializations.slice(0, 2).join(", ")}.`
            : `Book a physiotherapy session with ${profile.fullName} on Rehabify Health.`;

        return pageMetadata({
            title: `Book with ${profile.fullName}`,
            description,
            path,
            ogImage: physioOgCard(profile),
        });
    } catch {
        return genericBookingMetadata(path);
    }
}

export default function BookingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
