"use client";

import React, { useState, useRef, useEffect } from "react";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { motion } from "motion/react";
import Link from "next/link";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  NavbarButton,
  MobileNavToggle,
} from "@/components/ui/resizable-navbar";

// Logo component for Rehabify Health
const RehabifyLogo = () => (
  <Link href="/" className="relative flex items-center">
    <Image
      src="/logos/MainRehabify.svg"
      alt="Rehabify Health"
      width={80}
      height={80}
      className="h-16 w-16"
    />
  </Link>
);

// Define interface for dropdown item with subtitle
interface DropdownItem {
  name: string;
  href: string;
  subtitle?: string;
}

// Define interface for navigation item
interface NavItem {
  name: string;
  href?: string;
  type: "link" | "dropdown";
  items?: DropdownItem[];
}

interface NavItemProps {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: (fromItem?: string) => void;
}

// Desktop Navigation Item Component
const NavItemComponent = ({ item, isActive, onClick, onMouseEnter, onMouseLeave }: NavItemProps) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Track hover state using refs to avoid stale closures and unnecessary re-renders
  const hoveringRef = useRef(false);
  const closeTimeoutRef = useRef<number | null>(null);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimeout();
    // Small delay to allow moving pointer from trigger to dropdown without closing
    closeTimeoutRef.current = window.setTimeout(() => {
      if (!hoveringRef.current) {
        onMouseLeave(item.name);
      }
    }, 120);
  };

  useEffect(() => {
    return () => clearCloseTimeout();
  }, []);

  // For normal links
  if (item.type === "link") {
    return (
      <Link 
        href={item.href || '#'}
        className="px-4 py-2 text-sm font-medium text-[#002e2c] hover:text-blue-600 transition-colors font-pally"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={() => onMouseLeave(item.name)}
      >
        {item.name}
      </Link>
    );
  }

  // For dropdown menus
  const handleItemMouseEnter = () => {
    clearCloseTimeout();
    hoveringRef.current = true;
    onMouseEnter();
  };

  const handleItemMouseLeave = () => {
    hoveringRef.current = false;
    scheduleClose();
  };

  return (
    <div 
      className="relative"
      onMouseEnter={handleItemMouseEnter}
      onMouseLeave={handleItemMouseLeave}
    >
      <button 
        className="px-4 py-2 text-sm font-medium text-[#002e2c] hover:text-blue-600 transition-colors flex items-center gap-1 font-pally"
        onClick={onClick}
      >
        {item.name}

        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          className={`ml-1 h-3 w-3 transition-transform duration-200 ${isActive ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {isActive && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="absolute left-1/2 z-50 mt-2 w-[380px] -translate-x-1/2 rounded-xl bg-[#FAF6E7] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.1)] border border-[#002e2c]/10 focus:outline-none"
          ref={dropdownRef}
          onMouseEnter={() => {
            clearCloseTimeout();
            hoveringRef.current = true;
          }}
          onMouseLeave={() => {
            hoveringRef.current = false;
            scheduleClose();
          }}
        >
          <div className="flex min-h-[180px]">
            <div className="w-1/2 py-1 pr-4">
              {item.items?.map((subItem, idx) => {
                const isExternalLink = subItem.href.startsWith('http');

                return isExternalLink ? (
                  <a
                    key={idx}
                    href={subItem.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-2 mb-3 rounded-md hover:bg-[#F2EFE0] hover:text-blue-600 hover:translate-x-1 transition-all duration-200"
                    onClick={onClick}
                  >
                    <div className="text-sm font-medium text-[#002e2c] font-pally">
                      {subItem.name}
                    </div>
                    {subItem.subtitle && (
                      <div className="text-xs text-[#002e2c]/70 mt-0.5 font-pally">
                        {subItem.subtitle}
                      </div>
                    )}
                  </a>
                ) : (
                  <Link
                    key={idx}
                    href={subItem.href}
                    className="block px-4 py-2 mb-3 rounded-md hover:bg-[#F2EFE0] hover:text-blue-600 hover:translate-x-1 transition-all duration-200"
                    onClick={onClick}
                  >
                    <div className="text-sm font-medium text-[#002e2c] font-pally">
                      {subItem.name}
                    </div>
                    {subItem.subtitle && (
                      <div className="text-xs text-[#002e2c]/70 mt-0.5 font-pally">
                        {subItem.subtitle}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
            <div className="w-1/2 flex items-center justify-center pl-2">
              <div className="w-full h-[170px] overflow-hidden rounded-lg">
                {item.name === "CPD" ? (
                  <a href="https://www.rehabifylearn.com" target="_blank" rel="noopener noreferrer" className="block w-full h-full cursor-pointer transition-transform duration-200 hover:scale-105">
                    <Image 
                      src="/logos/images/www.rehabifylearn.com_(Nest Hub Max).webp"
                      alt="Rehabify Learn"
                      width={500}
                      height={500}
                      className="w-full h-full object-cover rounded-lg shadow-md"
                      priority
                    />
                  </a>
                ) : (
                  <Image 
                    src={
                      item.name === "Platform" ? "/logos/images/platform.jpeg" : 
                      item.name === "Resources" ? "/logos/images/IMG_6328_a4bxtu.webp" : 
                      "/logos/MainRehabify.svg"
                    }
                    alt={item.name}
                    width={item.name === "Platform" || item.name === "Resources" ? 500 : 200}
                    height={item.name === "Platform" || item.name === "Resources" ? 500 : 200}
                    className={item.name === "Platform" || item.name === "Resources" ? "w-full h-full object-cover rounded-lg shadow-md" : "w-full h-full object-contain opacity-70"}
                    priority
                  />
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

// Navigation link data with subtitles
const navLinks: NavItem[] = [
  {
    name: "Platform",
    type: "dropdown",
    items: [
      { 
        name: "For Clinics", 
        href: "/platform/clinics",
        subtitle: "Complete practice management solution" 
      },
      { 
        name: "For Physiotherapists", 
        href: "/platform/physiotherapists",
        subtitle: "Tools to streamline patient care" 
      },
      { 
        name: "For Patients", 
        href: "/platform/patients",
        subtitle: "Personalized rehabilitation programs" 
      },
      { 
        name: "For Family Members", 
        href: "/platform/family",
        subtitle: "Support your loved one's recovery" 
      },
    ],
  },
  { name: "Find a Physio", href: "/find-a-physio", type: "link" },
  { name: "Forum", href: "/forum", type: "link" },
  { name: "Pricing", href: "/#pricing", type: "link" },
  {
    name: "CPD",
    type: "dropdown",
    items: [
      { 
        name: "Courses", 
        href: "https://www.rehabifylearn.com",
        subtitle: "Continuing professional development" 
      },
      { 
        name: "Workshops", 
        href: "https://www.rehabifylearn.com/courses",
        subtitle: "Hands-on learning opportunities" 
      },
      { 
        name: "Certificates", 
        href: "https://www.rehabifylearn.com/about",
        subtitle: "Track your professional development" 
      },
    ],
  },
  {
    name: "Resources",
    type: "dropdown",
    items: [
      { 
        name: "Blog", 
        href: "/blog",
        subtitle: "Latest rehabilitation insights" 
      },
      { 
        name: "FAQs", 
        href: "/faqs",
        subtitle: "Common questions answered" 
      },
      { 
        name: "Support", 
        href: "/support",
        subtitle: "Get help with our platform" 
      },
    ],
  },

];

export default function Header() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleItemHover = (itemName: string) => {
    setActiveItem(itemName);
  };

  const handleCloseDropdowns = (fromItem?: string) => {
    // If called without a specific item (e.g., on click), close unconditionally
    if (!fromItem) {
      setActiveItem(null);
      return;
    }
    // Otherwise, only close if we're still closing the same item that is active
    setActiveItem((prev) => (prev === fromItem ? null : prev));
  };

  // Use motion's useScroll hook for better animation integration
  const [visible, setVisible] = useState(false);
  
  // Use window scroll events for more reliable scroll detection
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      if (scrollPosition > 100) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    };

    // Add scroll event listener
    window.addEventListener('scroll', handleScroll);
    
    // Initial check
    handleScroll();
    
    // Clean up
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Use TanStack Query for prefetching
  const queryClient = useQueryClient();
  
  // Prefetch function for navigation links
  const prefetchRoute = (route: string) => {
    queryClient.prefetchQuery({
      queryKey: [`route-${route}`],
      queryFn: () => Promise.resolve({
        prefetched: true,
        route: route,
        timestamp: Date.now()
      })
    });
  };

  return (
    <div ref={scrollRef} className="fixed inset-x-0 top-0 z-50 w-full h-16">
      {/* Desktop Navigation */}
      <motion.div
        animate={{
          backdropFilter: visible ? "blur(12px)" : "none",
          boxShadow: visible
            ? "0 4px 24px rgba(34, 42, 53, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(34, 42, 53, 0.02)"
            : "none",
        }}
        transition={{
          duration: 0.3,
        }}
        className={cn(
          "relative z-[60] mx-auto hidden w-[90%] max-w-[1100px] flex-row items-center justify-between px-4 py-3 lg:flex text-[#002e2c] font-pally rounded-2xl",
          "sm:px-6 md:px-8", // Responsive padding
        )}
      >
        <div className="flex-shrink-0">
          <RehabifyLogo />
        </div>

        <nav className="flex items-center space-x-1 mx-auto">
          {navLinks.map((item, idx) => (
            <NavItemComponent
              key={idx}
              item={item}
              isActive={activeItem === item.name}
              onClick={handleCloseDropdowns}
              onMouseEnter={() =>
                item.type === 'dropdown'
                  ? handleItemHover(item.name)
                  : handleCloseDropdowns()
              }
              onMouseLeave={handleCloseDropdowns}
            />
          ))}
        </nav>

        <div className="flex items-center justify-end space-x-2 sm:space-x-4 flex-shrink-0 min-w-48 sm:min-w-56">
          <SignedOut>
            <NavbarButton href="/sign-in" className="text-sm px-3 py-1.5 sm:px-4 sm:py-2">Sign In</NavbarButton>
            <NavbarButton href="/sign-up" variant="secondary" className="text-sm px-3 py-1.5 sm:px-4 sm:py-2">
              Get Started
            </NavbarButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </motion.div>

      {/* Mobile Navigation */}
      <motion.div
        animate={{
          backdropFilter: visible ? "blur(12px)" : "none",
          boxShadow: visible
            ? "0 4px 24px rgba(34, 42, 53, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(34, 42, 53, 0.02)"
            : "none",
        }}
        transition={{
          duration: 0.3,
        }}
        className={cn(
          "relative z-[60] mx-auto flex w-[90%] max-w-md flex-row items-center justify-between px-4 py-2 lg:hidden text-[#002e2c] font-pally rounded-xl",
        )}
      >
        <div className="flex-shrink-0">
          <RehabifyLogo />
        </div>

        <div className="flex items-center space-x-2">
          <SignedOut>
            <NavbarButton href="/sign-in" className="text-xs py-1.5 px-3">Sign In</NavbarButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
          <div className="relative z-[70]">
            <div className="cursor-pointer">
              <MobileNavToggle 
                isOpen={isMobileMenuOpen} 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-x-0 top-16 z-50 flex w-full flex-col items-start justify-start gap-4 rounded-xl bg-[#FAF6E7] px-6 py-8 shadow-[0_8px_30px_rgba(0,0,0,0.1)] border border-[#002e2c]/10 lg:hidden max-h-[80vh] overflow-y-auto"
        >
          {navLinks.map((item, idx) => (
            <div key={idx} className="py-2 w-full">
              {item.type === 'dropdown' ? (
                <div>
                  <button 
                    onClick={() => {
                      // Toggle the visibility of this dropdown's content
                      const currentActive = activeItem;
                      if (currentActive === item.name) {
                        setActiveItem(null); // collapse if already open
                      } else {
                        setActiveItem(item.name); // expand this one
                      }
                    }}
                    className="flex items-center justify-between w-full px-4 py-2 text-sm font-medium text-[#002e2c] font-pally"
                  >
                    <span>{item.name}</span>
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                      className={`ml-1 h-3 w-3 transition-transform duration-200 ${activeItem === item.name ? 'rotate-180' : ''}`}
                    >
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                  {activeItem === item.name && (
                    <div className="ml-4 space-y-2">
                    {item.items?.map((subItem, subIdx) => {
                      const isExternalLink = subItem.href.startsWith('http');
                      
                      return isExternalLink ? (
                        <a
                          key={subIdx}
                          href={subItem.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block hover:text-blue-600 hover:translate-x-1 transition-all duration-200 py-2 px-2 rounded-md hover:bg-[#F2EFE0] font-pally"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <div className="text-sm font-medium text-[#002e2c]">
                            {subItem.name}
                          </div>
                          {subItem.subtitle && (
                            <div className="text-xs text-[#002e2c]/70 mt-0.5">
                              {subItem.subtitle}
                            </div>
                          )}
                        </a>
                      ) : (
                        <Link
                          key={subIdx}
                          href={subItem.href}
                          className="block hover:text-blue-600 hover:translate-x-1 transition-all duration-200 py-2 px-2 rounded-md hover:bg-[#F2EFE0] font-pally"
                          onClick={() => setIsMobileMenuOpen(false)}
                          onMouseEnter={() => prefetchRoute(subItem.href)}
                        >
                          <div className="text-sm font-medium text-[#002e2c]">
                            {subItem.name}
                          </div>
                          {subItem.subtitle && (
                            <div className="text-xs text-[#002e2c]/70 mt-0.5">
                              {subItem.subtitle}
                            </div>
                          )}
                        </Link>
                      );
                    })}
                    </div>
                  )}
                </div>
              ) : (
                <Link 
                  href={item.href || '#'} 
                  className="block px-4 py-2 text-sm font-medium text-[#002e2c] hover:text-blue-600 transition-colors font-pally"
                  onClick={() => setIsMobileMenuOpen(false)}
                  onMouseEnter={() => item.href ? prefetchRoute(item.href) : null}
                >
                  {item.name}
                </Link>
              )}
            </div>
          ))}
          
          <SignedOut>
            <div className="w-full pt-4 border-t border-[#002e2c]/10">
              <NavbarButton 
                href="/sign-up" 
                variant="secondary" 
                className="w-full justify-center"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Get Started
              </NavbarButton>
            </div>
          </SignedOut>
        </motion.div>
      )}
    </div>
  );
}