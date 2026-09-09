import { Metadata } from "next";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

type Props = {
    params: Promise<{ physiotherapistId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { physiotherapistId } = await params;

    // Base URL for OG image generation
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://physioaroundme.com";

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
                return {
                    title: "Book a Session | Rehabify Health",
                    description: "Book a physiotherapy session",
                };
            }
        }

        // Fetch the physio profile for dynamic OG tags
        const profile = await convex.query(api.marketplace.search.getPhysiotherapistProfile, {
            physiotherapistId: userId as Id<"users">,
        });

        if (!profile) {
            return {
                title: "Book a Session | Rehabify Health",
                description: "Book a physiotherapy session",
            };
        }

        const title = `Book with ${profile.fullName} | Rehabify Health`;
        const description = profile.specializations?.length
            ? `Book a physiotherapy session with ${profile.fullName}. Specializing in ${profile.specializations.slice(0, 2).join(", ")}.`
            : `Book a physiotherapy session with ${profile.fullName} on Rehabify Health.`;

        // Generate dynamic OG image URL
        const ogImageUrl = new URL(`${baseUrl}/api/og/booking`);
        ogImageUrl.searchParams.set("name", profile.fullName);
        ogImageUrl.searchParams.set("duration", "60");
        if (profile.specializations?.[0]) {
            ogImageUrl.searchParams.set("spec", profile.specializations[0]);
        }
        if (profile.imageUrl) {
            ogImageUrl.searchParams.set("image", profile.imageUrl);
        }

        return {
            title,
            description,
            openGraph: {
                title: `Meet ${profile.fullName}`,
                description,
                type: "website",
                siteName: "Rehabify Health",
                images: [
                    {
                        url: ogImageUrl.toString(),
                        width: 1200,
                        height: 630,
                        alt: `Book a session with ${profile.fullName}`,
                    },
                ],
            },
            twitter: {
                card: "summary_large_image",
                title: `Book with ${profile.fullName}`,
                description,
                images: [ogImageUrl.toString()],
            },
        };
    } catch {
        return {
            title: "Book a Session | Rehabify Health",
            description: "Book a physiotherapy session on Rehabify Health",
        };
    }
}

export default function BookingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
