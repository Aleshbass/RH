import React, { ReactNode } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import StepIndicator from './StepIndicator';
import { ChevronLeft } from '@/components/icons';

interface OnboardingLayoutProps {
  children: ReactNode;
  steps: string[];
  currentStep: number;
  title: string;
  subtitle?: string;
  onStepClick?: (step: number) => void;
}

export default function OnboardingLayout({
  children,
  steps,
  currentStep,
  title,
  subtitle,
  onStepClick,
}: OnboardingLayoutProps) {

  return (
    <div className="min-h-screen bg-gray-50/50 sm:bg-[#F8FAFC] flex flex-col font-sans">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 sm:hidden">
        <div className="px-4 h-14 flex items-center justify-between">
          <Link href="/" className="p-2 -ml-2 text-gray-600 hover:text-gray-900">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="font-semibold text-gray-900 text-sm">
            Step {currentStep} of {steps.length}
          </div>
          <div className="w-9" /> {/* Spacer for balance */}
        </div>
        <div className="h-1 bg-gray-100 w-full">
          <motion.div
            className="h-full bg-[#005b57]"
            initial={{ width: `${((currentStep - 1) / steps.length) * 100}%` }}
            animate={{ width: `${(currentStep / steps.length) * 100}%` }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          />
        </div>
      </header>

      {/* Desktop Header / Breadcrumbs */}
      <div className="hidden sm:block w-full max-w-4xl mx-auto px-4 py-6">
        <nav aria-label="Breadcrumb" className="text-sm text-gray-500 mb-8">
          <ol className="flex items-center gap-2">
            <li><Link href="/" className="hover:text-[#005b57] transition-colors">Home</Link></li>
            <li className="text-gray-300">/</li>
            <li>Onboarding</li>
            <li className="text-gray-300">/</li>
            <li className="text-gray-900 font-medium">{title}</li>
          </ol>
        </nav>
      </div>

      <main className="flex-1 w-full max-w-4xl mx-auto sm:px-4 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Sidebar Steps (Desktop) */}
          <div className="hidden md:block md:col-span-4 lg:col-span-3">
            <div className="sticky top-8">
              <StepIndicator
                steps={steps}
                currentStep={currentStep}
                onStepClick={onStepClick}
              />
            </div>
          </div>

          {/* Main Content Area */}
          <div className="md:col-span-8 lg:col-span-9">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="bg-white sm:rounded-2xl sm:shadow-sm sm:border sm:border-gray-100 p-6 sm:p-8 md:p-10 min-h-[60vh]"
              >
                <div className="mb-8">
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight mb-2">
                    {steps[currentStep - 1]}
                  </h1>
                  {subtitle && (
                    <p className="text-gray-500 text-base sm:text-lg leading-relaxed">
                      {subtitle}
                    </p>
                  )}
                </div>

                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
