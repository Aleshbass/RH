"use client";

import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowRight, Home } from "@/components/icons";
import { joyWhatsAppUrl } from "@/lib/joyWhatsApp";
import { SegmentedSwitch, switchPanelId, switchTabId } from "./SegmentedSwitch";

const EASE = [0.22, 1, 0.36, 1] as const;
const ID = "care-format";

const FORMATS = [
  {
    id: "clinic",
    label: "In a clinic",
    heading: "A dedicated space for your care.",
    body: "Meet your clinician in a clinic setting. Discuss your goals and explore a plan built around your assessment.",
    points: [
      "Check the clinic location and available appointment times.",
      "Know the quoted fee before making a payment.",
      "Bring relevant reports or referral information, if you have them.",
    ],
    cta: "Explore clinic appointments",
    message: "Hi Joy, I'd like to see a physiotherapist at a clinic.",
  },
  {
    id: "home",
    label: "At home",
    heading: "Care in familiar surroundings.",
    body: "Explore a home visit when travelling to a clinic is difficult or home-based care fits your situation.",
    points: [
      "Availability depends on your city and area.",
      "The care team confirms visit suitability and access arrangements.",
      "Agree the practical arrangements with your care team before the visit.",
    ],
    cta: "Explore home visits",
    message: "Hi Joy, I'd like a physiotherapist to visit me at home.",
  },
  {
    id: "online",
    label: "Online",
    heading: "Start a conversation, wherever you are.",
    body: "Discuss whether an online consultation or assessment is appropriate for your needs, with the physiotherapist guiding the visit.",
    points: [
      "Confirm suitability with the clinician before booking.",
      "Use a reliable connection and a private, comfortable space.",
      "An appointment link is provided after confirmation.",
    ],
    cta: "Explore online appointments",
    message: "Hi Joy, I'd like an online physiotherapy appointment.",
  },
] as const;

type FormatId = (typeof FORMATS)[number]["id"];

/** Steps through `count` items every `ms`, standing still when motion is reduced. */
function useCycle(count: number, ms: number, still: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (still) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), ms);
    return () => window.clearInterval(timer);
  }, [count, ms, still]);
  return index;
}

function ClinicScene({ still }: { still: boolean }) {
  const times = ["9:00", "11:30", "2:00", "4:30"];
  const picked = useCycle(times.length, 1600, still);
  return (
    <div className="w-full max-w-[320px] rounded-[1.5rem] bg-white p-5 text-rh-ink">
      <p className="text-sm font-semibold">Pick a time</p>
      <p className="mt-0.5 text-xs text-rh-ink/50">Clinic near you</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {times.map((time, i) => (
          <span
            key={time}
            className={`relative rounded-xl px-3 py-2.5 text-center text-sm font-semibold ring-1 ring-inset transition-colors duration-300 ${
              i === picked ? "bg-rh-ink text-white ring-rh-ink" : "bg-white text-rh-ink/70 ring-rh-ink/10"
            }`}
          >
            {time}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-rh-canvas px-3.5 py-2.5 text-xs">
        <span className="text-rh-ink/60">Fee shown first</span>
        <span className="rounded-full bg-rh-lime px-2.5 py-1 font-semibold text-rh-ink">{times[picked]} held</span>
      </div>
    </div>
  );
}

function HomeScene({ still }: { still: boolean }) {
  return (
    <div className="relative aspect-[4/3] w-full max-w-[340px]">
      <svg viewBox="0 0 320 240" className="absolute inset-0 h-full w-full" aria-hidden>
        {/* Street grid */}
        {[60, 120, 180].map((y) => (
          <line key={`h${y}`} x1="0" x2="320" y1={y} y2={y} stroke="white" strokeOpacity="0.07" strokeWidth="10" />
        ))}
        {[80, 160, 240].map((x) => (
          <line key={`v${x}`} y1="0" y2="240" x1={x} x2={x} stroke="white" strokeOpacity="0.07" strokeWidth="10" />
        ))}
        <motion.path
          d="M 48 196 C 48 120, 160 180, 160 120 S 272 70, 272 44"
          fill="none"
          stroke="#00cd0f"
          strokeWidth="4"
          strokeLinecap="round"
          initial={{ pathLength: still ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={still ? { duration: 0 } : { duration: 2.2, ease: "easeInOut", repeat: Infinity, repeatDelay: 1.4 }}
        />
      </svg>
      {/* Physio, start of the route */}
      <span className="absolute left-[15%] top-[81.5%] flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-rh-lime text-xs font-bold text-rh-ink">
        PT
      </span>
      {/* Home, end of the route */}
      <span className="absolute left-[85%] top-[18.5%] flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-white text-rh-ink">
        <Home className="h-4 w-4" />
      </span>
      <span className="absolute bottom-1 right-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-rh-ink">On the way to you</span>
    </div>
  );
}

function OnlineScene({ still }: { still: boolean }) {
  const bars = [0.45, 0.9, 0.6, 1, 0.5];
  return (
    <div className="relative w-full max-w-[340px]">
      <div className="relative flex aspect-[4/3] items-center justify-center rounded-[1.5rem] bg-white/[0.06] ring-1 ring-inset ring-white/10">
        <div className="flex flex-col items-center gap-3">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-rh-lime text-lg font-bold text-rh-ink">PT</span>
          <span className="flex h-6 items-end gap-1" aria-hidden>
            {bars.map((h, i) => (
              <motion.span
                key={i}
                className="w-1.5 rounded-full bg-white"
                style={{ height: `${h * 100}%` }}
                animate={still ? undefined : { scaleY: [0.35, 1, 0.5, 0.85, 0.35] }}
                transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
              />
            ))}
          </span>
          <span className="text-xs font-medium text-white/70">Your physiotherapist</span>
        </div>
        {/* You, picture in picture */}
        <span className="absolute bottom-3 right-3 flex h-[72px] w-[56px] items-center justify-center rounded-xl bg-white text-xs font-semibold text-rh-ink">
          You
        </span>
      </div>
      <span className="absolute -top-3 left-4 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-rh-ink">Link sent after confirmation</span>
    </div>
  );
}

function Scene({ id, still }: { id: FormatId; still: boolean }) {
  if (id === "clinic") return <ClinicScene still={still} />;
  if (id === "home") return <HomeScene still={still} />;
  return <OnlineScene still={still} />;
}

export function CareFormatSection() {
  const reduce = useReducedMotion() ?? false;
  const [state, setState] = useState<{ id: FormatId; direction: number }>({ id: "clinic", direction: 1 });
  const index = FORMATS.findIndex((f) => f.id === state.id);
  const format = FORMATS[index];

  const choose = (id: FormatId) => {
    const next = FORMATS.findIndex((f) => f.id === id);
    if (next !== index) setState({ id, direction: next > index ? 1 : -1 });
  };

  // Phones: swipe the panel to move between formats
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 60) return;
    const next = index + (info.offset.x < 0 ? 1 : -1);
    if (next >= 0 && next < FORMATS.length) choose(FORMATS[next].id);
  };

  const slide = reduce ? 0 : 48;

  return (
    <section id="care" className="bg-rh-canvas px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="max-w-md text-[36px] font-bold leading-[1.05] tracking-tight text-rh-ink sm:text-5xl">
            Choose where care happens.
          </h2>
          <p className="max-w-xs text-[15px] leading-relaxed text-rh-ink/65">
            Choose a preference. Your clinician confirms the right format for your care.
          </p>
        </div>

        <SegmentedSwitch
          idBase={ID}
          label="Where care happens"
          options={FORMATS}
          value={state.id}
          onChange={choose}
          className="mt-8 flex w-full sm:inline-flex sm:w-auto"
        />

        <div id={switchPanelId(ID)} role="tabpanel" aria-labelledby={switchTabId(ID, state.id)} className="mt-6 overflow-hidden rounded-[2rem]">
          <AnimatePresence mode="wait" initial={false} custom={state.direction}>
            <motion.div
              key={format.id}
              custom={state.direction}
              variants={{
                enter: (dir: number) => ({ opacity: 0, x: dir * slide }),
                center: { opacity: 1, x: 0 },
                exit: (dir: number) => ({ opacity: 0, x: dir * -slide }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reduce ? 0.15 : 0.4, ease: EASE }}
              drag={reduce ? false : "x"}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              dragDirectionLock
              onDragEnd={onDragEnd}
              className="grid bg-white lg:min-h-[460px] lg:grid-cols-[1fr_1.05fr]"
            >
              <div className="flex min-h-[280px] items-center justify-center bg-rh-ink p-8 sm:min-h-[340px] lg:p-12">
                <motion.div
                  className="flex w-full justify-center"
                  initial={reduce ? false : { scale: 0.94, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
                >
                  <Scene id={format.id} still={reduce} />
                </motion.div>
              </div>

              <div className="flex flex-col p-6 sm:p-10 lg:p-12">
                <h3 className="text-[26px] font-bold leading-tight tracking-tight text-rh-ink sm:text-[32px]">{format.heading}</h3>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-rh-ink/65 sm:text-base">{format.body}</p>

                <ol className="mt-7">
                  {format.points.map((point, i) => (
                    <li key={point} className="flex gap-4 border-t border-rh-ink/10 py-4 text-[15px] leading-snug text-rh-ink">
                      <span className="w-5 shrink-0 tabular-nums text-rh-ink/40">{String(i + 1).padStart(2, "0")}</span>
                      {point}
                    </li>
                  ))}
                </ol>

                <div className="mt-auto pt-6">
                  <a
                    href={joyWhatsAppUrl(format.message)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex h-12 items-center gap-2 rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2"
                  >
                    {format.cta}
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </a>
                  <p className="mt-3 text-xs text-rh-ink/50">Service suitability and availability are confirmed by the care team.</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
