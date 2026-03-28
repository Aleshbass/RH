"use client";

import React, { useState, useRef, useEffect } from "react";
import { UserButton, useAuth } from "@clerk/nextjs";
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
      width={100}
      height={32}
      className="h-8 sm:h-10 w-auto"
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
        className="px-4 py-2 text-sm font-medium text-[#002e2c] hover:text-gray-500 transition-colors font-sans"
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
        className="px-4 py-2 text-sm font-medium text-[#002e2c] hover:text-gray-500 transition-colors flex items-center gap-1 font-sans"
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
          className="absolute left-1/2 z-50 mt-2 w-[520px] -translate-x-1/2 rounded-2xl bg-white p-0 shadow-[0_16px_48px_rgba(0,0,0,0.12)] border border-gray-100 overflow-hidden focus:outline-none"
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
          <div className="flex">
            {/* Links Section */}
            <div className="flex-1 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 mb-2">{item.name}</p>
              {item.items?.map((subItem, idx) => {
                const isExternalLink = subItem.href.startsWith('http');
                const linkContent = (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#e6f0ef] flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#005b57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">{subItem.name}</div>
                        {subItem.subtitle && (
                          <div className="text-xs text-gray-500 mt-0.5 whitespace-nowrap">{subItem.subtitle}</div>
                        )}
                      </div>
                    </div>
                  </>
                );

                return isExternalLink ? (
                  <a
                    key={idx}
                    href={subItem.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start px-3 py-2.5 mb-1 rounded-xl hover:bg-[#f0f8f7] transition-all duration-150 group"
                    onClick={onClick}
                  >
                    {linkContent}
                  </a>
                ) : (
                  <Link
                    key={idx}
                    href={subItem.href}
                    className="flex items-start px-3 py-2.5 mb-1 rounded-xl hover:bg-[#f0f8f7] transition-all duration-150 group"
                    onClick={onClick}
                  >
                    {linkContent}
                  </Link>
                );
              })}
            </div>

            {/* Image Panel */}
            <div className="w-[180px] shrink-0 relative">
              {item.name === "CPD" ? (
                <a href="https://www.rehabifylearn.com" target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                  <Image
                    src="/logos/images/www.rehabifylearn.com_(Nest Hub Max).webp"
                    alt="Rehabify Learn"
                    fill
                    className="object-cover"
                    priority
                  />
                </a>
              ) : (
                <Image
                  src={
                    item.name === "Professionals" ? "/logos/images/platform.jpeg" :
                      item.name === "Resources" ? "/logos/images/IMG_6328_a4bxtu.webp" :
                        "/logos/MainRehabify.svg"
                  }
                  alt={item.name}
                  fill
                  className="object-cover"
                  priority
                />
              )}
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
    name: "Professionals",
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
        href: "/start-treatment",
        subtitle: "Personalized rehabilitation programs"
      },
      {
        name: "For Family Members",
        href: "/platform/family",
        subtitle: "Support your loved one's recovery"
      },
    ],
  },
  { name: "Physio Register", type: "dropdown", items: [
      { name: "Register", href: "/physio-register/register", subtitle: "Add your credentials to the registry" },
      { name: "Verify a Physio", href: "/physio-register/verify", subtitle: "Check a physiotherapist's license" },
  ] },
  { name: "Pricing", href: "/pricing", type: "link" },
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
  const { isSignedIn, isLoaded } = useAuth();

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
          "relative z-[60] mx-auto hidden w-[95%] max-w-[1100px] mt-2 flex-row items-center justify-between px-4 py-2 lg:flex text-[#002e2c] font-sans rounded-2xl",
          "sm:px-6 md:px-8",
          "bg-white/70 backdrop-blur-xl border border-white/20 shadow-[0_4px_30px_rgba(0,0,0,0.06)]",
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

        <div className="flex items-center justify-end space-x-2 sm:space-x-4 flex-shrink-0">
          {isLoaded && isSignedIn ? (
            <UserButton />
          ) : (
            <NavbarButton href="/sign-in" className="text-sm px-3 py-1.5 sm:px-4 sm:py-2">Sign In</NavbarButton>
          )}
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
          "relative z-[60] mx-auto flex w-[95%] max-w-md flex-row items-center justify-between px-4 mt-2 py-1.5 lg:hidden text-[#002e2c] font-sans rounded-xl",
          "bg-white/70 backdrop-blur-xl border border-white/20 shadow-[0_4px_30px_rgba(0,0,0,0.06)]",
        )}
      >
        <div className="flex-shrink-0">
          <RehabifyLogo />
        </div>

        <div className="flex items-center space-x-2">
          {isLoaded && isSignedIn ? (
            <UserButton />
          ) : (
            <NavbarButton href="/sign-in" className="text-xs py-1.5 px-3">Sign In</NavbarButton>
          )}
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
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: "spring", duration: 0.4, bounce: 0 }}
          className="absolute inset-x-0 top-16 z-50 flex w-full flex-col items-start justify-start gap-4 rounded-xl bg-white px-6 py-8 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100 lg:hidden max-h-[80vh] overflow-y-auto"
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
                    className="flex items-center justify-between w-full px-4 py-2 text-sm font-medium text-[#002e2c] font-sans"
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
                            className="block hover:text-gray-500 hover:translate-x-1 transition-all duration-200 py-2 px-2 rounded-md hover:bg-[#F2EFE0] font-sans"
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
                            className="block hover:text-gray-500 hover:translate-x-1 transition-all duration-200 py-2 px-2 rounded-md hover:bg-[#F2EFE0] font-sans"
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
                  className="block px-4 py-2 text-sm font-medium text-[#002e2c] hover:text-gray-500 transition-colors font-sans"
                  onClick={() => setIsMobileMenuOpen(false)}
                  onMouseEnter={() => item.href ? prefetchRoute(item.href) : null}
                >
                  {item.name}
                </Link>
              )}
            </div>
          ))}


        </motion.div>
      )}
    </div>
  );
}