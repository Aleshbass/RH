"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "@/components/icons";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

// Published figures. Keep them true: update when the numbers change.
const STATS = [
  { value: "500+", label: "People using Rehabify" },
  { value: "Under 24 hrs", label: "Usual time to be matched" },
  { value: "Licensed clinicians", label: "MRTBN professional registration" },
];

type Testimonial = { quote: string; name: string; detail: string };

/**
 * Real words only, shared with the person's permission. Each one becomes a slide that flips in
 * after the figures. Keep quotes under ~180 characters so they fit the band without resizing it.
 */
const TESTIMONIALS: Testimonial[] = [];

const PARTNERS = [
  { name: "AwaDoc", logo: "https://www.awadoc.com/_next/image?url=%2Fawadoc.png&w=256&q=75", width: 128, height: 56 },
  { name: "MediLoan by MyItura", logo: "https://loans.myitura.com/static/assets/logos/mediloan.svg?v=a5762be08a39", width: 160, height: 48 },
];

type Slide = { kind: "stats" } | { kind: "testimonial"; item: Testimonial } | { kind: "partners" };

const SLIDES: Slide[] = [
  { kind: "stats" },
  ...TESTIMONIALS.map((item): Slide => ({ kind: "testimonial", item })),
  { kind: "partners" },
];

// How long each kind of slide stays up
const DWELL: Record<Slide["kind"], number> = { stats: 6500, testimonial: 7500, partners: 5000 };

// Split-flap style: each figure flips over on its own, a beat after the one before
const statsGroup: Variants = {
  enter: {},
  center: { transition: { staggerChildren: 0.09 } },
  exit: { transition: { staggerChildren: 0.06 } },
};
const flipCell: Variants = {
  enter: { rotateX: -90, opacity: 0 },
  center: { rotateX: 0, opacity: 1, transition: { duration: 0.5, ease: EASE } },
  exit: { rotateX: 90, opacity: 0, transition: { duration: 0.3, ease: "easeIn" } },
};
// A quote turns over as one card
const flipCard: Variants = {
  enter: { rotateX: -90, opacity: 0 },
  center: { rotateX: 0, opacity: 1, transition: { duration: 0.55, ease: EASE } },
  exit: { rotateX: 90, opacity: 0, transition: { duration: 0.3, ease: "easeIn" } },
};
// Partners arrive quietly
const calm: Variants = {
  enter: { opacity: 0, y: 6 },
  center: { opacity: 1, y: 0, transition: { duration: 0.9, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.45 } },
};
const fade: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

// Perspective on the element itself, so flips never stretch the layout around them
const flipStyle = { transformPerspective: 900, transformOrigin: "50% 50%", backfaceVisibility: "hidden" as const };

function StatsSlide({ still }: { still: boolean }) {
  return (
    <motion.div variants={still ? fade : statsGroup} className="flex h-full flex-col justify-center">
      <dl className="grid grid-cols-3 gap-4 sm:gap-8">
        {STATS.map((stat) => (
          <motion.div key={stat.label} variants={still ? undefined : flipCell} style={flipStyle} className="flex flex-col-reverse justify-end">
            <dt className="mt-2 text-xs leading-snug text-white/75 sm:text-sm">{stat.label}</dt>
            <dd className="text-[22px] font-bold leading-[1.1] tracking-tight text-rh-lime sm:text-3xl lg:text-4xl">{stat.value}</dd>
          </motion.div>
        ))}
      </dl>
    </motion.div>
  );
}

function TestimonialSlide({ item, still }: { item: Testimonial; still: boolean }) {
  return (
    <motion.figure variants={still ? fade : flipCard} style={flipStyle} className="flex h-full flex-col justify-center">
      <blockquote className="line-clamp-4 max-w-3xl text-lg font-medium leading-snug text-white sm:line-clamp-3 sm:text-2xl">
        &ldquo;{item.quote}&rdquo;
      </blockquote>
      <figcaption className="mt-4 text-sm">
        <span className="font-semibold text-rh-lime">{item.name}</span>
        <span className="text-white/60"> · {item.detail}</span>
      </figcaption>
    </motion.figure>
  );
}

function PartnersSlide({ still }: { still: boolean }) {
  return (
    <motion.div variants={still ? fade : calm} className="flex h-full flex-col justify-center gap-5 sm:flex-row sm:items-center sm:justify-start sm:gap-10">
      <p className="text-sm font-semibold text-white/75">Our partners</p>
      <ul className="flex flex-wrap items-center gap-3 sm:gap-4">
        {PARTNERS.map((partner) => (
          <li key={partner.name} className="flex h-16 items-center rounded-2xl bg-white px-6">
            <Image
              src={partner.logo}
              alt={partner.name}
              width={partner.width}
              height={partner.height}
              unoptimized
              className="h-9 w-auto object-contain"
            />
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/**
 * The band straight after the hero. It cycles figures → testimonials → partners inside a box of
 * fixed height, so nothing on the page moves while it changes. It pauses on hover, on focus,
 * off-screen and with the pause button; with reduced motion it only changes when asked.
 */
export function ProofBand() {
  const reduce = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const ref = useRef<HTMLElement>(null);

  const slide = SLIDES[index];
  const running = !reduce && !paused && !holding && onScreen && SLIDES.length > 1;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.4 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), DWELL[slide.kind]);
    return () => window.clearTimeout(timer);
  }, [running, index, slide.kind]);

  return (
    <section
      ref={ref}
      aria-roledescription="carousel"
      aria-label="Rehabify at a glance"
      className="bg-rh-ink px-4 pb-6 pt-10 text-white sm:px-6 sm:pt-12"
      onMouseEnter={() => setHolding(true)}
      onMouseLeave={() => setHolding(false)}
      onFocus={() => setHolding(true)}
      onBlur={() => setHolding(false)}
    >
      <div className="mx-auto max-w-6xl">
        {/* Fixed height: every slide is laid out inside this box, absolutely positioned */}
        <div className="relative h-[230px] sm:h-[180px] lg:h-[150px]" aria-live={running ? "off" : "polite"}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={index}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${SLIDES.length}`}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0"
            >
              {slide.kind === "stats" && <StatsSlide still={reduce} />}
              {slide.kind === "testimonial" && <TestimonialSlide item={slide.item} still={reduce} />}
              {slide.kind === "partners" && <PartnersSlide still={reduce} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {SLIDES.length > 1 && (
          <div className="mt-4 flex items-center justify-end gap-3">
            <div className="flex items-center gap-1.5">
              {SLIDES.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show slide ${i + 1} of ${SLIDES.length}`}
                  aria-current={i === index}
                  className="flex h-6 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-2 focus-visible:ring-offset-rh-ink"
                >
                  <span
                    className={cn(
                      "block h-1.5 rounded-full transition-all duration-500",
                      i === index ? "w-6 bg-rh-lime" : "w-1.5 bg-white/30 hover:bg-white/60",
                    )}
                  />
                </button>
              ))}
            </div>
            {!reduce && (
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "Play slides" : "Pause slides"}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 ring-1 ring-inset ring-white/15 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime"
              >
                {paused ? <Play className="h-3 w-3 translate-x-px" /> : <Pause className="h-3 w-3" />}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
