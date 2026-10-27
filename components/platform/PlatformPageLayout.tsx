"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "@/components/icons";
import { MarketingVideo } from "@/components/landing/MarketingVideo";
import { PairingShapes } from "@/components/learn/shared";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

export interface PlatformFeature {
    title: string;
    /** One short sentence */
    description: string;
}

interface PlatformPageLayoutProps {
    /** Hero heading */
    title: string;
    /** One sentence under the heading */
    description: string;
    features: PlatformFeature[];
    featuresTitle?: string;
    ctaText?: string;
    ctaLink?: string;
    /** Photo beside the hero text, shown until a video is set */
    image?: { src: string; alt: string; unoptimized?: boolean; position?: string };
    /** Cloudinary demo film from lib/marketingVideos.ts; replaces the photo once set */
    videoUrl?: string;
    videoTitle?: string;
    closingTitle?: string;
    closingText?: string;
    /** Replaces the main link with a button (e.g. opening the Book a demo dialog) */
    primaryAction?: { label: string; onClick: () => void };
    /** Replaces "Contact us" as the second button */
    secondaryCta?: { label: string; href: string };
    /** Extra sections after the features (e.g. plans) */
    children?: ReactNode;
}

const primary =
    "group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
const secondaryOnLight =
    "inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-[15px] font-semibold text-rh-ink ring-1 ring-inset ring-rh-ink/10 transition-colors hover:bg-rh-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink";
const secondaryOnInk =
    "inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-semibold text-white ring-1 ring-inset ring-white/25 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime";

function Rise({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
    const reduce = useReducedMotion();
    return (
        <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, ease: EASE, delay }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

function PrimaryCta({
    href,
    label,
    onClick,
    onInk = false,
}: {
    href: string;
    label: string;
    onClick?: () => void;
    onInk?: boolean;
}) {
    const className = cn(primary, onInk ? "focus-visible:ring-rh-lime focus-visible:ring-offset-rh-ink" : "focus-visible:ring-rh-ink");
    const content = (
        <>
            {label}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </>
    );
    return onClick ? (
        <button type="button" onClick={onClick} className={className}>
            {content}
        </button>
    ) : (
        <Link href={href} className={className}>
            {content}
        </Link>
    );
}

export default function PlatformPageLayout({
    title,
    description,
    features,
    featuresTitle = "What you get",
    ctaText = "Get started",
    ctaLink = "/sign-up",
    image,
    videoUrl,
    videoTitle = "Rehabify demo",
    closingTitle = "Ready to get started?",
    closingText,
    primaryAction,
    secondaryCta = { label: "Contact us", href: "/contact" },
    children,
}: PlatformPageLayoutProps) {
    const reduce = useReducedMotion();
    const hasVisual = Boolean(videoUrl || image);

    return (
        <div className="min-h-screen overflow-x-hidden bg-rh-canvas text-rh-ink">
            {/* Hero */}
            <section className="px-4 pb-16 pt-32 sm:px-6 sm:pt-40 lg:pb-24">
                <div className={cn("mx-auto grid max-w-6xl items-center gap-10 lg:gap-14", hasVisual && "lg:grid-cols-[1fr_1.05fr]")}>
                    <motion.div
                        initial={reduce ? false : { opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.55, ease: EASE }}
                    >
                        <h1 className="max-w-xl text-[40px] font-bold leading-[1.04] tracking-tight text-rh-ink sm:text-[56px]">{title}</h1>
                        <p className="mt-5 max-w-lg text-lg font-medium leading-relaxed text-rh-ink/70 sm:text-xl">{description}</p>
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <PrimaryCta href={ctaLink} label={primaryAction?.label ?? ctaText} onClick={primaryAction?.onClick} />
                            <Link href={secondaryCta.href} className={secondaryOnLight}>
                                {secondaryCta.label}
                            </Link>
                        </div>
                    </motion.div>

                    {hasVisual && (
                        <motion.div
                            initial={reduce ? false : { opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
                        >
                            {videoUrl ? (
                                <MarketingVideo url={videoUrl} title={videoTitle} />
                            ) : (
                                image && (
                                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[2rem] bg-rh-ink">
                                        <Image
                                            src={image.src}
                                            alt={image.alt}
                                            fill
                                            priority
                                            unoptimized={image.unoptimized}
                                            sizes="(min-width: 1024px) 600px, 100vw"
                                            className="object-cover"
                                            style={image.position ? { objectPosition: image.position } : undefined}
                                        />
                                    </div>
                                )
                            )}
                        </motion.div>
                    )}
                </div>
            </section>

            {/* Features: one line each, so a numbered list rather than cards */}
            <section className="px-4 pb-20 sm:px-6 lg:pb-28">
                <div className="mx-auto max-w-6xl rounded-[2rem] bg-white px-6 py-10 sm:px-10 sm:py-14 lg:px-14">
                    <Rise>
                        <h2 className="max-w-xl text-[30px] font-bold leading-[1.1] tracking-tight text-rh-ink sm:text-[40px]">{featuresTitle}</h2>
                    </Rise>
                    <Rise delay={0.06}>
                        <ol className="mt-8 grid gap-x-12 sm:mt-10 md:grid-cols-2">
                            {features.map((feature, i) => (
                                <li key={feature.title} className="flex gap-5 border-t border-rh-ink/10 py-5">
                                    <span aria-hidden className="w-6 shrink-0 pt-0.5 text-[15px] tabular-nums text-rh-ink/40">
                                        {String(i + 1).padStart(2, "0")}
                                    </span>
                                    <div className="min-w-0">
                                        <h3 className="text-[17px] font-semibold leading-snug text-rh-ink">{feature.title}</h3>
                                        <p className="mt-1 text-[15px] font-medium leading-relaxed text-rh-ink/70 sm:text-base">{feature.description}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </Rise>
                </div>
            </section>

            {children}

            {/* Closing call to action */}
            <section className="px-4 pb-20 sm:px-6 lg:pb-28">
                <Rise className="mx-auto max-w-6xl">
                    <div className="relative overflow-hidden rounded-[2rem] bg-rh-ink px-6 py-12 text-white sm:rounded-[2.5rem] sm:px-12 sm:py-16 lg:px-16">
                        <PairingShapes className="-bottom-16 -right-12 hidden h-64 w-64 sm:block" />
                        <div className="relative max-w-2xl">
                            <h2 className="text-[32px] font-bold leading-[1.1] tracking-tight text-white sm:text-[44px]">{closingTitle}</h2>
                            {closingText && <p className="mt-4 text-lg font-medium leading-relaxed text-white/75">{closingText}</p>}
                            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                <PrimaryCta href={ctaLink} label={primaryAction?.label ?? ctaText} onClick={primaryAction?.onClick} onInk />
                                <Link href={secondaryCta.href} className={secondaryOnInk}>
                                    {secondaryCta.label}
                                </Link>
                            </div>
                        </div>
                    </div>
                </Rise>
            </section>
        </div>
    );
}
