"use client";

import { useState } from "react";
import DocsHeader from "@/components/docs/DocsHeader";
import DocsSidebar from "@/components/docs/DocsSidebar";

export default function DocsRootLayout({ children }: { children: React.ReactNode }) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#FAF6E7] text-[#002e2c] flex flex-col font-sans selection:bg-[#005b57] selection:text-white antialiased">
      {/* Apple-style Translucent Cream Header */}
      <DocsHeader
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        isMobileSidebarOpen={isMobileSidebarOpen}
      />

      {/* Main Documentation Body */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 flex">
        {/* Desktop Left Sticky Navigation Sidebar */}
        <aside className="hidden lg:block w-64 xl:w-72 flex-shrink-0 py-8 pr-6 border-r border-[#002e2c]/10 sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto no-scrollbar">
          <DocsSidebar />
        </aside>

        {/* Mobile Slide-Over Drawer */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 z-50 lg:hidden bg-black/40 backdrop-blur-xs flex animate-fadeIn"
            onClick={() => setIsMobileSidebarOpen(false)}
          >
            <div
              className="w-72 bg-[#FAF6E7] h-full p-6 shadow-2xl overflow-y-auto border-r border-[#002e2c]/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pb-4 mb-4 border-b border-[#002e2c]/10 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#005b57]">
                  Documentation
                </span>
                <button
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="text-xs font-semibold text-[#52706e] hover:text-[#002e2c]"
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
