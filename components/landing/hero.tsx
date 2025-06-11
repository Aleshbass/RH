"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { NavbarButton } from '@/components/ui/resizable-navbar';
import HeroBackground from './HeroBackground';
import FeatureTag from './FeatureTag';

// For TanStack Query prefetching
import { useQueryClient } from '@tanstack/react-query';

export function LandingHero() {
  // Use TanStack Query for prefetching
  const queryClient = useQueryClient();
  
  // Prefetch the sign-up page on hover
  const prefetchSignUp = () => {
    // This would typically prefetch data needed for the sign-up page
    queryClient.prefetchQuery({
      queryKey: ['signUpPageData'],
      queryFn: () => Promise.resolve({
        prefetched: true,
        timestamp: Date.now()
      })
    });
  };

  return (
    <section className="relative min-h-screen overflow-hidden">
      <HeroBackground />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-16">
        <div className="flex flex-col lg:flex-row items-center justify-around lg:justify-between min-h-screen max-w-6xl mx-auto">
          {/* Left Content Area */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full lg:w-[42%] text-center lg:text-left pt-8 lg:pt-0 mb-8 lg:mb-0 order-2 lg:order-1"
          >
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-gray-900 mb-4 sm:mb-6 font-pally">
              Welcome to the Future of Physiotherapy Management
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-gray-700 mb-6 sm:mb-8 font-pally">
              Rehabify simplifies clinical physiotherapy management by 
              connecting clinic owners, physiotherapists, and patients in one 
              powerful platform
            </p>
            <Link href="/sign-up" passHref>
              <NavbarButton 
                as="span" // Instruct NavbarButton to render as a span
                variant="primary" 
                className="group bg-green-500 hover:bg-green-600 text-white font-semibold py-3 sm:py-4 px-6 sm:px-8 rounded-full inline-flex items-center transition-all duration-300 transform hover:scale-105"
                onMouseEnter={prefetchSignUp}
              >
                <span className="mr-2">Get Started</span>
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </NavbarButton>
            </Link>
          </motion.div>
          
          {/* Right Image Area - Mobile optimized */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="w-full lg:w-[50%] relative flex items-center justify-center h-[50vh] sm:h-[55vh] md:h-[60vh] lg:items-end lg:h-[calc(100vh-4rem)] lg:self-end order-1 lg:order-2"
          >
            <div className="relative w-full h-full flex items-end justify-center">
              <Image 
                src="/logos/images/rehabify-hero-image.webp"
                alt="Healthcare professional" 
                fill
                style={{ objectFit: "contain" }}
                className="max-h-[90%] max-w-[90%] lg:translate-y-[15vh]"
                priority
              />
              
              {/* Feature tags - Mobile optimized */}
              <div className="absolute inset-0">
                {/* Hide on smallest screens, show on sm and up */}
                <div className="hidden sm:block">
                  <FeatureTag 
                    text="Clinic Owners"
                    position="top-12 right-8"
                    delay="600"
                    size="md"
                  />
                </div>
                
                {/* Feature info card - Mobile optimized */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.7 }}
                  className="absolute bottom-0 left-0 right-0 sm:left-auto sm:right-4 sm:bottom-auto sm:top-1/3 bg-white/90 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 mx-auto sm:mx-0 max-w-[90%] sm:max-w-xs shadow-lg"
                >
                  <ul className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
                    <li className="text-gray-800 font-medium">
                      <span className="text-green-600 font-semibold">Simplified management</span> for clinic owners
                    </li>
                    <li className="text-gray-800 font-medium">
                      <span className="text-green-600 font-semibold">Multilingual accessibility</span> for patients
                    </li>
                    <li className="text-gray-800 font-medium">
                      <span className="text-green-600 font-semibold">Better tools</span> for patient care by PTs
                    </li>
                  </ul>
                </motion.div>
                
                {/* Mobile-optimized feature tags */}
                <div className="hidden sm:block">
                  <FeatureTag 
                    text="Physios"
                    position="bottom-32 right-16 sm:bottom-40 sm:right-40"
                    delay="800"
                    size="md"
                  />
                  
                  <FeatureTag 
                    text="Patients"
                    position="bottom-20 right-8 sm:bottom-24 sm:right-24"
                    delay="900"
                    size="md"
                  />
                </div>
                
                {/* Mobile-only floating feature tags */}
                <div className="sm:hidden">
                  <motion.span 
                    className="absolute top-[20%] left-[10%] bg-green-100/80 backdrop-blur-sm px-2 py-1 rounded-full shadow-md text-xs font-medium text-green-800 font-pally"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                    whileInView={{ 
                      y: [0, -5, 0],
                      transition: { duration: 3, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }
                    }}
                  >
                    Clinic Owners
                  </motion.span>
                  
                  <motion.span 
                    className="absolute top-[30%] right-[15%] bg-green-100/80 backdrop-blur-sm px-2 py-1 rounded-full shadow-md text-xs font-medium text-green-800 font-pally"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.8 }}
                    whileInView={{ 
                      y: [0, -5, 0],
                      transition: { duration: 4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }
                    }}
                  >
                    Physios
                  </motion.span>
                  
                  <motion.span 
                    className="absolute top-[45%] left-[20%] bg-green-100/80 backdrop-blur-sm px-2 py-1 rounded-full shadow-md text-xs font-medium text-green-800 font-pally"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.9 }}
                    whileInView={{ 
                      y: [0, -5, 0],
                      transition: { duration: 3.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }
                    }}
                  >
                    Patients
                  </motion.span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
