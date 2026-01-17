"use client";

import { useState, useEffect } from "react";
import { Id } from "@/convex/_generated/dataModel";
import {
    Copy,
    Check,
    Link2,
    Share2,
    QrCode,
    Mail,
    MessageCircle,
    Twitter,
    ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ShareableBookingLinkProps {
    physiotherapistId: Id<"users">;
    physiotherapistName?: string;
    variant?: "default" | "compact" | "button-only";
    className?: string;
}

export default function ShareableBookingLink({
    physiotherapistId,
    physiotherapistName,
    variant = "default",
    className,
}: ShareableBookingLinkProps) {
    const [copied, setCopied] = useState(false);
    const [bookingUrl, setBookingUrl] = useState("");

    useEffect(() => {
        if (typeof window !== "undefined") {
            setBookingUrl(`${window.location.origin}/book/${physiotherapistId}`);
        }
    }, [physiotherapistId]);

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(bookingUrl);
            setCopied(true);
            toast.success("Booking link copied!", {
                description: "Share it with your patients",
            });
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Failed to copy");
        }
    };

    const shareVia = (method: "email" | "whatsapp" | "twitter") => {
        const text = physiotherapistName
            ? `Book a physiotherapy session with ${physiotherapistName}`
            : "Book a physiotherapy session";

        switch (method) {
            case "email":
                window.open(
                    `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(
                        `${text}:\n\n${bookingUrl}`
                    )}`
                );
                break;
            case "whatsapp":
                window.open(
                    `https://wa.me/?text=${encodeURIComponent(`${text}: ${bookingUrl}`)}`
                );
                break;
            case "twitter":
                window.open(
                    `https://twitter.com/intent/tweet?text=${encodeURIComponent(
                        text
                    )}&url=${encodeURIComponent(bookingUrl)}`
                );
                break;
        }
    };

    // Compact variant - just the button with popover
    if (variant === "button-only") {
        return (
            <Button
                onClick={copyToClipboard}
                variant="outline"
                size="sm"
                className={cn(
                    "gap-2 border-teal-600 text-teal-600 hover:bg-teal-50",
                    className
                )}
            >
                {copied ? (
                    <>
                        <Check className="w-4 h-4" />
                        Copied!
                    </>
                ) : (
                    <>
                        <Link2 className="w-4 h-4" />
                        Copy Booking Link
                    </>
                )}
            </Button>
        );
    }

    // Compact variant with share popover
    if (variant === "compact") {
        return (
            <div className={cn("flex items-center gap-2", className)}>
                <Button
                    onClick={copyToClipboard}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                >
                    {copied ? (
                        <Check className="w-4 h-4 text-green-600" />
                    ) : (
                        <Copy className="w-4 h-4" />
                    )}
                    {copied ? "Copied!" : "Copy Link"}
                </Button>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Share2 className="w-4 h-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-2">
                        <div className="grid gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="justify-start gap-2"
                                onClick={() => shareVia("email")}
                            >
                                <Mail className="w-4 h-4" />
                                Email
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="justify-start gap-2"
                                onClick={() => shareVia("whatsapp")}
                            >
                                <MessageCircle className="w-4 h-4" />
                                WhatsApp
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="justify-start gap-2"
                                onClick={() => shareVia("twitter")}
                            >
                                <Twitter className="w-4 h-4" />
                                Twitter
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        );
    }

    // Default full variant
    return (
        <div
            className={cn(
                "bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-xl p-5",
                className
            )}
        >
            <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-teal-600 rounded-lg">
                    <Link2 className="w-4 h-4 text-white" />
                </div>
                <div>
                    <h3 className="font-semibold text-gray-900">Your Booking Link</h3>
                    <p className="text-sm text-gray-500">
                        Share this link to let patients book sessions
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
                <Input
                    readOnly
                    value={bookingUrl}
                    className="font-mono text-sm bg-white border-teal-200 focus:border-teal-400"
                />
                <Button
                    onClick={copyToClipboard}
                    className={cn(
                        "shrink-0 gap-2 transition-all",
                        copied
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-teal-600 hover:bg-teal-700"
                    )}
                >
                    {copied ? (
                        <>
                            <Check className="w-4 h-4" />
                            Copied!
                        </>
                    ) : (
                        <>
                            <Copy className="w-4 h-4" />
                            Copy
                        </>
                    )}
                </Button>
            </div>

            {/* Share options */}
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Share via:</span>
                <div className="flex gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-teal-100"
                        onClick={() => shareVia("email")}
                    >
                        <Mail className="w-4 h-4 text-gray-600" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-teal-100"
                        onClick={() => shareVia("whatsapp")}
                    >
                        <MessageCircle className="w-4 h-4 text-gray-600" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-teal-100"
                        onClick={() => shareVia("twitter")}
                    >
                        <Twitter className="w-4 h-4 text-gray-600" />
                    </Button>
                </div>
                <div className="ml-auto">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-teal-600 hover:text-teal-700 hover:bg-teal-100 gap-1"
                        onClick={() => window.open(bookingUrl, "_blank")}
                    >
                        Preview
                        <ExternalLink className="w-3 h-3" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
