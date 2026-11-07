"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  /** What the carousel holds, for screen readers (e.g. "Tools for your practice") */
  label: string;
  className?: string;
};

const arrow =
  "inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-rh-ink ring-1 ring-inset ring-rh-ink/10 transition hover:bg-rh-ink hover:text-white disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink";

/**
 * Cards in a row that swipe on phones and page with arrows on bigger screens. Plain CSS scroll-snap,
 * no carousel library: about one and a bit cards on phones, two on tablets, three on desktop.
 * Vertical swipes always scroll the page.
 */
export function SnapCarousel({ children, label, className }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const slides = Children.toArray(children);

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  const page = (direction: 1 | -1) => {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({ left: direction * (first.offsetWidth + gap), behavior: "smooth" });
  };

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label} className={className}>
      <div
        ref={track}
        tabIndex={0}
        className={cn(
          "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:px-0",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-4 focus-visible:ring-offset-rh-canvas",
        )}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}`}
            className="flex shrink-0 basis-[84%] snap-start sm:basis-[calc((100%-1rem)/2)] lg:basis-[calc((100%-2rem)/3)]"
          >
            {slide}
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={arrow} onClick={() => page(-1)} disabled={edges.start} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className={arrow} onClick={() => page(1)} disabled={edges.end} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
