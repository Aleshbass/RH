import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import logoImage from '@/public/logos/favicon/apple-touch-icon.png'; // Assuming path from /public
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
      {/* Header */}
      <header className="bg-[#FAF6E7] py-4 px-6 shadow-sm">
        <div className="container mx-auto flex justify-center">
          <Image 
            src={logoImage} 
            alt="Rehabify Health" 
            width={64}
            height={64}
            className="h-16 w-16" // className can be kept for additional styling if needed, or removed if width/height props are sufficient
          />
        </div>
      </header>
      
      {/* Main content */}
      <motion.main 
        className="flex-1 container mx-auto max-w-4xl px-4 py-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants} className="text-center mb-6">
          <h1 className="text-3xl font-bold text-[#002e2c]">{title}</h1>
          {subtitle && <p className="mt-2 text-[#005b57]">{subtitle}</p>}
        </motion.div>
        
        <motion.div variants={itemVariants}>
          <StepIndicator 
            steps={steps} 
            currentStep={currentStep} 
            onStepClick={onStepClick} 
          />
        </motion.div>
        
        <motion.div 
          variants={itemVariants}
          className="bg-white rounded-2xl shadow-lg p-6 md:p-8"
        >
          {children}
        </motion.div>
      </motion.main>
      
      {/* Footer */}
      <footer className="bg-[#FAF6E7] py-4 px-6">
        <div className="container mx-auto text-center text-sm text-[#002e2c]">
          <p>&copy; {new Date().getFullYear()} Rehabify Health. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
