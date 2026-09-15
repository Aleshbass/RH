"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, FileText, CornerDownLeft } from "lucide-react";
import { ALL_DOCS_FLAT, DocNavItem } from "./DocsNav";

interface DocsSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DocsSearchModal({ isOpen, onClose }: DocsSearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? ALL_DOCS_FLAT.filter((item) =>
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.href.toLowerCase().includes(query.toLowerCase())
      )
    : ALL_DOCS_FLAT.slice(0, 8);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(filtered.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(filtered.length, 1));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        router.push(filtered[selectedIndex].href);
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filtered, selectedIndex, router, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/40 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-xl bg-[#FAF6E7] border border-[#002e2c]/15 rounded-3xl shadow-2xl overflow-hidden text-[#002e2c]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="p-4 border-b border-[#002e2c]/10 flex items-center gap-3 bg-white/70">
          <Search className="w-5 h-5 text-[#005b57]" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search documentation, API endpoints, guides..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent text-sm text-[#002e2c] placeholder-[#52706e] focus:outline-none font-medium"
          />
          <button
            onClick={onClose}
            className="text-[11px] font-mono text-[#52706e] bg-[#FAF6E7] border border-[#002e2c]/10 px-2 py-1 rounded-md hover:bg-white transition"
          >
            ESC
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-[#002e2c]/5">
          {filtered.length > 0 ? (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.href}
                  onClick={() => {
                    router.push(item.href);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`p-3 rounded-2xl cursor-pointer flex items-center justify-between transition-all ${
                    isSelected
                      ? "bg-[#005b57]/10 text-[#002e2c] font-semibold"
                      : "text-[#2d4d4b] hover:bg-white/60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        isSelected
                          ? "bg-[#005b57] text-white"
                          : "bg-white/80 text-[#52706e] border border-[#002e2c]/10"
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold">{item.title}</div>
                      <div className="text-[11px] text-[#52706e] font-mono">{item.href}</div>
                    </div>
                  </div>

                  {item.badge && (
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#005b57]/10 text-[#005b57] font-semibold border border-[#005b57]/20">
                      {item.badge}
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-[#52706e]">
              No documentation pages found matching &ldquo;{query}&rdquo;.
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2.5 bg-white/40 border-t border-[#002e2c]/10 flex items-center justify-between text-[11px] text-[#52706e]">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 font-mono">
              <CornerDownLeft className="w-3 h-3" /> Select
            </span>
            <span>•</span>
            <span className="font-mono">↑↓ Navigate</span>
          </div>
          <span>Rehabify Developer Docs</span>
        </div>
      </div>
    </div>
  );
}
