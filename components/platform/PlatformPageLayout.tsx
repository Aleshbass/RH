"use client";

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Feature {
    title: string;
    description: string;
    icon?: React.ReactNode;
}

interface PlatformPageLayoutProps {
    title: string;
    subtitle: string;
    description: string;
    features: Feature[];
    ctaText?: string;
    ctaLink?: string;
    heroImage?: string; // URL to image
}

export default function PlatformPageLayout({
    title,
    subtitle,
    description,
    features,
    ctaText = "Get Started",
    ctaLink = "/sign-up",
    heroImage,
}: PlatformPageLayoutProps) {
    return (
        <div className="min-h-screen bg-[#FAF6E7] text-[#002e2c] pt-24 pb-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Hero Section */}
                <div className="flex flex-col lg:flex-row items-center gap-12 mb-24">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="flex-1 text-center lg:text-left"
                    >
                        <h1 className="text-5xl md:text-6xl font-cal mb-6 leading-tight">
                            {title}
                        </h1>
                        <p className="text-xl md:text-2xl font-sans text-[#002e2c]/70 mb-8 font-light">
                            {subtitle}
                        </p>
                        <p className="text-lg font-sans text-[#002e2c]/80 mb-8 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                            {description}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                            <Link
                                href={ctaLink}
                                className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-[#FAF6E7] bg-[#002e2c] rounded-full hover:bg-[#002e2c]/90 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200"
                            >
                                {ctaText}
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Link>
                            <Link
                                href="/contact"
                                className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-[#002e2c] bg-transparent border-2 border-[#002e2c]/10 rounded-full hover:bg-[#002e2c]/5 transition-colors"
                            >
                                Contact Sales
                            </Link>
                        </div>
                    </motion.div>

                    {heroImage && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                            className="flex-1 relative"
                        >
                            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-[#002e2c]/10 aspect-video bg-white/50">
                                {/* Placeholder for actual image if not provided or while loading */}
                                <div className="absolute inset-0 bg-gradient-to-br from-[#002e2c]/5 to-[#002e2c]/10 flex items-center justify-center text-[#002e2c]/20 font-cal text-4xl">
                                    {title}
                                </div>
                                {/* We would use Next.js Image here if we had real assets */}
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Features Grid (Bento Style) */}
                <div className="mb-24">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-cal mb-4">Everything you need</h2>
                        <p className="text-lg text-[#002e2c]/60 max-w-2xl mx-auto">
                            Comprehensive tools designed specifically for your needs.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((feature, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4, delay: idx * 0.1 }}
                                className={cn(
                                    "p-8 rounded-3xl bg-white border border-[#002e2c]/5 shadow-sm hover:shadow-md transition-shadow",
                                    idx === 0 || idx === 3 ? "md:col-span-2" : ""
                                )}
                            >
                                <div className="h-12 w-12 rounded-xl bg-[#FAF6E7] flex items-center justify-center text-[#002e2c] mb-6">
                                    {feature.icon || <CheckCircle2 className="h-6 w-6" />}
                                </div>
                                <h3 className="text-2xl font-cal mb-3">{feature.title}</h3>
                                <p className="text-[#002e2c]/70 leading-relaxed">
                                    {feature.description}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Bottom CTA */}
                <div className="rounded-3xl bg-[#002e2c] text-[#FAF6E7] p-12 md:p-20 text-center relative overflow-hidden">
                    <div className="relative z-10 max-w-3xl mx-auto">
                        <h2 className="text-4xl md:text-5xl font-cal mb-6">
                            Ready to transform your experience?
                        </h2>
                        <p className="text-xl text-[#FAF6E7]/80 mb-10 font-light">
                            Join thousands of others on Rehabify Health today.
                        </p>
                        <Link
                            href={ctaLink}
                            className="inline-flex items-center justify-center px-10 py-5 text-lg font-medium text-[#002e2c] bg-[#FAF6E7] rounded-full hover:bg-white transition-colors shadow-xl hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-200"
                        >
                            {ctaText}
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                    </div>

                    {/* Decorative background elements */}
                    <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#FAF6E7] blur-3xl"></div>
                        <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-[#FAF6E7] blur-3xl"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
