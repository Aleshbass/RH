import { Variants } from "framer-motion";

/**
 * Common animation variants using spring physics for a smooth feel
 * aligned with Rehabify Health's brand guidelines
 */

// Spring configuration for all animations
export const springConfig = {
  type: "spring" as const,
  stiffness: 260,
  damping: 20,
  mass: 1,
};

// Fade in animation with optional custom delay
export const fadeIn = (delay: number = 0): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      ...springConfig,
      delay,
    },
  },
});

// Fade in while moving up animation
export const fadeInUp = (delay: number = 0, y: number = 20): Variants => ({
  hidden: { opacity: 0, y },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      ...springConfig,
      delay,
    },
  },
});

// Fade in while moving down animation
export const fadeInDown = (delay: number = 0, y: number = -20): Variants => ({
  hidden: { opacity: 0, y },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      ...springConfig,
      delay,
    },
  },
});

// Staggered children animation - parent container
export const staggerContainer = (staggerChildren: number = 0.1): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren,
      delayChildren: 0.1,
    },
  },
});

// Scale animation (grow/shrink)
export const scale = (delay: number = 0, initialScale: number = 0.9): Variants => ({
  hidden: { opacity: 0, scale: initialScale },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      ...springConfig,
      delay,
    },
  },
});

// Custom animation for form fields appearing in sequence
export const formFieldAnimation = (index: number): Variants => ({
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      ...springConfig,
      delay: index * 0.1,
    },
  },
});

// Header shrink animation for the dynamic island style header
export const headerShrinkAnimation = {
  initial: {
    width: "100%",
    borderRadius: "0rem",
    backgroundColor: "#FAF6E7",
  },
  scrolled: {
    width: { desktop: "55%", mobile: "85%" },
    borderRadius: "2rem",
    backgroundColor: "#FAF6E7",
    boxShadow: "0px 4px 20px rgba(0, 46, 44, 0.1)",
    transition: {
      ...springConfig,
      duration: 0.3,
    },
  },
};

// Button hover and tap animations
export const buttonAnimation: Variants = {
  initial: { scale: 1 },
  hover: { 
    scale: 1.03, 
    boxShadow: "0px 4px 8px rgba(0, 91, 87, 0.2)",
    transition: springConfig
  },
  tap: { 
    scale: 0.98,
    transition: {
      ...springConfig,
      stiffness: 300,
      damping: 10,
    }
  },
};

// Card hover animation
export const cardHoverAnimation: Variants = {
  initial: { 
    y: 0, 
    boxShadow: "0px 2px 8px rgba(0, 46, 44, 0.1)" 
  },
  hover: { 
    y: -5, 
    boxShadow: "0px 8px 20px rgba(0, 46, 44, 0.15)",
    transition: springConfig
  },
};

// Drawer animation
export const drawerAnimation = {
  closed: {
    x: "100%",
    transition: springConfig,
  },
  open: {
    x: 0,
    transition: springConfig,
  },
};

// Modal animation
export const modalAnimation = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    transition: springConfig,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springConfig,
  },
};

// Sequential list item animation
export const listItemAnimation = (index: number): Variants => ({
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      ...springConfig,
      delay: index * 0.05,
    },
  },
});

// Progress animation for loading bars and indicators
export const progressAnimation = {
  initial: (isCompleted: boolean) => ({
    width: isCompleted ? "100%" : "0%",
  }),
  animate: {
    width: "100%",
    transition: {
      ...springConfig,
      duration: 0.8,
    },
  },
};
