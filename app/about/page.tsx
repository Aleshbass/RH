"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { ArrowRight } from "@/components/icons";
import { MarketingVideo } from "@/components/landing/MarketingVideo";
import { PairingShapes } from "@/components/learn/shared";
import { PARTNER_SUPPORT_EMAIL, SUPPORT_EMAIL } from "@/lib/contact";
import { joyWhatsAppUrl } from "@/lib/joyWhatsApp";
import { MARKETING_VIDEOS } from "@/lib/marketingVideos";
import { SITE_CONFIG } from "@/lib/seo/config";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const JOY_URL = joyWhatsAppUrl("Hi Joy! I need help with my recovery.");
const { supportPhone, officeHours } = SITE_CONFIG.organization;

// The ink story section goes two-column only once the film URL is set
const HAS_FILM = Boolean(MARKETING_VIDEOS.launchFilm);

// Same published figures as the landing page proof band. Keep them true.
const FACTS = [
  { value: "500+", label: "people using Rehabify" },
  { value: "Under 24 hrs", label: "usual time to match you with a physiotherapist" },
  { value: "MRTBN", label: "licensed physiotherapists" },
];

const AUDIENCES: {
  title: string;
  points: string[];
  link: { label: string; href: string; external?: boolean };
}[] = [
  {
    title: "For patients",
    points: [
      "Tell Joy what's wrong on WhatsApp.",
      "We match you with a licensed physiotherapist, usually within 24 hours.",
      "See your fee before you pay.",
      "Session notes, exercises and progress in one app.",
    ],
    link: { label: "Chat with Joy", href: JOY_URL, external: true },
  },
  {
    title: "For physiotherapists",
    points: [
      "Patients matched to your skills, with no marketing costs.",
      "Scheduling, notes, payments and messages in one place.",
      "A fixed payout for every completed session.",
    ],
    link: { label: "Join our network", href: "/physiotherapist" },
  },
  {
    title: "For doctors and partners",
    points: [
      "Refer a patient in a few steps. We match them with a physiotherapist.",
      "Follow each referral's status from your partner account.",
      "Earn when referred patients pay for care.",
    ],
    link: { label: "Become a partner", href: "/partners/sign-up" },
  },
];

const STANDARDS = [
  "Licensed by the Medical Rehabilitation Therapists Board of Nigeria (MRTBN).",
  "Reviewed and approved by the Rehabify team.",
  "Degree certificate and passport photo on file before patients can book them.",
  "Rated and reviewed by the patients they treat.",
];

const VALUES = [
  { title: "Patient outcomes first", body: "Success is a patient back to their life, not a booking." },
  { title: "Fix the system", body: "We build the missing links in care, not quick fixes." },
  { title: "Clinical judgement", body: "Every decision starts with: would this be good for my patient?" },
  { title: "Clear prices", body: "Patients see the fee before they pay. Physiotherapists know their payout." },
  { title: "Respect for providers", body: "Physiotherapists set their working hours and are paid for every completed session." },
];

// The logo banner. Paste a logo's URL (e.g. uploaded to Cloudinary) into `logo`; until then the
// organisation's name shows in its tile.
const ORGANISATIONS = [
  { name: "Mastercard Foundation", logo: "" },
  { name: "Africa Oxford Initiative", logo: "" },
  { name: "MediLoan by MyItura", logo: "https://loans.myitura.com/static/assets/logos/mediloan.svg?v=a5762be08a39" },
  { name: "AwaDoc", logo: "https://www.awadoc.com/_next/image?url=%2Fawadoc.png&w=256&q=75" },
  { name: "Goshen Physiotherapy", logo: "" },
];

// Cloudinary crops portraits around the face and serves WebP/AVIF at the size shown
const CLOUDINARY = "https://res.cloudinary.com/dubeogufg/image/upload";
const FOUNDERS = [
  { name: "Mary Akinwola", role: "Co-founder Â· Physiotherapist", photo: `${CLOUDINARY}/c_fill,g_face,ar_4:5,w_800,q_auto,f_auto/v1792946835/Mary_Akinwola_sjvv0a.jpg` },
  { name: "Ademola Abass", role: "Co-founder Â· Doctor of Physiotherapy", photo: `${CLOUDINARY}/c_fill,g_face,ar_4:5,w_800,q_auto,f_auto/v1792946835/Abass_Ademola_gvqglh.jpg` },
];
const FOUNDERS_TOGETHER = `${CLOUDINARY}/c_limit,w_1600,q_auto,f_auto/v1792946835/Mary_and_Demola_oebqbg.jpg`;

const CONTACTS: { label: string; value: string; href?: string }[] = [
  { label: "Patient support", value: supportPhone, href: `tel:${supportPhone.replace(/\s/g, "")}` },
  { label: "Provider enquiries", value: PARTNER_SUPPORT_EMAIL, href: `mailto:${PARTNER_SUPPORT_EMAIL}` },
  { label: "General questions", value: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
  { label: "Office hours", value: officeHours },
];

const num = (i: number) => String(i + 1).padStart(2, "0");

const primaryCta =
  "group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2";
const secondaryCta =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-7 text-[15px] font-semibold text-rh-ink ring-1 ring-inset ring-rh-ink/10 transition-colors hover:ring-rh-ink/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rh-ink";
const textLink =
  "group inline-flex items-center gap-2 rounded-sm text-[15px] font-semibold text-rh-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2";
const h2Class = "text-[34px] font-bold leading-[1.05] tracking-tight sm:text-5xl";

function Rise({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Arrow() {
  return <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />;
}

export default function AboutPage() {
  return (
    <div className="bg-rh-canvas">
      {/* Mission */}
      <section className="px-4 pb-16 pt-[132px] sm:px-6 sm:pt-40 lg:pb-24 lg:pt-48">
        <Rise className="mx-auto max-w-6xl">
          <h1 className="text-[40px] font-bold leading-[1.05] tracking-tight text-rh-ink sm:text-6xl lg:text-[68px]">About Rehabify</h1>
          <p className="mt-6 max-w-3xl text-[26px] font-bold leading-tight tracking-tight text-rh-ink sm:text-[34px]">
            Better rehabilitation care shouldn&apos;t end when your appointment does.
          </p>
          <div className="mt-6 max-w-2xl space-y-4 text-lg font-medium leading-relaxed text-rh-ink/75">
            <p>
              Needing care is one thing. Finding the right professional, understanding your treatment and knowing what to do
              between appointments can be another.
            </p>
            <p>At Rehabify, we&apos;re making rehabilitation easier to access, understand and follow through.</p>
            <p>
              We connect people with qualified physiotherapists for virtual and home-based care, while giving clinicians and
              clinics the tools to manage treatment, create personalised recovery programmes and support patients beyond their
              appointments.
            </p>
          </div>
          <p className="mt-6 text-xl font-bold text-rh-ink">
            <span className="relative inline-block">
              Built for Better Care.
              <span aria-hidden className="absolute -bottom-1 left-0 h-[0.14em] w-full rounded-full bg-rh-lime" />
            </span>
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href={JOY_URL} target="_blank" rel="noopener noreferrer" className={cn(primaryCta, "focus-visible:ring-offset-rh-canvas")}>
              Chat with Joy
              <Arrow />
            </a>
            <Link href="/physiotherapist" className={secondaryCta}>
              Join as a physiotherapist
            </Link>
          </div>

          <dl className="mt-14 grid gap-x-8 sm:grid-cols-3">
            {FACTS.map((fact) => (
              <div key={fact.label} className="flex flex-col-reverse justify-end border-t border-rh-ink/10 py-5">
                <dt className="mt-1.5 text-[15px] leading-snug text-rh-ink/70">{fact.label}</dt>
                <dd className="text-[28px] font-bold leading-tight tracking-tight text-rh-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </Rise>
      </section>

      {/* Our mission: the statement beside the launch film, then the founders' story */}
      <section className="overflow-hidden bg-rh-ink px-4 py-20 text-white sm:px-6 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <div className={cn(HAS_FILM && "grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16")}>
            <Rise className={HAS_FILM ? undefined : "max-w-3xl"}>
              <h2 className={h2Class}>Our mission</h2>
              <p className="mt-6 text-[22px] font-bold leading-snug tracking-tight sm:text-[28px]">
                To make quality rehabilitation care more accessible and continuous by connecting people with qualified
                physiotherapists and giving patients and care providers the tools they need to support recovery{" "}
                <span className="text-rh-lime">beyond the clinic.</span>
              </p>
            </Rise>

            {HAS_FILM && (
              <Rise delay={0.1} className="relative">
                <PairingShapes className="-right-5 -top-6 h-32 w-32 sm:-right-8 sm:-top-8 sm:h-44 sm:w-44" />
                <MarketingVideo url={MARKETING_VIDEOS.launchFilm} title="Rehabify launch film" mode="preview" className="ring-1 ring-white/10" />
              </Rise>
            )}
          </div>

          <Rise delay={0.05}>
            <div className="mt-14 grid gap-x-12 gap-y-4 border-t border-white/10 pt-10 text-[17px] font-medium leading-relaxed text-white/75 lg:grid-cols-2">
              <div className="space-y-4">
                <p>
                  Rehabify was launched in 2025 by Mary Akinwola and Ademola Abass, two physiotherapists trained in Nigeria who
                  understand the practical challenges of delivering and accessing rehabilitation care.
                </p>
                <p>
                  Through our clinical training and experience, we recognised that the challenges of rehabilitation often extend
                  beyond the treatment itself. Finding appropriate care can be difficult, patients may struggle to follow their
                  prescribed exercises at home, and physiotherapists need better ways to manage treatment and stay informed about
                  their patients&apos; progress.
                </p>
                <p>
                  We wanted to build something that addressed these challenges. Mary went on to study at the University of Oxford,
                  while Ademola advanced his clinical training to become a Doctor of Physiotherapy. Our combined backgrounds in
                  rehabilitation and technology have influenced how we&apos;ve approached Rehabify from the beginning.
                </p>
              </div>
              <div className="space-y-4">
                <p>
                  We&apos;re building Rehabify because we believe good care should be{" "}
                  <span className="font-bold text-white">easier to access, easier to deliver and easier to continue.</span>
                </p>
                <p>
                  We believe patients should be able to access appropriate care without unnecessary difficulty, understand the
                  treatment they&apos;re receiving and feel supported as they work towards getting better. That&apos;s why Rehabify
                  brings together clinician-led physiotherapy, personalised home exercise programmes, progress tracking and digital
                  recovery support.
                </p>
                <p className="font-bold text-white">
                  Our goal is to make it easier for physiotherapists to deliver care and for patients to follow it, wherever their
                  recovery takes place.
                </p>
              </div>
            </div>
          </Rise>
        </div>
      </section>

      {/* The founders */}
      <section className="px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <Rise>
            <h2 className={cn(h2Class, "text-rh-ink")}>Meet the founders.</h2>
          </Rise>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {FOUNDERS.map((founder, i) => (
              <Rise key={founder.name} delay={0.06 * i}>
                <figure>
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-rh-ink/10">
                    <Image
                      src={founder.photo}
                      alt={`${founder.name}, ${founder.role.toLowerCase()} at Rehabify`}
                      fill
                      unoptimized
                      sizes="(min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  <figcaption className="mt-4">
                    <span className="block text-xl font-bold text-rh-ink">{founder.name}</span>
                    <span className="mt-0.5 block text-[15px] font-medium text-rh-ink/65">{founder.role}</span>
                  </figcaption>
                </figure>
              </Rise>
            ))}
          </div>
          <Rise delay={0.1} className="relative mt-5">
            <div className="relative aspect-[16/10] overflow-hidden rounded-[2rem] bg-rh-ink/10 sm:aspect-[16/8]">
              <Image
                src={FOUNDERS_TOGETHER}
                alt="Mary Akinwola and Ademola Abass, Rehabify's co-founders"
                fill
                unoptimized
                sizes="(min-width: 1152px) 1152px, 100vw"
                className="object-cover"
              />
            </div>
          </Rise>
        </div>
      </section>

      {/* What we offer */}
      <section className="px-4 pb-20 sm:px-6 lg:pb-28">
        <div className="mx-auto max-w-6xl">
          <Rise>
            <h2 className={cn(h2Class, "max-w-2xl text-rh-ink")}>One platform for everyone in the care chain.</h2>
          </Rise>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {AUDIENCES.map((audience, i) => (
              <Rise key={audience.title} delay={0.05 * (i + 1)} className="flex">
                <article className="flex w-full flex-col rounded-[2rem] bg-white p-7 sm:p-8">
                  <h3 className="text-[24px] font-bold leading-tight tracking-tight text-rh-ink">{audience.title}</h3>
                  <ul className="mt-5 flex-1">
                    {audience.points.map((point) => (
                      <li key={point} className="border-t border-rh-ink/10 py-3.5 text-[15px] font-medium leading-snug text-rh-ink/75">
                        {point}
                      </li>
                    ))}
                  </ul>
                  <div className="pt-5">
                    {audience.link.external ? (
                      <a href={audience.link.href} target="_blank" rel="noopener noreferrer" className={textLink}>
                        {audience.link.label}
                        <Arrow />
                      </a>
                    ) : (
                      <Link href={audience.link.href} className={textLink}>
                        {audience.link.label}
                        <Arrow />
                      </Link>
                    )}
                  </div>
                </article>
              </Rise>
            ))}
          </div>
        </div>
      </section>

      {/* Quality standards */}
      <section className="bg-rh-ink px-4 py-20 text-white sm:px-6 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <Rise>
            <h2 className={cn(h2Class, "max-w-xl")}>Every physiotherapist is checked.</h2>
            <p className="mt-4 max-w-lg text-base font-medium leading-relaxed text-white/75 sm:text-lg">
              We&apos;re physiotherapists too, so we hold our network to our own standard.
            </p>
          </Rise>
          <Rise delay={0.06}>
            <ol className="mt-10 grid gap-x-12 sm:grid-cols-2">
              {STANDARDS.map((standard, i) => (
                <li key={standard} className="flex gap-5 border-t border-white/10 py-5">
                  <span className="w-6 shrink-0 pt-0.5 text-sm tabular-nums text-white/40">{num(i)}</span>
                  <span className="text-[17px] font-semibold leading-snug">{standard}</span>
                </li>
              ))}
            </ol>
          </Rise>
        </div>
      </section>

      {/* Values */}
      <section className="px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <Rise>
            <h2 className={cn(h2Class, "text-rh-ink")}>What we value.</h2>
          </Rise>
          <Rise delay={0.06}>
            <ol className="mt-10 grid gap-x-12 rounded-[2rem] bg-white px-7 py-3 sm:grid-cols-2 sm:px-10 sm:py-6">
              {VALUES.map((value, i) => (
                <li key={value.title} className={cn("flex gap-5 py-5", i > 0 && "border-t border-rh-ink/10", i === 1 && "sm:border-t-0")}>
                  <span className="w-6 shrink-0 pt-0.5 text-sm tabular-nums text-rh-ink/40">{num(i)}</span>
                  <span>
                    <span className="block text-[17px] font-semibold leading-snug text-rh-ink">{value.title}</span>
                    <span className="mt-1 block text-[15px] font-medium leading-relaxed text-rh-ink/70">{value.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Rise>
        </div>
      </section>

      {/* Organisations and partners, as a slow logo banner */}
      <section aria-labelledby="growing-heading" className="overflow-hidden pb-20 lg:pb-28">
        <Rise className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 id="growing-heading" className={cn(h2Class, "max-w-3xl text-rh-ink")}>
            Growing with the people and organisations who believe in better care
          </h2>
          <p className="mt-5 max-w-2xl text-lg font-medium leading-relaxed text-rh-ink/70">
            Our journey is strengthened by the organisations, clinical collaborators and healthtech partners who have supported
            or worked with us as we build Rehabify.
          </p>
        </Rise>
        <div className="mt-10 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
          {/* The list is rendered twice so moving it by half loops seamlessly; reduced motion shows one static row */}
          <ul className="flex w-max animate-marquee hover:[animation-play-state:paused] motion-reduce:w-auto motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-y-4 motion-reduce:px-4">
            {[...ORGANISATIONS, ...ORGANISATIONS].map((org, i) => (
              <li
                key={`${org.name}-${i}`}
                aria-hidden={i >= ORGANISATIONS.length || undefined}
                className={cn(
                  // Spacing as a right margin on every tile, so the two halves are exactly equal and the loop has no seam
                  "mr-4 flex h-24 w-[240px] shrink-0 items-center justify-center rounded-[1.5rem] bg-white px-8",
                  i >= ORGANISATIONS.length && "motion-reduce:hidden"
                )}
              >
                {org.logo ? (
                  <Image src={org.logo} alt={org.name} width={180} height={56} unoptimized className="max-h-12 w-auto object-contain" />
                ) : (
                  <span className="text-center text-lg font-bold leading-tight tracking-tight text-rh-ink">{org.name}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="px-4 pb-20 sm:px-6 lg:pb-28">
        <Rise className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-rh-ink px-7 py-12 text-white sm:px-12 sm:py-16">
          <PairingShapes className="-right-10 -top-10 h-40 w-40 sm:h-52 sm:w-52" />
          <div className="relative max-w-2xl">
            <h2 className="text-[32px] font-bold leading-tight tracking-tight sm:text-[44px]">Your recovery deserves the right support.</h2>
            <p className="mt-4 text-lg font-medium leading-relaxed text-white/75">
              If you&apos;re recovering from an injury, managing pain or working towards moving more comfortably, we&apos;re here to
              help you take the next step with appropriate care.
            </p>
            <a
              href={JOY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(primaryCta, "mt-8 focus-visible:ring-rh-lime focus-visible:ring-offset-rh-ink")}
            >
              Get Started
              <Arrow />
            </a>
          </div>
        </Rise>
      </section>

      {/* Contact */}
      <section className="px-4 pb-20 sm:px-6 lg:pb-28">
        <Rise className="mx-auto max-w-6xl">
          <div className="grid gap-10 rounded-[2rem] bg-white p-7 sm:p-10 lg:grid-cols-2 lg:gap-16 lg:p-12">
            <div>
              <h2 className={cn(h2Class, "text-rh-ink")}>Talk to us.</h2>
              <p className="mt-4 max-w-md text-base font-medium leading-relaxed text-rh-ink/70 sm:text-lg">
                Book care with Joy on WhatsApp, or reach the right team.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href={JOY_URL} target="_blank" rel="noopener noreferrer" className={primaryCta}>
                  Chat with Joy
                  <Arrow />
                </a>
                <Link href="/contact" className={secondaryCta}>
                  All contact options
                </Link>
              </div>
            </div>

            <dl>
              {CONTACTS.map((contact) => (
                <div key={contact.label} className="flex flex-col gap-1 border-t border-rh-ink/10 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <dt className="text-[15px] text-rh-ink/60">{contact.label}</dt>
                  <dd className="break-words text-[15px] font-semibold text-rh-ink">
                    {contact.href ? (
                      <a href={contact.href} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink">
                        {contact.value}
                      </a>
                    ) : (
                      contact.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Rise>
      </section>
    </div>
  );
}
