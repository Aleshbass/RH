'use client'

import type { ComponentType } from 'react'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, ClipboardCheck, FileText, HeartHandshake, Lock, Scale, Search, Stethoscope, Users } from 'lucide-react'
import { CheckItem, pillGhostOnDark, pillLime } from '@/components/learn/shared'
import { cn } from '@/lib/utils'
import { AccessApplication } from './AccessApplication'
import { FadeUp, FaqItem, SectionHeading } from './shared'

const WHO_FOR = [
  "You've lost your job or income, including partway through treatment",
  "Your income doesn't stretch to the cost of the care you need",
  "You're a student, retired or not currently working",
  "Your HMO, employer or family can only cover part of it",
  "You're applying for someone you care for",
]

const STEPS: { icon: ComponentType<{ className?: string }>; title: string; body: string }[] = [
  {
    icon: FileText,
    title: 'Apply',
    body: 'A short form from your Rehabify patient account. It takes about five minutes.',
  },
  {
    icon: Search,
    title: 'We review',
    body: 'Every application is reviewed individually, against the same criteria. We may get in touch to confirm a few details.',
  },
  {
    icon: Users,
    title: "You're matched",
    body: "If you're approved, we match you with a Rehabify physiotherapist and confirm which sessions your Access rate covers.",
  },
  {
    icon: Stethoscope,
    title: 'Book and recover',
    body: 'Book through your account at your Access rate. Same assessment, same treatment, same standards.',
  },
]

const WE_ASK: { icon: ComponentType<{ className?: string }>; title: string; body: string }[] = [
  {
    icon: ClipboardCheck,
    title: 'What you need help with',
    body: 'The care you need and a line about your condition, so the right clinician reviews it.',
  },
  {
    icon: Scale,
    title: 'Your situation, in ranges',
    body: 'What best describes your circumstances and a monthly income band. Never exact figures or payslips.',
  },
  {
    icon: HeartHandshake,
    title: 'Any other help you have',
    body: 'HMO, employer or family support, so Access reaches the people who need it most.',
  },
  {
    icon: Lock,
    title: 'Nothing more',
    body: 'No documents up front. We may ask to verify some details during review, and we only use them to assess your application.',
  },
]

export function AccessPage() {
  return (
    <div className="bg-rh-cream">
      <Hero />

      <section className="bg-white px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <FadeUp>
            <SectionHeading
              eyebrow="Who it's for"
              title="For people who need rehab but are worried about the cost"
              description="If any of these sound like you, you can apply. If you're not sure, apply anyway and we'll look at your situation."
            />
          </FadeUp>
          <FadeUp delay={0.06}>
            <ul className="space-y-4 rounded-[2rem] bg-rh-cream p-7 sm:p-9">
              {WHO_FOR.map((item) => (
                <CheckItem key={item}>{item}</CheckItem>
              ))}
            </ul>
          </FadeUp>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <FadeUp>
            <SectionHeading eyebrow="How it works" title="Four steps, and the same care at the end" />
          </FadeUp>
          <FadeUp>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="h-full rounded-[1.75rem] bg-white p-6 shadow-soft">
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rh-honeydew text-rh-teal">
                      <step.icon className="h-5 w-5" />
                    </span>
                    <span aria-hidden className="text-sm font-semibold text-rh-night/35">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg leading-snug text-rh-night">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-6 text-rh-night/65">{step.body}</p>
                </li>
              ))}
            </ol>
          </FadeUp>
          <p className="mt-6 max-w-3xl text-sm leading-6 text-rh-night/60">
            Already being treated by a Rehabify physiotherapist? Say so on the form and, where we can, we&apos;ll keep you with
            them.
          </p>
        </div>
      </section>

      <section className="bg-white px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <FadeUp>
            <SectionHeading
              eyebrow="What we ask, and why"
              title="We only ask what we need"
              description="Applying shouldn't feel like an interrogation. Here's everything the form covers."
            />
          </FadeUp>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-12">
            {WE_ASK.map((item, i) => (
              <FadeUp key={item.title} delay={i * 0.05}>
                <div className="flex h-full items-start gap-4 rounded-[1.75rem] bg-rh-cream p-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-rh-teal">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-lg leading-snug text-rh-night">{item.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-6 text-rh-night/65">{item.body}</p>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
          <FadeUp>
            <div className="mt-6 rounded-[1.75rem] bg-rh-peach p-6 sm:p-7">
              <p className="font-semibold text-rh-night">Places are limited</p>
              <p className="mt-1.5 text-[15px] leading-6 text-rh-night/75">
                Rehabify Access depends on programme capacity, so assisted rates aren&apos;t guaranteed for everyone who applies.
                If we can&apos;t offer a place straight away, we may add you to the waiting list. In the meantime you can book at our{' '}
                <Link href="/pricing" className="font-semibold text-rh-night underline underline-offset-2">
                  standard prices
                </Link>{' '}
                or spread the cost with{' '}
                <Link href="/pricing#mediloan" className="font-semibold text-rh-night underline underline-offset-2">
                  MediLoan
                </Link>
                .
              </p>
            </div>
          </FadeUp>
        </div>
      </section>

      <section id="apply" className="scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-3xl">
          <FadeUp>
            <SectionHeading
              eyebrow="Apply"
              title="Apply for Assisted Care"
              description="Tell us a little about your situation. It takes about five minutes."
            />
          </FadeUp>
          <div className="mt-10">
            <AccessApplication />
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-3xl">
          <FadeUp>
            <SectionHeading eyebrow="Questions" title="Rehabify Access, answered" center />
          </FadeUp>
          <div className="mt-10">
            <FaqItem question="Is assisted care a lower-quality service?">
              No. You see a qualified Rehabify physiotherapist, with the same assessment, treatment and clinical standards as
              any other patient. Only the price is different.
            </FaqItem>
            <FaqItem question="How do you decide who gets a place?">
              Every application is reviewed individually, against the same criteria: your clinical need, your circumstances
              and any other help you have. Places also depend on how much capacity the programme has at the time.
            </FaqItem>
            <FaqItem question="Do I need to send documents?">
              Not to apply. We ask for an income range, not exact figures. If we need to verify anything, we&apos;ll get in
              touch during the review.
            </FaqItem>
            <FaqItem question="Can I book while I wait for a decision?">
              Yes. You can book at our{' '}
              <Link href="/pricing" className="font-semibold text-rh-teal underline-offset-4 hover:underline">
                standard prices
              </Link>{' '}
              at any time. An Access rate applies to sessions booked after you&apos;re approved.
            </FaqItem>
            <FaqItem question="Is Rehabify Access the same as MediLoan?">
              No. Rehabify Access is our own assisted care programme, offering reduced fees or flexible arrangements to eligible
              patients. MediLoan is healthcare financing from our partner MyItura: you pay for care now and repay MyItura over
              time.{' '}
              <Link href="/partners/mediloan" className="font-semibold text-rh-teal underline-offset-4 hover:underline">
                About MediLoan
              </Link>
            </FaqItem>
          </div>
        </div>
      </section>
    </div>
  )
}

function Hero() {
  return (
    <section className="px-4 pb-16 pt-24 sm:px-6 sm:pt-28 lg:pb-20">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[linear-gradient(140deg,#005b57_0%,#005b57_58%,#003f3c_100%)] text-white sm:rounded-[2.5rem]">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-rh-aqua/10 blur-3xl" />
        <div className="relative grid gap-12 px-6 py-12 sm:px-10 sm:py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-14 lg:px-16 lg:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-rh-mint ring-1 ring-inset ring-white/15">
              <span className="h-1.5 w-1.5 rounded-full bg-rh-lime" />
              Rehabify Access · Assisted care
            </span>
            <h1 className="mt-6 text-[38px] leading-[1.05] tracking-tight text-white sm:text-[52px] lg:text-[56px]">
              Cost shouldn&apos;t stand between you and recovery
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
              Financial circumstances shouldn&apos;t prevent appropriate recovery care. If you need rehabilitation but are
              worried about the cost, apply for Rehabify Access. Eligible patients may get reduced-fee physiotherapy or a
              flexible arrangement.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#apply" className={cn(pillLime, 'h-12 px-7 text-[15px]')}>
                Apply for Assisted Care <ArrowRight className="h-4 w-4" />
              </a>
              <Link href="/pricing" className={cn(pillGhostOnDark, 'h-12 px-7 text-[15px]')}>
                See our standard prices
              </Link>
            </div>
          </div>

          <ul className="space-y-3">
            {[
              { icon: BadgeCheck, title: 'The same clinical standards', body: 'Qualified Rehabify physiotherapists. Not a lower-quality service.' },
              { icon: Scale, title: 'Fair and consistent', body: 'Every application reviewed individually, against the same criteria.' },
              { icon: Lock, title: 'Only what we need', body: 'Income in ranges, no documents up front.' },
            ].map((item) => (
              <li key={item.title} className="flex items-start gap-3.5 rounded-[1.5rem] bg-white/[0.07] p-5 ring-1 ring-inset ring-white/10">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-rh-lime">
                  <item.icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-snug text-white">{item.title}</p>
                  <p className="mt-1 text-sm leading-5 text-white/70">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
