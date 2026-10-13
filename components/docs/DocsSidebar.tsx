"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS_NAV_GROUPS } from "./DocsNav";
import { ChevronRight } from "lucide-react";

interface DocsSidebarProps {
  onItemClick?: () => void;
}

/**
 * On docs.physioaroundme.com the middleware rewrites "/<path>" to "/docs/<path>", so the browser
 * path may lack the "/docs" prefix. Normalise to the "/docs/..." form used by the nav hrefs.
 */
function normalizeDocsPath(path: string | null): string {
  const clean = (path || "/").replace(/\/+$/, "") || "/";
  if (clean === "/") return "/docs";
  return clean === "/docs" || clean.startsWith("/docs/") ? clean : `/docs${clean}`;
}

export default function DocsSidebar({ onItemClick }: DocsSidebarProps) {
  const pathname = normalizeDocsPath(usePathname());

  return (
    <nav className="space-y-6 text-xs text-[#002e2c]">
      {DOCS_NAV_GROUPS.map((group) => (
        <div key={group.title} className="space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#52706e] px-3 py-1 font-sans">
            {group.title}
          </div>

          <div className="space-y-0.5">
            {group.items.map((item) => {
              // Every page has its own nav entry, so match exactly (section overviews such as
              // /docs/webhooks must not stay highlighted on their child pages).
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onItemClick}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl transition-all ${
                    isActive
                      ? "bg-[#005b57]/10 text-[#002e2c] font-semibold border-l-2 border-[#005b57] shadow-xs"
                      : "text-[#2d4d4b] hover:text-[#002e2c] hover:bg-white/60 font-medium"
                  }`}
                >
                  <span className="truncate">{item.title}</span>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {item.badge && (
                      <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-[#005b57]/15 text-[#005b57] font-bold">
                        {item.badge}
                      </span>
                    )}
                    {isActive && (
                      <ChevronRight className="w-3.5 h-3.5 text-[#005b57]" />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
