"use client";

import React, { useState, useRef, useEffect } from "react";
import { UserButton, useAuth } from "@clerk/nextjs";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  NavbarButton,
  MobileNavToggle,
} from "@/components/ui/resizable-navbar";
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  Building2,
  UserCheck,
  Heart,
  ShieldCheck,
  UserPlus,
  FileCheck,
  Tag,
  GraduationCap,
  BookOpen,
  Users,
  Award,
  FolderOpen,
  Newspaper,
  HelpCircle,
  Headphones,
  ArrowRight,
  Stethoscope,
  ExternalLink,
} from "lucide-react";

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

// Define interface for dropdown item with subtitle and icon
interface DropdownItem {
  name: string;
  href: string;
  subtitle?: string;
  icon?: React.ElementType;
  badge?: string;
}

// Define interface for navigation item
interface NavItem {
  name: string;
  href?: string;
  type: "link" | "dropdown";
  icon?: React.ElementType;
  badge?: string;
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

// Enriched navigation link data with icons & subtitles
const navLinks: NavItem[] = [
  {
    name: "For Patients",
    href: "/start-treatment",
    type: "link",
    icon: Sparkles,
    badge: "Get Care",
  },
  {
    name: "Professionals",
    type: "dropdown",
    icon: Stethoscope,
    items: [
      {
        name: "For Clinics",
        href: "/platform/clinics",
        subtitle: "Complete practice management solution",
        icon: Building2,
      },
      {
        name: "For Physiotherapists",
        href: "/platform/physiotherapists",
        subtitle: "Tools to streamline patient care",
        icon: UserCheck,
      },
      {
        name: "For Family Members",
        href: "/platform/family",
        subtitle: "Support your loved one's recovery",
        icon: Heart,
      },
    ],
  },
  {
    name: "Physio Register",
    type: "dropdown",
    icon: ShieldCheck,
    items: [
      {
        name: "Register",
        href: "/physio-register/register",
        subtitle: "Add your credentials to the registry",
        icon: UserPlus,
        badge: "Official",
      },
      {
        name: "Verify a Physio",
        href: "/physio-register/verify",
        subtitle: "Check a physiotherapist's license",
        icon: FileCheck,
      },
    ],
  },
  {
    name: "Pricing",
    href: "/pricing",
    type: "link",
    icon: Tag,
  },
  {
    name: "CPD",
    type: "dropdown",
    icon: GraduationCap,
    badge: "Learn",
    items: [
      {
        name: "Courses",
        href: "https://www.rehabifylearn.com",
        subtitle: "Continuing professional development",
        icon: BookOpen,
      },
      {
        name: "Workshops",
        href: "https://www.rehabifylearn.com/courses",
        subtitle: "Hands-on learning opportunities",
        icon: Users,
      },
      {
        name: "Certificates",
        href: "https://www.rehabifylearn.com/about",
        subtitle: "Track your professional development",
        icon: Award,
      },
    ],
  },
  {
    name: "Resources",
    type: "dropdown",
    icon: FolderOpen,
    items: [
      {
        name: "Blog",
        href: "/blog",
        subtitle: "Latest rehabilitation insights",
        icon: Newspaper,
      },
      {
        name: "FAQs",
        href: "/faqs",
        subtitle: "Common questions answered",
        icon: HelpCircle,
      },
      {
        name: "Support",
        href: "/support",
        subtitle: "Get help with our platform",
        icon: Headphones,
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

  // Lock body scroll when mobile nav is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileMenuOpen]);

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

      {/* Mobile Navigation Header Bar */}
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

      {/* Enhanced Mobile Navigation Backdrop & Floating Sheet Modal */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-md lg:hidden"
            />

            {/* Mobile Sheet Modal */}
            <motion.div
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="fixed top-3 inset-x-3 sm:inset-x-6 sm:max-w-lg sm:mx-auto z-[80] max-h-[90vh] flex flex-col bg-white/95 backdrop-blur-2xl rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] border border-gray-100 overflow-hidden lg:hidden"
            >
              {/* Sheet Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100/80 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <RehabifyLogo />
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#e6f0ef] text-[#005b57]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#005b57] animate-pulse"></span>
                    Care Platform
                  </span>
                </div>
                <MobileNavToggle
                  isOpen={isMobileMenuOpen}
                  onClick={() => setIsMobileMenuOpen(false)}
                />
              </div>

              {/* Scrollable Nav Content */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 font-sans scrollbar-thin scrollbar-thumb-gray-200">
                {/* Hero Action Card */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#004744] via-[#005b57] to-[#00807b] p-4 text-white shadow-md">
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="space-y-1 max-w-[210px]">
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-teal-200 bg-white/10 px-2 py-0.5 rounded-full backdrop-blur-sm">
                        <Sparkles className="w-3 h-3 text-teal-300" />
                        Quick Access
                      </span>
                      <h4 className="text-sm font-bold text-white leading-snug">
                        Start Your Recovery Today
                      </h4>
                      <p className="text-xs text-teal-100/90 leading-tight">
                        Connect with top certified physiotherapists now.
                      </p>
                    </div>
                    <a
                      href={`https://wa.me/2348061525811?text=${encodeURIComponent("Hi Joy! 👋🏾 I need help with my recovery.")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="shrink-0 flex items-center gap-1.5 bg-white text-[#004744] px-3.5 py-2 rounded-xl text-xs font-bold shadow-lg hover:bg-teal-50 active:scale-95 transition-all"
                    >
                      Book Now
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  {/* Subtle Background Glow */}
                  <div className="absolute -bottom-8 -right-8 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" />
                </div>

                {/* Main Navigation Items */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-3 py-1">
                    Navigation Menu
                  </p>

                  {navLinks.map((item, idx) => {
                    const CategoryIcon = item.icon;
                    const isDropdown = item.type === "dropdown";
                    const isExpanded = activeItem === item.name;

                    if (!isDropdown) {
                      return (
                        <Link
                          key={idx}
                          href={item.href || "#"}
                          onClick={() => setIsMobileMenuOpen(false)}
                          onMouseEnter={() => item.href ? prefetchRoute(item.href) : null}
                          className="flex items-center justify-between px-3.5 py-3 rounded-2xl bg-gray-50/70 hover:bg-[#e6f0ef]/60 text-[#002e2c] transition-all duration-200 group active:scale-[0.99]"
                        >
                          <div className="flex items-center gap-3">
                            {CategoryIcon && (
                              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-[#005b57] shadow-sm border border-gray-100 group-hover:bg-[#005b57] group-hover:text-white transition-colors">
                                <CategoryIcon className="w-4 h-4" />
                              </div>
                            )}
                            <span className="text-sm font-semibold">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.badge && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#005b57] text-white">
                                {item.badge}
                              </span>
                            )}
                            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#005b57] group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </Link>
                      );
                    }

                    return (
                      <div key={idx} className="rounded-2xl border border-gray-100 bg-gray-50/40 overflow-hidden transition-all">
                        <button
                          onClick={() => {
                            setActiveItem(isExpanded ? null : item.name);
                          }}
                          className={cn(
                            "flex items-center justify-between w-full px-3.5 py-3 text-left transition-colors",
                            isExpanded ? "bg-[#e6f0ef]/70 text-[#005b57]" : "hover:bg-gray-100/60 text-[#002e2c]"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            {CategoryIcon && (
                              <div className={cn(
                                "w-9 h-9 rounded-xl flex items-center justify-center transition-colors shadow-sm border border-gray-100",
                                isExpanded ? "bg-[#005b57] text-white" : "bg-white text-[#005b57]"
                              )}>
                                <CategoryIcon className="w-4 h-4" />
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold flex items-center gap-2">
                                {item.name}
                                {item.badge && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e6f0ef] text-[#005b57]">
                                    {item.badge}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-100">
                              {item.items?.length || 0}
                            </span>
                            <ChevronDown
                              className={cn(
                                "w-4 h-4 text-gray-500 transition-transform duration-300",
                                isExpanded && "rotate-180 text-[#005b57]"
                              )}
                            />
                          </div>
                        </button>

                        {/* Animated Dropdown Accordion Content */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: "easeInOut" }}
                              className="overflow-hidden bg-white/80 border-t border-gray-100/60"
                            >
                              <div className="p-2 space-y-1">
                                {item.items?.map((subItem, subIdx) => {
                                  const SubIcon = subItem.icon || ChevronRight;
                                  const isExternal = subItem.href.startsWith("http");

                                  const Content = (
                                    <div className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-[#e6f0ef]/50 active:bg-[#e6f0ef] transition-all group">
                                      <div className="w-8 h-8 rounded-lg bg-[#e6f0ef] text-[#005b57] flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                                        <SubIcon className="w-4 h-4" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-bold text-gray-900 group-hover:text-[#005b57] transition-colors">
                                            {subItem.name}
                                          </span>
                                          {subItem.badge ? (
                                            <span className="text-[9px] font-bold text-[#005b57] bg-[#e6f0ef] px-1.5 py-0.5 rounded-md">
                                              {subItem.badge}
                                            </span>
                                          ) : isExternal ? (
                                            <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-[#005b57]" />
                                          ) : (
                                            <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#005b57] group-hover:translate-x-0.5 transition-all" />
                                          )}
                                        </div>
                                        {subItem.subtitle && (
                                          <p className="text-[11px] text-gray-500 mt-0.5 leading-tight line-clamp-1">
                                            {subItem.subtitle}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  );

                                  return isExternal ? (
                                    <a
                                      key={subIdx}
                                      href={subItem.href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={() => setIsMobileMenuOpen(false)}
                                    >
                                      {Content}
                                    </a>
                                  ) : (
                                    <Link
                                      key={subIdx}
                                      href={subItem.href}
                                      onClick={() => setIsMobileMenuOpen(false)}
                                      onMouseEnter={() => prefetchRoute(subItem.href)}
                                    >
                                      {Content}
                                    </Link>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sheet Footer Bar */}
              <div className="p-4 bg-gray-50/90 border-t border-gray-100 flex items-center justify-between gap-3">
                {isLoaded && isSignedIn ? (
                  <div className="flex items-center gap-3">
                    <UserButton />
                    <span className="text-xs font-semibold text-gray-700">Account Active</span>
                  </div>
                ) : (
                  <Link
                    href="/sign-in"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex-1 text-center py-2.5 px-4 rounded-xl text-xs font-bold text-[#002e2c] bg-white border border-gray-200 shadow-sm hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    Sign In to Account
                  </Link>
                )}
                <Link
                  href="/support"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold text-[#005b57] bg-[#e6f0ef] hover:bg-[#d8e9e7] active:scale-95 transition-all shrink-0"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Support</span>
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}