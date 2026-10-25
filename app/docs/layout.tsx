"use client";

import { useState } from "react";
import DocsHeader from "@/components/docs/DocsHeader";
import DocsSidebar from "@/components/docs/DocsSidebar";

export default function DocsRootLayout({ children }: { children: React.ReactNode }) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-rh-canvas text-rh-ink flex flex-col font-sans selection:bg-rh-lime selection:text-rh-ink antialiased">
      {/* Apple-style Translucent Cream Header */}
      <DocsHeader
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        isMobileSidebarOpen={isMobileSidebarOpen}
      />

      {/* Main Documentation Body */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 flex">
        {/* Desktop Left Sticky Navigation Sidebar */}
        <aside className="hidden lg:block w-64 xl:w-72 flex-shrink-0 py-8 pr-6 border-r border-rh-ink/10 sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto no-scrollbar">
          <DocsSidebar />
        </aside>

        {/* Mobile Slide-Over Drawer */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 z-50 lg:hidden bg-black/40 backdrop-blur-xs flex animate-fadeIn"
            onClick={() => setIsMobileSidebarOpen(false)}
          >
            <div
              className="w-72 bg-rh-canvas h-full p-6 shadow-2xl overflow-y-auto border-r border-rh-ink/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pb-4 mb-4 border-b border-rh-ink/10 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-rh-ink">
                  Documentation
                </span>
                <button
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="text-xs font-semibold text-rh-ink/60 hover:text-rh-ink"
                >
                  ✕ Close
                </button>
              </div>
              <DocsSidebar onItemClick={() => setIsMobileSidebarOpen(false)} />
            </div>
          </div>
        )}

        {/* Content Area */}
        <main className="flex-1 py-8 lg:pl-10 min-w-0">{children}</main>
      </div>
    </div>
  );
}
