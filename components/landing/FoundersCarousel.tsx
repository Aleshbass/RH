'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';

const testimonials = [
    {
        name: 'Amaka O.',
        role: 'Teacher, Ikeja',
        quote: 'I spent ₦85,000 on pain medications that didn\'t work. Four hospitals, three different diagnoses. When my doctor finally referred me through Rehabify, I got matched with a physiotherapist the same day. Six sessions later, I\'m back to teaching without pain — and it cost less than one private clinic visit.',
    },
    {
        name: 'Dr. Chidera N.',
        role: 'Physiotherapist, Lekki',
        quote: 'Before Rehabify, I was seeing maybe 2 patients a week. Now I\'m fully booked. The upfront package payments mean I actually have cash flow. And I don\'t spend a kobo on marketing.',
    },
    {
        name: 'Dr. Efe A.',
        role: 'General Practitioner, Gbagada',
        quote: 'I used to scribble physio referrals on prescription pads and hope for the best. Now I click once, my patient gets verified options, and I actually know if they followed through. Game changer.',
    },
];

export function FoundersCarousel() {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentIndex((prevIndex) => (prevIndex + 1) % testimonials.length);
        }, 8000);

        return () => clearInterval(interval);
    }, []);

    const getVisibleIndices = () => {
        const prev = (currentIndex - 1 + testimonials.length) % testimonials.length;
        const next = (currentIndex + 1) % testimonials.length;
        return { prev, current: currentIndex, next };
    };

    const { prev, current, next } = getVisibleIndices();

    return (
        <section className="py-12 sm:py-16 bg-gray-50 overflow-hidden">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                {/* Section Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-gray-200 shadow-sm mb-4">
                        <span className="text-xs font-medium text-[#005b57]">Testimonials</span>
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-bold text-[#005b57] tracking-tight">
                        Trusted by Nigerians
                    </h2>
                    <p className="mt-3 text-base text-gray-600 max-w-2xl mx-auto">
                        Real stories from real patients, physiotherapists, and doctors using Rehabify.
                    </p>
                </div>

                {/* Carousel */}
                <div className="relative max-w-6xl mx-auto">
                    {/* Crosshair Markers */}
                    <div className="absolute -top-6 -left-4 w-4 h-4 border-t border-l border-gray-300 z-10" />
                    <div className="absolute -top-6 -right-4 w-4 h-4 border-t border-r border-gray-300 z-10" />
                    <div className="absolute -bottom-6 -left-4 w-4 h-4 border-b border-l border-gray-300 z-10" />
                    <div className="absolute -bottom-6 -right-4 w-4 h-4 border-b border-r border-gray-300 z-10" />

                    <div className="relative h-[320px] flex items-center justify-center perspective-1000">
                        {/* Previous Card (Blurred & Faded) */}
                        <motion.div
                            key={`prev-${prev}`}
                            className="absolute w-full max-w-md opacity-40 blur-[2px] scale-90 -translate-x-[55%] z-0 hidden lg:block"
                            initial={{ x: -100, opacity: 0 }}
                            animate={{ x: "-55%", opacity: 0.4 }}
                            transition={{ duration: 0.5 }}
                        >
                            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm h-full">
                                <p className="text-base text-gray-800 font-medium mb-4 line-clamp-3">&ldquo;{testimonials[prev].quote}&rdquo;</p>
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-[#e6f0ef] flex items-center justify-center text-[#005b57] font-bold text-sm">
                                        {testimonials[prev].name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-900 text-xs">{testimonials[prev].name}</p>
                                        <p className="text-[10px] text-gray-500">{testimonials[prev].role}</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Current Card (Focused) */}
                        <motion.div
                            key={`current-${current}`}
                            className="absolute w-full max-w-lg z-20 px-4"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.5 }}
                        >
                            <div className="bg-white rounded-2xl p-8 shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-gray-100 relative">
                                {/* Quote Icon */}
                                <Quote className="w-8 h-8 text-[#005b57]/20 mb-4" />

                                {/* Card Corner Markers */}
                                <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-gray-200 rounded-tl-2xl" />
                                <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-gray-200 rounded-tr-2xl" />
                                <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-gray-200 rounded-bl-2xl" />
                                <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-gray-200 rounded-br-2xl" />

                                <blockquote className="text-left">
                                    <p className="text-lg sm:text-xl text-gray-900 font-bold leading-relaxed mb-6">
                                        &ldquo;{testimonials[current].quote}&rdquo;
                                    </p>
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-xl bg-[#e6f0ef] flex items-center justify-center border border-[#005b57]/10">
                                            <span className="text-xl font-bold text-[#005b57]">
                                                {testimonials[current].name.charAt(0)}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900 text-base">
                                                {testimonials[current].name}
                                            </p>
                                            <p className="text-xs text-[#005b57] font-medium mt-0.5">
                                                {testimonials[current].role}
                                            </p>
                                        </div>
                                    </div>
                                </blockquote>
                            </div>
                        </motion.div>

                        {/* Next Card (Blurred & Faded) */}
                        <motion.div
                            key={`next-${next}`}
                            className="absolute w-full max-w-md opacity-40 blur-[2px] scale-90 translate-x-[55%] z-0 hidden lg:block"
                            initial={{ x: 100, opacity: 0 }}
                            animate={{ x: "55%", opacity: 0.4 }}
                            transition={{ duration: 0.5 }}
                        >
                            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm h-full">
                                <p className="text-base text-gray-800 font-medium mb-4 line-clamp-3">&ldquo;{testimonials[next].quote}&rdquo;</p>
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-[#e6f0ef] flex items-center justify-center text-[#005b57] font-bold text-sm">
                                        {testimonials[next].name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-900 text-xs">{testimonials[next].name}</p>
                                        <p className="text-[10px] text-gray-500">{testimonials[next].role}</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>

                    {/* Indicators */}
                    <div className="flex justify-center gap-2 mt-8">
                        {testimonials.map((_, index) => (
                            <button
                                key={index}
                                onClick={() => setCurrentIndex(index)}
                                className={`h-1.5 rounded-full transition-all duration-300 ${index === currentIndex
                                    ? 'w-8 bg-[#005b57]'
                                    : 'w-1.5 bg-gray-300 hover:bg-gray-400'
                                    }`}
                                aria-label={`Go to testimonial ${index + 1}`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
