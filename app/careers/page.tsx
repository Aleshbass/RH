"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "@/components/icons";
import { PairingShapes } from "@/components/learn/shared";
import { careersApi, jobMeta, type OpenJob } from "@/lib/careers";
import { CAREERS_HERO_FALLBACK, CAREERS_IMAGES } from "@/lib/careersImages";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const VALUES = [
  { title: "Patients first", body: "Every decision starts with someone's recovery." },
  { title: "Own your work", body: "A small team where what you build reaches patients quickly." },
  { title: "Learn together", body: "Clinicians and builders learning from each other every week." },
];

function FadeUp({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function RoleRow({ job }: { job: OpenJob }) {
  return (
    <Link
      href={`/careers/${job.slug}`}
      className="group flex items-center gap-4 rounded-[1.5rem] bg-white p-5 ring-1 ring-inset ring-rh-ink/[0.06] transition-colors hover:ring-rh-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink sm:p-6"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold leading-snug text-rh-ink sm:text-xl">{job.title}</span>
        <span className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-sm text-rh-ink/60">
          {jobMeta(job).map((part, i) => (
            <span key={part} className="inline-flex items-center gap-2">
              {i > 0 && <span aria-hidden className="h-1 w-1 rounded-full bg-rh-ink/25" />}
              {part}
            </span>
          ))}
        </span>
        <span className="mt-2 hidden text-[15px] leading-relaxed text-rh-ink/70 sm:block">{job.summary}</span>
      </span>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rh-canvas text-rh-ink transition-colors group-hover:bg-rh-lime">
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

export default function CareersPage() {
  const jobs = useQuery(careersApi.listOpenJobs, {});
  const [team, setTeam] = useState("All");

  const teams = useMemo(() => ["All", ...Array.from(new Set((jobs ?? []).map((j) => j.team))).sort()], [jobs]);
  const shown = useMemo(() => (jobs ?? []).filter((j) => team === "All" || j.team === team), [jobs, team]);
  const hero = CAREERS_IMAGES.hero.src ? CAREERS_IMAGES.hero : CAREERS_HERO_FALLBACK;
  const gallery = CAREERS_IMAGES.gallery.filter((img) => img.src);

  return (
    <div className="min-h-screen bg-rh-canvas text-rh-ink">
      {/* Hero */}
      <section className="px-4 pb-16 pt-32 sm:px-6 sm:pt-40 lg:pb-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <FadeUp>
            <h1 className="text-[44px] font-bold leading-[1.02] tracking-tight sm:text-[64px]">
              Build better care{" "}
              <span className="relative inline-block">
                with us.
                <span aria-hidden className="absolute -bottom-1 left-0 h-[0.12em] w-full rounded-full bg-rh-lime" />
              </span>
            </h1>
            <p className="mt-6 max-w-lg text-lg font-medium leading-relaxed text-rh-ink/75">
              Join the team helping people across Nigeria recover, at home, online and in clinics.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#roles"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2"
              >
                See open roles <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/about"
                className="inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-[15px] font-semibold text-rh-ink ring-1 ring-inset ring-rh-ink/10 transition-colors hover:bg-white/70"
              >
                About Rehabify
              </Link>
            </div>
          </FadeUp>

          <FadeUp delay={0.1} className="relative">
            <PairingShapes className="-right-4 -top-5 h-28 w-28 sm:-right-8 sm:-top-8 sm:h-40 sm:w-40" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] bg-rh-ink">
              <Image src={hero.src} alt={hero.alt} fill unoptimized priority sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* How we work */}
      <section className="px-4 pb-16 sm:px-6 lg:pb-24">
        <div className="mx-auto max-w-6xl">
          <FadeUp>
            <h2 className="text-[32px] font-bold leading-tight tracking-tight sm:text-[40px]">How we work</h2>
          </FadeUp>
          <FadeUp delay={0.05}>
            <ol className="mt-8 grid gap-x-10 sm:grid-cols-3">
              {VALUES.map((value, i) => (
                <li key={value.title} className="border-t border-rh-ink/10 py-5">
                  <span className="text-sm tabular-nums text-rh-ink/40">{String(i + 1).padStart(2, "0")}</span>
                  <span className="mt-2 block text-lg font-semibold">{value.title}</span>
                  <span className="mt-1 block text-[15px] font-medium leading-relaxed text-rh-ink/70">{value.body}</span>
                </li>
              ))}
            </ol>
          </FadeUp>
        </div>
      </section>

      {/* Life at Rehabify: only once photos are added in lib/careersImages.ts */}
      {gallery.length > 0 && (
        <section aria-label="Life at Rehabify" className="pb-16 lg:pb-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-[32px] font-bold leading-tight tracking-tight sm:text-[40px]">Life at Rehabify</h2>
          </div>
          {/* Phones swipe through the photos; larger screens see them side by side */}
          <div className="mx-auto mt-8 flex max-w-6xl snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-6">
            {gallery.map((img, i) => (
              <div key={img.src} className={cn("relative aspect-[4/5] w-[78%] shrink-0 snap-start overflow-hidden rounded-[1.75rem] bg-rh-ink sm:w-auto", i === 1 && "sm:translate-y-8")}>
                <Image src={img.src} alt={img.alt || "Life at Rehabify"} fill unoptimized sizes="(min-width: 640px) 33vw, 78vw" className="object-cover" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Open roles */}
      <section id="roles" className="scroll-mt-24 bg-rh-ink px-4 py-16 text-white sm:px-6 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-[32px] font-bold leading-tight tracking-tight sm:text-[40px]">Open roles</h2>
            {jobs && jobs.length > 0 && (
              <p className="text-sm text-white/60">
                {jobs.length} {jobs.length === 1 ? "role" : "roles"}
              </p>
            )}
          </div>

          {teams.length > 2 && (
            <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by team">
              {teams.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTeam(t)}
                  aria-pressed={team === t}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime",
                    team === t ? "bg-rh-lime text-rh-ink" : "bg-white/[0.06] text-white/75 ring-1 ring-inset ring-white/10 hover:text-white"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          <div className="mt-8 space-y-3">
            {jobs === undefined ? (
              [0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-[1.5rem] bg-white/[0.06]" />)
            ) : shown.length === 0 ? (
              <div className="rounded-[1.5rem] bg-white/[0.06] p-8 text-center ring-1 ring-inset ring-white/10">
                <p className="text-lg font-semibold">No open roles right now</p>
                <p className="mx-auto mt-2 max-w-sm text-[15px] text-white/65">
                  New roles are posted here first. Check back soon.
                </p>
              </div>
            ) : (
              shown.map((job) => <RoleRow key={job._id} job={job} />)
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
