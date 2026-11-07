"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useConvex } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { EXERCISE_CATALOG, posterUrl } from "@/convex/exerciseLibraryCatalog";
import type { ViewerGrant } from "@/lib/exercise3d/useViewerGrant";
import { cn } from "@/lib/utils";
import { SegmentedSwitch, switchPanelId, switchTabId } from "./SegmentedSwitch";

const EASE = [0.22, 1, 0.36, 1] as const;
const ID = "exercises-3d";

// three.js and the viewer only download once the section is close to the screen.
const ExerciseViewer = dynamic(() => import("@/components/exercise3d/ExerciseViewer").then((m) => m.ExerciseViewer), {
  ssr: false,
});

// Must match DEMO_CLIPS in convex/exerciseLibrary.ts: the only clips a signed-out visitor can watch.
const DEMOS = [
  { id: "mini-squat", label: "Mini squat" },
  { id: "glute-bridge", label: "Glute bridge" },
] as const;
type DemoId = (typeof DEMOS)[number]["id"];

// makeFunctionReference keeps the landing page clear of the generated api types (TS2589).
const demoGrantRef = makeFunctionReference<"query", { version: string }, ViewerGrant>("exerciseLibrary:demoGrant");

// One request per page visit; both demos come back in it.
let grantRequest: Promise<ViewerGrant> | null = null;

// Same box for the poster and the live 3D, so nothing jumps when it loads. Capped on phones so
// there is always page above and below the 3D to swipe on.
const STAGE = "aspect-[4/5] max-h-[60vh] w-full rounded-[2rem] bg-white sm:aspect-square sm:max-h-[70vh] lg:max-h-none";

export function Exercise3DShowcase() {
  const reduce = useReducedMotion();
  const convex = useConvex();
  const [clipId, setClipId] = useState<DemoId>("mini-squat");
  const [near, setNear] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: "400px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);

  const requestGrant = useCallback(async () => {
    grantRequest ??= convex.query(demoGrantRef, { version: EXERCISE_CATALOG.version });
    try {
      return await grantRequest;
    } catch (err) {
      grantRequest = null;
      throw err;
    }
  }, [convex]);

  const rise = (delay = 0) => ({
    initial: reduce ? false : { opacity: 0, y: 16 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.5, ease: EASE, delay },
  });

  return (
    <section id={ID} className="overflow-x-clip bg-rh-canvas px-4 pb-20 sm:px-6 lg:pb-28">
      <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-x-14 lg:gap-y-8">
        <motion.div {...rise()}>
          <h2 className="max-w-xl text-[36px] font-bold leading-[1.05] tracking-tight text-rh-ink sm:text-5xl">Your exercises, in 3D.</h2>
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-rh-ink/75">
            Your physio builds your home programme from our 3D exercise library. Turn it with your finger, slow it down and follow along at home.
          </p>
          <SegmentedSwitch
            idBase={ID}
            label="Choose an exercise"
            options={DEMOS}
            value={clipId}
            onChange={setClipId}
            className="mt-8 flex w-full sm:inline-flex sm:w-auto"
          />
        </motion.div>

        <motion.div
          {...rise(0.1)}
          ref={stageRef}
          id={switchPanelId(ID)}
          role="tabpanel"
          aria-labelledby={switchTabId(ID, clipId)}
          className="relative lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          {near ? (
            <ExerciseViewer
              clipId={clipId}
              requestGrant={requestGrant}
              variant="showcase"
              accent="ink"
              className={cn(STAGE, "ring-1 ring-rh-ink/[0.06]")}
            />
          ) : (
            <div className={cn(STAGE, "relative overflow-hidden ring-1 ring-rh-ink/[0.06]")}>
              <Image src={posterUrl(clipId)} alt="" fill sizes="(max-width: 1024px) 100vw, 640px" className="object-contain p-4" />
            </div>
          )}
        </motion.div>

        <motion.div {...rise(0.2)} className="rounded-[1.75rem] bg-white p-6 ring-1 ring-inset ring-rh-ink/[0.06] lg:col-start-1 lg:row-start-2 lg:self-start">
          <span className="inline-flex rounded-full bg-rh-ink px-3 py-1 text-xs font-semibold text-white">Coming soon</span>
          <h3 className="mt-4 text-xl font-bold leading-snug text-rh-ink">3D motion tracking</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-rh-ink/75">
            Soon your phone&apos;s camera will check your form and count your reps as you move.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
