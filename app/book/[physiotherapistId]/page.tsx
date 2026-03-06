"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import Image from "next/image";
import { Loader2, Clock, ArrowRight } from "lucide-react";

// Session type options for physiotherapy
const SESSION_TYPES = [
    {
        id: "initial",
        title: "Initial Consultation",
        description: "Comprehensive assessment & treatment plan",
        duration: 60,
    },
    {
        id: "followup",
        title: "Follow-up Session",
        description: "Standard therapy session",
        duration: 45,
    },
    {
        id: "quick",
        title: "Quick Check-in",
        description: "Brief progress review",
        duration: 30,
    },
];

export default function PhysioBookingPage() {
    const params = useParams();
    const router = useRouter();
    const rawParam = params.physiotherapistId as string;

    // Try resolving as a slug first
    const slugResult = useQuery(api.marketplace.search.resolveBookingSlug, { slug: rawParam });

    // Determine the real userId — slug match takes priority, otherwise try raw param as ID
    const resolvedUserId = slugResult?.userId ?? (rawParam as Id<"users">);

    // Fetch physio profile with the resolved user ID
    const profile = useQuery(api.marketplace.search.getPhysiotherapistProfile, {
        physiotherapistId: resolvedUserId,
    });

    if (profile === undefined || slugResult === undefined) {
        return (
            <div className="min-h-screen bg-[#121212] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                    <div className="bg-[#1a1a1a] rounded-xl border border-gray-800 p-8 text-center">
                        {/* Icon */}
                        <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-6">
                            <svg
                                className="w-8 h-8 text-gray-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                />
                            </svg>
                        </div>

                        {/* Title */}
                        <h1 className="text-xl font-semibold text-white mb-2">
                            Profile Not Available
                        </h1>

                        {/* Description */}
                        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                            This physiotherapist hasn't enabled their booking page yet.
                            <br />
                            <span className="text-gray-500">
                                If you're the owner of this profile, please enable your profile
                                on the marketplace to start accepting bookings.
                            </span>
                        </p>

                        {/* CTA for physios */}
                        <div className="space-y-3">
                            <a
                                href="/dashboard/physiotherapist/settings"
                                className="block w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
                            >
                                Enable My Profile
                            </a>
                            <a
                                href="/marketplace"
                                className="block w-full py-3 px-4 border border-gray-700 hover:border-gray-600 text-gray-300 rounded-lg font-medium transition-colors"
                            >
                                Browse Other Physiotherapists
                            </a>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-6 text-center">
                        <p className="text-gray-600 text-xs">Powered by</p>
                        <p className="text-gray-500 text-sm font-medium">Rehabify Health</p>
                    </div>
                </div>
            </div>
        );
    }

    const handleSessionSelect = (duration: number) => {
        router.push(`/book/${rawParam}/${duration}`);
    };

    return (
        <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Profile Card */}
                <div className="bg-[#1a1a1a] rounded-xl border border-gray-800 p-6 mb-6">
                    {/* Profile Image & Name */}
                    <div className="flex items-center gap-4 mb-2">
                        {profile.imageUrl ? (
                            <Image
                                src={profile.imageUrl}
                                alt={profile.fullName}
                                width={64}
                                height={64}
                                className="rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-teal-600 flex items-center justify-center text-white text-xl font-bold">
                                {profile.fullName
                                    .split(" ")
                                    .map((n: string) => n[0])
                                    .join("")}
                            </div>
                        )}
                    </div>
                    <h1 className="text-xl font-bold text-white mt-4">
                        {profile.fullName}
                    </h1>
                    {profile.specializations && profile.specializations.length > 0 && (
                        <p className="text-gray-400 text-sm mt-1">
                            {profile.specializations.slice(0, 2).join(" • ")}
                        </p>
                    )}
                </div>

                {/* Session Types */}
                <div className="space-y-3">
                    {SESSION_TYPES.map((session) => (
                        <button
                            key={session.id}
                            onClick={() => handleSessionSelect(session.duration)}
                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl p-5 text-left hover:border-gray-700 hover:bg-[#222] transition-all group"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-white font-semibold text-lg">
                                        {session.title}
                                    </h3>
                                    {session.description && (
                                        <p className="text-gray-500 text-sm mt-1">
                                            {session.description}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-1 mt-2 text-gray-400">
                                        <Clock className="w-4 h-4" />
                                        <span className="text-sm">{session.duration}m</span>
                                    </div>
                                </div>
                                <ArrowRight className="w-5 h-5 text-gray-600 group-hover:text-teal-500 transition-colors" />
                            </div>
                        </button>
                    ))}
                </div>

                {/* Footer */}
                <div className="mt-8 text-center">
                    <p className="text-gray-600 text-sm">Powered by</p>
                    <p className="text-gray-400 font-medium">Rehabify Health</p>
                </div>
            </div>
        </div>
    );
}
