"use client";

import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, Hash, AlignLeft, CornerDownLeft, Loader2 } from "lucide-react";
import { ALL_DOCS_FLAT, DocNavItem } from "./DocsNav";

interface DocsSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Shape returned by the fumadocs search route (app/api/search/route.ts). */
interface ApiSearchResult {
  id: string;
  url: string;
  type: "page" | "heading" | "text";
  content: string;
  breadcrumbs?: string[];
}

interface ResultItem {
  key: string;
  href: string;
  type: "page" | "heading" | "text";
  /** Display text; may contain <mark>…</mark> highlights from the search route. */
  content: string;
  context?: string;
  badge?: string;
}

const PAGE_TITLES = new Map(ALL_DOCS_FLAT.map((item) => [item.href, item.title]));

/** Strip markdown escapes/emphasis the search route leaves in content. Keeps <mark> tags. */
function cleanContent(value: string): string {
  return value
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, "$1")
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Render text with <mark>…</mark> segments highlighted, without using innerHTML. */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(<mark>[\s\S]*?<\/mark>)/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^<mark>([\s\S]*?)<\/mark>$/);
        if (match) {
          return (
            <mark key={i} className="bg-[#005b57]/15 text-[#002e2c] rounded px-0.5">
              {match[1]}
            </mark>
          );
        }
        return <Fragment key={i}>{part.replace(/<\/?mark>/g, "")}</Fragment>;
      })}
    </>
  );
}

function localMatches(query: string): ResultItem[] {
  const q = query.trim().toLowerCase();
  const items: DocNavItem[] = q
    ? ALL_DOCS_FLAT.filter((item) =>
        [item.title, item.description ?? "", item.href].some((field) => field.toLowerCase().includes(q))
      )
    : ALL_DOCS_FLAT.slice(0, 8);
  return items.map((item) => ({
    key: `local:${item.href}`,
    href: item.href,
    type: "page",
    content: item.title,
    context: item.description,
    badge: item.badge,
  }));
}

function pageHref(url: string): string {
  return url.split("#")[0];
}

export default function DocsSearchModal({ isOpen, onClose }: DocsSearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [apiResults, setApiResults] = useState<ResultItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Full-text search through the fumadocs search route, debounced.
  useEffect(() => {
    const q = query.trim();
    if (!isOpen || q.length < 2) {
      setApiResults(null);
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?query=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        const data = (await res.json()) as ApiSearchResult[];
        const items: ResultItem[] = (Array.isArray(data) ? data : []).slice(0, 30).map((r) => {
          const href = r.url;
          const pageTitle = PAGE_TITLES.get(pageHref(href));
          return {
            key: `api:${r.id}:${r.url}`,
            href,
            type: r.type,
            content: cleanContent(r.content),
            context:
              r.type === "page"
                ? r.breadcrumbs?.join(" / ")
                : pageTitle ?? r.breadcrumbs?.join(" / "),
          };
        });
        setApiResults(items);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setApiResults(null); // fall back to local matches
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen]);

  const results = useMemo<ResultItem[]>(() => {
    const local = localMatches(query);
    if (!apiResults) return local;
    // Full-text results first, then any title/description matches the index didn't return.
    const seenPages = new Set(apiResults.filter((r) => r.type === "page").map((r) => pageHref(r.href)));
    return [...apiResults, ...local.filter((r) => !seenPages.has(r.href))];
  }, [apiResults, query]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setQuery("");
      setApiResults(null);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex((prev) => (prev >= results.length ? 0 : prev));
  }, [results.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(results.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + results.length) % Math.max(results.length, 1));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        router.push(results[selectedIndex].href);
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, results, selectedIndex, router, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/40 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#FAF6E7] border border-[#002e2c]/15 rounded-3xl shadow-2xl overflow-hidden text-[#002e2c]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search documentation"
      >
        {/* Search Input Bar */}
        <div className="p-4 border-b border-[#002e2c]/10 flex items-center gap-3 bg-white/70">
          {isLoading ? (
            <Loader2 className="w-5 h-5 text-[#005b57] animate-spin" />
          ) : (
            <Search className="w-5 h-5 text-[#005b57]" />
          )}
          <input
            ref={inputRef}
            type="text"
            placeholder="Search endpoints, fields, error codes, events…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent text-sm text-[#002e2c] placeholder-[#52706e] focus:outline-none font-medium"
            aria-label="Search documentation"
          />
          <button
            onClick={onClose}
            className="text-[11px] font-mono text-[#52706e] bg-[#FAF6E7] border border-[#002e2c]/10 px-2 py-1 rounded-md hover:bg-white transition"
          >
            ESC
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-[#002e2c]/5">
          {results.length > 0 ? (
            results.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.type === "heading" ? Hash : item.type === "text" ? AlignLeft : FileText;
              return (
                <div
                  key={item.key}
                  onClick={() => {
                    router.push(item.href);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`p-3 rounded-2xl cursor-pointer flex items-center justify-between gap-3 transition-all ${
                    isSelected
                      ? "bg-[#005b57]/10 text-[#002e2c] font-semibold"
                      : "text-[#2d4d4b] hover:bg-white/60"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center ${
                        isSelected
                          ? "bg-[#005b57] text-white"
                          : "bg-white/80 text-[#52706e] border border-[#002e2c]/10"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`text-xs ${item.type === "text" ? "font-normal line-clamp-2" : "font-semibold truncate"}`}
                      >
                        <Highlighted text={item.content} />
                      </div>
                      {item.context && (
                        <div className="text-[11px] text-[#52706e] font-normal truncate">{item.context}</div>
                      )}
                    </div>
                  </div>

                  {item.badge && (
                    <span className="flex-shrink-0 text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#005b57]/10 text-[#005b57] font-semibold border border-[#005b57]/20">
                      {item.badge}
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-[#52706e]">
              {isLoading ? "Searching…" : <>No results for &ldquo;{query}&rdquo;.</>}
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
