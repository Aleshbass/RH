'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

export function FoundersCarousel() {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Update roles based on user feedback
    const testimonials = [
        {
            name: 'Mary Akinwola',
            role: 'Co-Founder | MSc HSIE Candidate University of Oxford',
            quote: 'We\'re building the technology infrastructure that empowers physiotherapists to deliver better patient outcomes.',
            image: '/founders/Mary.jpeg',
        },
        {
            name: 'Paul Francis',
            role: 'SWE & Chief Technology Officer',
            quote: 'Our platform bridges the gap between physiotherapists and patients, creating seamless experiences for all.',
            image: '/founders/Paul.jpeg',
        },
        {
            name: 'Zeenat',
            role: 'Product Manager',
            quote: 'Rehabify is more than a platform – it\'s a movement towards democratizing access to physiotherapy care.',
        },
        {
            name: 'Ademola Abass',
            role: 'Co-Founder',
            quote: 'Rehabify is transforming physiotherapy in Nigeria by making quality care accessible to everyone, everywhere.',
            image: '/founders/Ademola.jpg',
        },
        {
            name: 'David Olukayode',
            role: 'Executive and Clinical Head',
            quote: 'Driving innovation in healthcare technology to create sustainable solutions for physiotherapy clinics.',
            image: '/founders/David.jpeg',
        },
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentIndex((prevIndex) => (prevIndex + 1) % testimonials.length);
        }, 10000); // 10 seconds delay

        return () => clearInterval(interval);
    }, [testimonials.length]);

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
                        <span className="text-xs font-medium text-[#005b57]">Leadership</span>
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-bold text-[#005b57] tracking-tight">
                        Meet the Minds Behind Rehabify
                    </h2>
                    <p className="mt-3 text-base text-gray-600 max-w-2xl mx-auto">
                        Driven by passion, expertise, and a commitment to transforming healthcare in Nigeria.
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
                                <p className="text-base text-gray-800 font-medium mb-4 line-clamp-3">"{testimonials[prev].quote}"</p>
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-[#005b57] font-bold text-sm overflow-hidden relative">
                                        {testimonials[prev].image ? (
                                            <Image
                                                src={testimonials[prev].image}
                                                alt={testimonials[prev].name}
                                                fill
                                                className="object-cover"
                                            />
                                        ) : (
                                            testimonials[prev].name.charAt(0)
                                        )}
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
                                {/* Card Corner Markers */}
                                <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-gray-200 rounded-tl-2xl" />
                                <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-gray-200 rounded-tr-2xl" />
                                <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-gray-200 rounded-bl-2xl" />
                                <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-gray-200 rounded-br-2xl" />

                                <blockquote className="text-left">
                                    <p className="text-lg sm:text-xl text-gray-900 font-bold leading-relaxed mb-6">
                                        "{testimonials[current].quote}"
                                    </p>
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-xl bg-[#e6f0ef] flex items-center justify-center overflow-hidden border border-[#005b57]/10 relative">
                                            {testimonials[current].image ? (
                                                <Image
                                                    src={testimonials[current].image}
                                                    alt={testimonials[current].name}
                                                    fill
                                                    className="object-cover"
                                                />
                                            ) : (
                                                <span className="text-xl font-bold text-[#005b57]">
                                                    {testimonials[current].name.charAt(0)}
                                                </span>
                                            )}
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
                                <p className="text-base text-gray-800 font-medium mb-4 line-clamp-3">"{testimonials[next].quote}"</p>
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-[#005b57] font-bold text-sm overflow-hidden relative">
                                        {testimonials[next].image ? (
                                            <Image
                                                src={testimonials[next].image}
                                                alt={testimonials[next].name}
                                                fill
                                                className="object-cover"
                                            />
                                        ) : (
                                            testimonials[next].name.charAt(0)
                                        )}
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
