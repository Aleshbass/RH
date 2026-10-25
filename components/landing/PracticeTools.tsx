"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { ArrowRight } from "@/components/icons";
import { signUpHrefFor } from "@/lib/auth/signupIntent";
import { joyWhatsAppUrl } from "@/lib/joyWhatsApp";
import { MARKETING_VIDEOS } from "@/lib/marketingVideos";
import { PairingShapes } from "@/components/learn/shared";
import { MarketingVideo } from "./MarketingVideo";
import { SegmentedSwitch, switchPanelId, switchTabId } from "./SegmentedSwitch";

const EASE = [0.22, 1, 0.36, 1] as const;
const ID = "practice-tools";

type Cta = { label: string; href: string; external?: boolean };

const TOOLS = [
  {
    id: "physio",
    label: "Physiotherapists",
    short: "Physios",
    heading: "More space for the care you give.",
    points: ["Consistent patient referrals, no marketing costs", "Scheduling, notes and payments in one place", "A fixed payout for every completed session"],
    video: { url: MARKETING_VIDEOS.physiotherapist, title: "Rehabify for physiotherapists" },
    fallback: { src: "/logos/images/physio-dashboard.webp", alt: "The Rehabify physiotherapist workspace" },
    ctas: [{ label: "Join our care network", href: signUpHrefFor("physiotherapist") }] as Cta[],
  },
  {
    id: "clinic",
    label: "Clinics",
    heading: "Bring your team and care operations together.",
    points: ["Your team, patients and payments together", "Assign patients to your clinicians", "Clinical notes stay with the treating clinician"],
    video: { url: MARKETING_VIDEOS.clinic, title: "Rehabify for clinics" },
    fallback: { src: "/logos/images/platform.jpeg", alt: "The Rehabify clinic workspace" },
    ctas: [{ label: "Set up your clinic", href: signUpHrefFor("clinic_owner") }] as Cta[],
  },
  {
    id: "partner",
    label: "Referral partners",
    short: "Partners",
    heading: "A referral system that actually works.",
    points: ["Refer in 30 seconds", "Track patient recovery in real time", "Keep care seamless and closed-loop"],
    // Partners get a photo, not a film
    video: { url: "", title: "" },
    fallback: {
      src: "https://res.cloudinary.com/dubeogufg/image/upload/f_auto,q_auto/v1741105204/IMG_6327_ffervx.png",
      alt: "A doctor reviewing a patient referral",
      unoptimized: true,
    },
    ctas: [
      { label: "Talk to our partnerships team", href: "/partnerships" },
      { label: "Refer a patient now", href: joyWhatsAppUrl("Hi Joy! 👋🏾 I'd like to refer a patient through Rehabify."), external: true },
    ] as Cta[],
  },
] as const;

type ToolId = (typeof TOOLS)[number]["id"];

const primary =
  "group inline-flex h-12 items-center gap-2 rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-2 focus-visible:ring-offset-rh-ink";
const secondary =
  "inline-flex h-12 items-center rounded-full px-6 text-[15px] font-semibold text-white ring-1 ring-inset ring-white/25 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime";

function CtaLink({ cta, first }: { cta: Cta; first: boolean }) {
  const content = (
    <>
      {cta.label}
      {first && <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />}
    </>
  );
  return cta.external ? (
    <a href={cta.href} target="_blank" rel="noopener noreferrer" className={first ? primary : secondary}>
      {content}
    </a>
  ) : (
    <Link href={cta.href} className={first ? primary : secondary}>
      {content}
    </Link>
  );
}

export function PracticeTools() {
  const reduce = useReducedMotion();
  const [id, setId] = useState<ToolId>("physio");
  const tool = TOOLS.find((t) => t.id === id) ?? TOOLS[0];

  return (
    <section id="professionals" className="overflow-hidden bg-rh-ink px-4 py-20 text-white sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-xl text-[36px] font-bold leading-[1.05] tracking-tight sm:text-5xl">Tools for your practice.</h2>

        <SegmentedSwitch
          idBase={ID}
          label="Who Rehabify works with"
          tone="dark"
          options={TOOLS}
          value={id}
          onChange={setId}
          className="mt-8 flex w-full sm:inline-flex sm:w-auto"
        />

        <div id={switchPanelId(ID)} role="tabpanel" aria-labelledby={switchTabId(ID, id)} className="mt-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tool.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="grid items-center gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14"
            >
              <div>
                <h3 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[32px]">{tool.heading}</h3>
                <ul className="mt-6">
                  {tool.points.map((point) => (
                    <li key={point} className="flex items-center gap-3 border-t border-white/10 py-3.5 text-[15px] text-white/85">
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-rh-lime" />
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  {tool.ctas.map((cta, i) => (
                    <CtaLink key={cta.label} cta={cta} first={i === 0} />
                  ))}
                </div>
              </div>

              <div className="relative">
                <PairingShapes className="-right-5 -top-6 h-28 w-28 sm:-right-8 sm:-top-8 sm:h-40 sm:w-40" />
                <MarketingVideo url={tool.video.url} title={tool.video.title} fallback={tool.fallback} className="relative ring-1 ring-white/10" />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
