import React, { ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import StepIndicator from './StepIndicator';

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
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {

        stiffness: 100,
        damping: 15
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F1FFE9] flex flex-col">
      {/* Main content */}
      <motion.main 
        className="flex-1 mx-auto w-full max-w-4xl px-3 sm:px-4 py-6 md:py-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-gray-600">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link href="/" className="hover:underline text-[#005b57]">Home</Link></li>
            <li className="px-1">/</li>
            <li>Onboarding</li>
            <li className="px-1">/</li>
            <li className="truncate max-w-[50%]">{title}</li>
            <li className="px-1">/</li>
            <li className="text-gray-500">Step {currentStep} of {steps.length}</li>
          </ol>
        </nav>
        {subtitle ? (
          <p className="sr-only">{subtitle}</p>
        ) : null}

        {/* Title/subtitle removed to keep layout minimal; use form-level headings instead */}
        
        <motion.div variants={itemVariants}>
          <StepIndicator 
            steps={steps} 
            currentStep={currentStep} 
            onStepClick={onStepClick} 
          />
        </motion.div>
        
        <motion.div 
          variants={itemVariants}
          className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 md:p-8"
        >
          {children}
        </motion.div>
      </motion.main>
    </div>
  );
}
