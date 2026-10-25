"use client";

import { motion, useReducedMotion } from "framer-motion";
import { PairingShapes } from "@/components/learn/shared";
import { MARKETING_VIDEOS } from "@/lib/marketingVideos";
import { MarketingVideo } from "./MarketingVideo";

const EASE = [0.22, 1, 0.36, 1] as const;

const REASONS = ["Matched in Under 24 Hours", "Active Recovery & Joy WhatsApp Tracking"];

/** Deep ink with the brand's paired squares, as on the MSK page: a few words and the patient film. */
export function WhyRehabify() {
  const reduce = useReducedMotion();
  return (
    <section className="overflow-hidden bg-rh-ink px-4 py-20 text-white sm:px-6 lg:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          <h2 className="text-[36px] font-bold leading-[1.05] tracking-tight sm:text-5xl">Why patients choose Rehabify</h2>
          <p className="mt-5 max-w-md text-lg font-medium leading-relaxed text-white/75">
            High hospital fees and months-long waitlists shouldn&apos;t stand between you and getting better.
          </p>
          <ul className="mt-9 max-w-md">
            {REASONS.map((reason) => (
              <li key={reason} className="flex items-center gap-4 border-t border-white/10 py-5 text-xl font-bold leading-snug sm:text-[22px]">
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-[4px] bg-rh-lime" />
                {reason}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          className="relative"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
        >
          <PairingShapes className="-right-5 -top-6 h-32 w-32 sm:-right-8 sm:-top-8 sm:h-44 sm:w-44" />
          <MarketingVideo
            url={MARKETING_VIDEOS.patientDemo}
            title="Rehabify patient demo"
            mode="preview"
            fallback={{
              src: "https://res.cloudinary.com/dubeogufg/image/upload/f_auto,q_auto/v1741105202/IMG_6326_nmmqal.png",
              alt: "A Rehabify physiotherapist treating a patient",
              unoptimized: true,
            }}
            className="relative ring-1 ring-white/10"
          />
        </motion.div>
      </div>
    </section>
  );
}
