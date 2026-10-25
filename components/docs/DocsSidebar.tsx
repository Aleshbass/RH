"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS_NAV_GROUPS } from "./DocsNav";
import { ChevronRight } from "@/components/icons";

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
    <nav className="space-y-6 text-xs text-rh-ink">
      {DOCS_NAV_GROUPS.map((group) => (
        <div key={group.title} className="space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-rh-ink/60 px-3 py-1 font-sans">
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
                      ? "bg-rh-ink/[0.06] text-rh-ink font-semibold border-l-2 border-rh-lime"
                      : "text-rh-ink/75 hover:text-rh-ink hover:bg-white/60 font-medium"
                  }`}
                >
                  <span className="truncate">{item.title}</span>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {item.badge && (
                      <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-rh-lime/30 text-rh-ink font-bold">
                        {item.badge}
                      </span>
                    )}
                    {isActive && (
                      <ChevronRight className="w-3.5 h-3.5 text-rh-ink" />
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
