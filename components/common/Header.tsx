"use client";

import React, { useState, useRef, useEffect } from "react";
import { UserButton, useAuth } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  NavbarButton,
  MobileNavToggle,
} from "@/components/ui/resizable-navbar";
import { LearnAnnouncementBar } from "@/components/learn/LearnAnnouncementBar";
import { DashboardButton, GetStartedList, GetStartedMenu } from "@/components/auth/GetStartedMenu";
import { ChevronDown } from "@/components/icons";

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

interface MenuLink {
  name: string;
  href: string;
  badge?: string;
  // Shown indented under this link (e.g. the programmes under For physiotherapists)
  children?: MenuLink[];
}

interface NavItem {
  name: string;
  href?: string;
  items?: MenuLink[];
}

// About us: FAQs and Support become sections of the About page once it is built
const navLinks: NavItem[] = [
  {
    name: "Your care",
    items: [
      { name: "For patients", href: "/platform/patients" },
      { name: "For family members", href: "/platform/family" },
    ],
  },
  {
    name: "For professionals",
    items: [
      {
        name: "For physiotherapists",
        href: "/platform/physiotherapists",
        children: [
          { name: "MSK Specialist Program", href: "/learn", badge: "New" },
          { name: "Physio register", href: "/physio-register/register" },
        ],
      },
      { name: "For clinics", href: "/platform/clinics" },
      { name: "For partners", href: "/partnerships" },
    ],
  },
  {
    name: "About us",
    items: [
      { name: "About Rehabify", href: "/about" },
      { name: "Blog", href: "/blog" },
      { name: "FAQs", href: "/#faqs" },
      { name: "Support", href: "/contact" },
    ],
  },
  { name: "Pricing", href: "/pricing" },
];

const NewBadge = ({ label }: { label: string }) => (
  <span className="rounded-full bg-rh-lime px-2 py-0.5 text-[10px] font-bold text-rh-ink">{label}</span>
);

interface NavItemProps {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: (fromItem?: string) => void;
}

// Desktop Navigation Item Component
const NavItemComponent = ({ item, isActive, onClick, onMouseEnter, onMouseLeave }: NavItemProps) => {
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

  const triggerClass = "whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium text-rh-ink transition-colors hover:bg-rh-ink/[0.05] font-sans";

  // For normal links
  if (!item.items) {
    return (
      <Link
        href={item.href || '#'}
        className={triggerClass}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={() => onMouseLeave(item.name)}
      >
        {item.name}
      </Link>
    );
  }

  const menuLinkClass = "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-rh-ink transition-colors hover:bg-rh-canvas";

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        clearCloseTimeout();
        hoveringRef.current = true;
        onMouseEnter();
      }}
      onMouseLeave={() => {
        hoveringRef.current = false;
        scheduleClose();
      }}
    >
      <button
        type="button"
        aria-expanded={isActive}
        aria-haspopup="true"
        className={cn(triggerClass, "flex items-center gap-1.5")}
        onClick={isActive ? onClick : onMouseEnter}
      >
        {item.name}
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isActive ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute left-1/2 z-50 mt-2 w-64 -translate-x-1/2 rounded-2xl bg-white p-2 shadow-lift ring-1 ring-rh-ink/[0.06]"
          >
            {item.items.map((link) => (
              <div key={link.href}>
                <Link href={link.href} className={menuLinkClass} onClick={onClick}>
                  {link.name}
                  {link.badge && <NewBadge label={link.badge} />}
                </Link>
                {link.children && (
                  <div className="mb-1 ml-3 border-l border-rh-ink/10 pl-2">
                    {link.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-rh-ink/70 transition-colors hover:bg-rh-canvas hover:text-rh-ink"
                        onClick={onClick}
                      >
                        {child.name}
                        {child.badge && <NewBadge label={child.badge} />}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function Header() {
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [mobileOpenItem, setMobileOpenItem] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isSignedIn, isLoaded } = useAuth();

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

  // Escape closes whichever menu is open
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveItem(null);
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [visible, setVisible] = useState(false);

  // Use window scroll events for more reliable scroll detection
  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 100);
    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const closeMobile = () => setIsMobileMenuOpen(false);

  const barShadow = {
    backdropFilter: visible ? "blur(12px)" : "none",
    boxShadow: visible
      ? "0 4px 24px rgba(11, 19, 18, 0.08), 0 1px 2px rgba(11, 19, 18, 0.06)"
      : "none",
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 w-full h-16">
      {/* MSK Specialist Program announcement (only while an admin has a cohort live) */}
      <LearnAnnouncementBar collapsed={visible} />

      {/* Desktop Navigation */}
      <motion.div
        animate={barShadow}
        transition={{ duration: 0.3 }}
        className={cn(
          "relative z-[60] mx-auto hidden w-[95%] max-w-[1240px] mt-2 flex-row items-center justify-between px-6 py-2 lg:flex text-rh-ink font-sans rounded-2xl",
          "bg-rh-canvas/80 backdrop-blur-xl ring-1 ring-rh-ink/[0.06]",
        )}
      >
        <div className="flex-shrink-0">
          <RehabifyLogo />
        </div>

        <nav className="flex items-center gap-1 mx-auto">
          {navLinks.map((item) => (
            <NavItemComponent
              key={item.name}
              item={item}
              isActive={activeItem === item.name}
              onClick={() => handleCloseDropdowns()}
              onMouseEnter={() => (item.items ? setActiveItem(item.name) : handleCloseDropdowns())}
              onMouseLeave={handleCloseDropdowns}
            />
          ))}
        </nav>

        <div className="flex items-center justify-end gap-2 flex-shrink-0">
          {isLoaded && isSignedIn ? (
            <>
              <DashboardButton />
              <UserButton />
            </>
          ) : (
            <>
              {/* Returning users go to their own dashboard by role; new ones say who they are first */}
              <NavbarButton href="/sign-in" variant="secondary" className="text-sm px-3 py-2">Sign in</NavbarButton>
              <GetStartedMenu />
            </>
          )}
        </div>
      </motion.div>

      {/* Mobile Navigation Header Bar */}
      <motion.div
        animate={barShadow}
        transition={{ duration: 0.3 }}
        className={cn(
          // Phones get a narrow pill; tablets (iPad) get the full-width bar so it lines up with the page
          "relative z-[60] mx-auto flex w-[95%] max-w-md md:max-w-[1100px] flex-row items-center justify-between px-4 md:px-6 mt-2 py-1.5 md:py-2 lg:hidden text-rh-ink font-sans rounded-xl md:rounded-2xl",
          "bg-rh-canvas/80 backdrop-blur-xl ring-1 ring-rh-ink/[0.06]",
        )}
      >
        <div className="flex-shrink-0">
          <RehabifyLogo />
        </div>

        <div className="flex items-center space-x-2">
          {isLoaded && isSignedIn ? (
            <>
              <DashboardButton />
              <UserButton />
            </>
          ) : (
            <NavbarButton href="/sign-in" className="text-xs py-1.5 px-3">Sign In</NavbarButton>
          )}
          <div className="relative z-[70]">
            <MobileNavToggle
              isOpen={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            />
          </div>
        </div>
      </motion.div>

      {/* Mobile menu: backdrop and floating sheet */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={closeMobile}
              className="fixed inset-0 z-[70] bg-rh-ink/60 backdrop-blur-sm lg:hidden"
            />

            <motion.div
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="fixed top-3 inset-x-3 sm:inset-x-6 sm:max-w-lg sm:mx-auto z-[80] max-h-[90vh] flex flex-col bg-rh-canvas rounded-3xl shadow-lift overflow-hidden lg:hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-rh-ink/[0.06]">
                <RehabifyLogo />
                <MobileNavToggle isOpen={isMobileMenuOpen} onClick={closeMobile} />
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 font-sans">
                {/* New visitors say who they are, so sign-up opens the right onboarding */}
                {isLoaded && !isSignedIn && (
                  <div className="rounded-2xl bg-white p-2">
                    <p className="px-3 py-1 text-xs font-semibold text-rh-ink/50">Get started</p>
                    <GetStartedList onPick={closeMobile} />
                  </div>
                )}

                <nav className="rounded-2xl bg-white p-2">
                  {navLinks.map((item) => {
                    if (!item.items) {
                      return (
                        <Link
                          key={item.name}
                          href={item.href || "#"}
                          onClick={closeMobile}
                          className="flex items-center px-3.5 py-3.5 rounded-xl text-[15px] font-semibold text-rh-ink hover:bg-rh-canvas transition-colors"
                        >
                          {item.name}
                        </Link>
                      );
                    }

                    const isExpanded = mobileOpenItem === item.name;
                    return (
                      <div key={item.name}>
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => setMobileOpenItem(isExpanded ? null : item.name)}
                          className="flex w-full items-center justify-between px-3.5 py-3.5 rounded-xl text-left text-[15px] font-semibold text-rh-ink hover:bg-rh-canvas transition-colors"
                        >
                          {item.name}
                          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", isExpanded && "rotate-180")} />
                        </button>

                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: "easeInOut" }}
                              className="overflow-hidden"
                            >
                              <div className="ml-3.5 mb-2 border-l border-rh-ink/10 pl-2">
                                {item.items.map((link) => (
                                  <div key={link.href}>
                                    <Link
                                      href={link.href}
                                      onClick={closeMobile}
                                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rh-ink hover:bg-rh-canvas transition-colors"
                                    >
                                      {link.name}
                                      {link.badge && <NewBadge label={link.badge} />}
                                    </Link>
                                    {link.children?.map((child) => (
                                      <Link
                                        key={child.href}
                                        href={child.href}
                                        onClick={closeMobile}
                                        className="ml-3 flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-rh-ink/70 hover:bg-rh-canvas hover:text-rh-ink transition-colors"
                                      >
                                        {child.name}
                                        {child.badge && <NewBadge label={child.badge} />}
                                      </Link>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </nav>
              </div>

              <div className="p-4 border-t border-rh-ink/[0.06]">
                {isLoaded && isSignedIn ? (
                  <div className="flex items-center gap-3">
                    <UserButton />
                    <DashboardButton onClick={closeMobile} />
                  </div>
                ) : (
                  <Link
                    href="/sign-in"
                    onClick={closeMobile}
                    className="block w-full rounded-full bg-white py-3 text-center text-sm font-semibold text-rh-ink ring-1 ring-inset ring-rh-ink/10 hover:bg-rh-ink/[0.03] transition-colors"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
