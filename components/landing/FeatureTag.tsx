import React from 'react';
import { motion } from 'framer-motion';

interface FeatureTagProps {
  text: string;
  position: string;
  delay: string;
  size?: 'sm' | 'md' | 'lg';
}

const FeatureTag: React.FC<FeatureTagProps> = ({ text, position, delay, size = 'md' }) => {
  // Floating animation that moves slightly up and down
  const floatingAnimation = {
    initial: { opacity: 0, y: 20 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.5,
        delay: parseFloat(delay) / 1000,
      }
    },
    // Add continuous floating effect
    whileInView: {
      y: [0, -8, 0],
      transition: {
        duration: 4,
        repeat: Infinity,
        repeatType: "reverse" as const,
        ease: "easeInOut",
        delay: parseFloat(delay) / 1000,
      }
    }
  };

  return (
    <motion.div 
      initial="initial"
      animate="animate"
      whileInView="whileInView"
      variants={floatingAnimation}
      className={`absolute ${position} bg-green-100/80 backdrop-blur-sm rounded-full shadow-md ${
        size === 'md' 
          ? 'px-4 py-2' 
          : size === 'lg' 
            ? 'px-5 py-2.5' 
            : 'px-3 py-1.5'
      }`}
    >
      <span className={`font-medium text-green-800 font-pally ${
        size === 'md' 
          ? 'text-base' 
          : size === 'lg' 
            ? 'text-lg' 
            : 'text-sm'
      }`}>{text}</span>
    </motion.div>
  );
};

export default FeatureTag;
