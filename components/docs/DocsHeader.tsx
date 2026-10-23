"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Menu, X, ArrowUpRight } from "@/components/icons";
import DocsSearchModal from "./DocsSearchModal";

interface DocsHeaderProps {
  onToggleMobileSidebar: () => void;
  isMobileSidebarOpen: boolean;
}

export default function DocsHeader({
  onToggleMobileSidebar,
  isMobileSidebarOpen,
}: DocsHeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#FAF6E7]/90 backdrop-blur-xl border-b border-[#002e2c]/10 h-16 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-full flex items-center justify-between gap-4">
          {/* Brand Logo & Docs Tag */}
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button
              onClick={onToggleMobileSidebar}
              className="lg:hidden p-2 rounded-xl text-[#002e2c] hover:bg-[#005b57]/10 transition"
              aria-label="Toggle Navigation"
            >
              {isMobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <Link href="/docs" className="flex items-center gap-3 group">
              <Image
                src="/logos/MainRehabify.svg"
                alt="Rehabify Logo"
                width={130}
                height={32}
                className="h-7 w-auto object-contain transition-transform group-hover:scale-102"
                priority
              />
              <span className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-[#005b57]/10 text-[#005b57] border border-[#005b57]/20 font-bold">
                Docs
              </span>
            </Link>
          </div>

          {/* Center: Apple-style Search Bar */}
          <div className="flex-1 max-w-sm mx-4 hidden sm:block">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="w-full flex items-center justify-between bg-white/70 hover:bg-white text-xs text-[#52706e] border border-[#002e2c]/10 hover:border-[#005b57]/30 rounded-full px-4 py-2 shadow-xs transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-[#005b57]" />
                <span className="font-normal text-xs text-[#52706e]">Search docs & APIs...</span>
              </div>
              <span className="text-[10px] font-mono bg-[#FAF6E7] border border-[#002e2c]/10 text-[#52706e] px-2 py-0.5 rounded-md font-semibold">
                ⌘K
              </span>
            </button>
          </div>

          {/* Right Navigation Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Mobile search icon */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="sm:hidden p-2 rounded-xl text-[#002e2c] hover:bg-[#005b57]/10 transition"
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Absolute URLs: on docs.physioaroundme.com every relative path is rewritten to /docs/<path>. */}
            <a
              href="https://partners.physioaroundme.com"
              className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-[#002e2c] hover:text-[#005b57] px-3.5 py-1.5 rounded-full hover:bg-white/60 transition"
            >
              <span>Partner Portal</span>
              <ArrowUpRight className="w-3 h-3 text-[#52706e]" />
            </a>

            <a
              href="https://physioaroundme.com/openapi.json"
              className="hidden lg:flex items-center gap-1 text-xs font-semibold text-[#002e2c] hover:text-[#005b57] px-3.5 py-1.5 rounded-full hover:bg-white/60 transition"
            >
              <span>OpenAPI</span>
            </a>

            <a
              href="https://physioaroundme.com"
              className="bg-[#005b57] hover:bg-[#00443e] text-white text-xs font-medium px-4 py-1.5 rounded-full transition shadow-xs"
            >
              Main Platform
            </a>
          </div>
        </div>
      </header>

      {/* Instant Search Modal */}
      <DocsSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
}
