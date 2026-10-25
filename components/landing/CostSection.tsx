"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { ArrowRight } from "@/components/icons";
import { joyWhatsAppUrl } from "@/lib/joyWhatsApp";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const MEDILOAN_LOGO = "https://loans.myitura.com/static/assets/logos/mediloan.svg?v=a5762be08a39";

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

const pill =
  "group inline-flex h-12 items-center gap-2 self-start rounded-full px-7 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

/** "Understand your cost before you book": what is free, when the fee is confirmed, and pay-later. */
export function CostSection() {
  return (
    <section id="cost" className="bg-rh-canvas px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <Rise>
          <h2 className="max-w-xl text-[36px] font-bold leading-[1.05] tracking-tight text-rh-ink sm:text-5xl">
            Understand your cost before you book.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-rh-ink/75 sm:text-lg">
            Ask about your options for free, then see your physiotherapist&apos;s fee before you pay.
          </p>
        </Rise>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <Rise delay={0.05} className="flex">
            <article className="flex w-full flex-col rounded-[2rem] bg-white p-7 sm:p-9">
              <p className="text-sm font-semibold text-rh-ink/60">Ask Joy</p>
              <h3 className="mt-2 text-[28px] font-bold leading-tight text-rh-ink sm:text-[32px]">Free to ask</h3>
              <p className="mt-3 max-w-md text-[15px] font-medium leading-relaxed text-rh-ink/75">
                Start a conversation about finding care. Assessments and treatment sessions are charged separately.
              </p>
              <a
                href={joyWhatsAppUrl("Hi Joy, how much will my physiotherapy cost?")}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(pill, "mt-8 bg-rh-lime text-rh-ink hover:bg-rh-lime-deep focus-visible:ring-rh-ink")}
              >
                Ask Joy about pricing
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </a>
            </article>
          </Rise>

          <Rise delay={0.1} className="flex">
            <article className="flex w-full flex-col rounded-[2rem] bg-rh-ink p-7 text-white sm:p-9">
              <p className="text-sm font-semibold text-white/60">Your care quote</p>
              <h3 className="mt-2 text-[28px] font-bold leading-tight sm:text-[32px]">Confirmed before payment</h3>
              <p className="mt-3 max-w-md text-[15px] font-medium leading-relaxed text-white/75">
                Your physiotherapist, care format and number of sessions set the fee. You see it before you pay.
              </p>
              <Link href="/pricing" className={cn(pill, "mt-8 bg-white text-rh-ink hover:bg-white/90 focus-visible:ring-rh-lime focus-visible:ring-offset-rh-ink")}>
                See pricing
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </article>
          </Rise>
        </div>

        <Rise delay={0.15}>
          <div className="mt-5 flex flex-col gap-5 rounded-[2rem] bg-white p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
            <div className="flex items-center gap-5">
              <Image src={MEDILOAN_LOGO} alt="MediLoan by MyItura" width={120} height={36} unoptimized className="hidden h-9 w-auto sm:block" />
              <div>
                <h3 className="text-xl font-bold leading-tight text-rh-ink">Can&apos;t pay it all at once? Pay small small.</h3>
                <p className="mt-1 text-[15px] font-medium text-rh-ink/70">
                  Spread the cost with MediLoan by MyItura, subject to approval and the lender&apos;s terms.
                </p>
              </div>
            </div>
            <Link
              href="/pay-later"
              className="group inline-flex shrink-0 items-center gap-2 self-start text-[15px] font-semibold text-rh-ink underline-offset-4 hover:underline sm:self-center"
            >
              See how pay-later works
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
        </Rise>
      </div>
    </section>
  );
}
