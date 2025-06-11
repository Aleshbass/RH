import React from 'react';
import { motion } from 'framer-motion';

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export default function StepIndicator({ 
  steps, 
  currentStep, 
  onStepClick 
}: StepIndicatorProps) {
  const isStepClickable = (stepIndex: number) => {
    return !!onStepClick && stepIndex < currentStep;
  };

  return (
    <div className="w-full py-6 px-4">
      <div className="flex items-center justify-center">
        {steps.map((stepLabel, index) => {
          const isActive = currentStep > index;
          const isCurrent = currentStep === index + 1;
          
          return (
            <React.Fragment key={index}>
              {/* Step Circle */}
              <motion.button
                type="button"
                disabled={!isStepClickable(index + 1)}
                onClick={() => isStepClickable(index + 1) && onStepClick?.(index + 1)}
                className={`relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                  isActive
                    ? 'bg-[#005b57] border-[#005b57] text-white'
                    : isCurrent
                    ? 'border-[#005b57] text-[#005b57] bg-white'
                    : 'border-gray-300 text-gray-400 bg-white'
                } ${isStepClickable(index + 1) ? 'cursor-pointer hover:scale-105' : 'cursor-default'}`}
                whileHover={isStepClickable(index + 1) ? { scale: 1.05 } : {}}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ 
                  delay: index * 0.1,
                  type: "spring",
                  stiffness: 100,
                  damping: 10
                }}
              >
                <span className="text-sm font-medium">{index + 1}</span>
                
                {/* Step Label */}
                <span 
                  className={`absolute top-12 text-xs whitespace-nowrap ${
                    isActive || isCurrent ? 'text-[#002e2c] font-medium' : 'text-gray-500'
                  }`}
                >
                  {stepLabel}
                </span>
                
                {/* Current Step Indicator */}
                {isCurrent && (
                  <motion.span
                    className="absolute w-14 h-14 rounded-full"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1.2, opacity: 0 }}
                    transition={{ 
                      repeat: Infinity,
                      duration: 1.5,
                      ease: "easeOut"
                    }}
                    style={{
                      border: '2px solid #005b57'
                    }}
                  />
                )}
              </motion.button>
              
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <motion.div 
                  className={`flex-1 h-0.5 mx-2 max-w-16 ${
                    currentStep > index + 1 ? 'bg-[#005b57]' : 'bg-gray-300'
                  }`}
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ delay: (index * 0.1) + 0.2 }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
