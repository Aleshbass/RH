import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

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
    <div className="w-full">
      <div className="flex flex-col space-y-4">
        {steps.map((stepLabel, index) => {
          const stepNumber = index + 1;
          const isActive = currentStep > index;
          const isCurrent = currentStep === index + 1;
          const isClickable = isStepClickable(stepNumber);

          return (
            <div key={index} className="relative">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(stepNumber)}
                className={`group flex items-center w-full text-left transition-all duration-200 ${isClickable ? 'cursor-pointer' : 'cursor-default'
                  }`}
              >
                {/* Step Circle/Icon */}
                <div
                  className={`
                    relative flex items-center justify-center w-8 h-8 rounded-full border-2 mr-4 transition-all duration-300
                    ${isActive
                      ? 'bg-[#005b57] border-[#005b57] text-white'
                      : isCurrent
                        ? 'border-[#005b57] text-[#005b57] bg-white shadow-[0_0_0_4px_rgba(0,91,87,0.1)]'
                        : 'border-gray-200 text-gray-400 bg-white group-hover:border-gray-300'
                    }
                  `}
                >
                  {isActive ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <span className="text-sm font-semibold">{stepNumber}</span>
                  )}
                </div>

                {/* Step Label */}
                <div className="flex-1">
                  <span
                    className={`block text-sm font-medium transition-colors duration-200 ${isActive || isCurrent ? 'text-gray-900' : 'text-gray-500 group-hover:text-gray-700'
                      }`}
                  >
                    {stepLabel}
                  </span>
                  {isCurrent && (
                    <motion.span
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="block text-xs text-[#005b57] mt-0.5"
                    >
                      In Progress
                    </motion.span>
                  )}
                </div>
              </button>

              {/* Vertical Connector Line */}
              {index < steps.length - 1 && (
                <div
                  className={`absolute left-4 top-8 bottom-[-16px] w-[2px] -ml-[1px] transition-colors duration-500 ${isActive ? 'bg-[#005b57]' : 'bg-gray-100'
                    }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
