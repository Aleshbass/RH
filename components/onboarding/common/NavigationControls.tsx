import React from 'react';
import { motion } from 'framer-motion';

interface NavigationControlsProps {
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  isNextDisabled?: boolean;
  nextLabel?: string;
  prevLabel?: string;
  isSubmitting?: boolean;
}

export default function NavigationControls({
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  isNextDisabled = false,
  nextLabel = 'Continue',
  prevLabel = 'Back',
  isSubmitting = false
}: NavigationControlsProps) {
  const isLastStep = currentStep === totalSteps;
  const isFirstStep = currentStep === 1;

  const buttonVariants = {
    hover: { 
      scale: 1.03,
      boxShadow: "0px 4px 8px rgba(0, 91, 87, 0.2)"
    },
    tap: { scale: 0.98 },
    disabled: { 
      opacity: 0.6,
      scale: 1,
      boxShadow: "none"
    }
  };

  return (
    <div className="flex justify-between mt-8 pt-6 border-t border-[#E3DFD2]">
      {!isFirstStep ? (
        <motion.button
          type="button"
          onClick={onPrev}
          className="px-6 py-2.5 text-sm font-medium text-[#005b57] border border-[#005b57] rounded-md hover:bg-[#F1FFE9] focus:outline-none focus:ring-2 focus:ring-[#00cd0f] focus:ring-offset-2 transition-all"
          whileHover="hover"
          whileTap="tap"
          variants={buttonVariants}
          disabled={isSubmitting}
        >
          {prevLabel}
        </motion.button>
      ) : (
        <div></div> // Empty div to maintain the flex layout
      )}
      
      <motion.button
        type="button"
        onClick={onNext}
        disabled={isNextDisabled || isSubmitting}
        className={`px-6 py-2.5 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#00cd0f] focus:ring-offset-2 transition-all ${
          isNextDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        } bg-gradient-to-r from-[#002e2c] to-[#005b57]`}
        variants={buttonVariants}
        whileHover={!isNextDisabled && !isSubmitting ? "hover" : "disabled"}
        whileTap={!isNextDisabled && !isSubmitting ? "tap" : "disabled"}
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 100, damping: 15 }}
      >
        {isSubmitting ? (
          <div className="flex items-center">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
            <span>{isLastStep ? 'Submitting...' : 'Saving...'}</span>
          </div>
        ) : (
          <span>{isLastStep ? 'Complete' : nextLabel}</span>
        )}
      </motion.button>
    </div>
  );
}
