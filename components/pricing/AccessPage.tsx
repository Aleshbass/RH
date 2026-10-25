'use client'

import Link from 'next/link'
import { ArrowRight } from '@/components/icons'
import { CheckItem } from '@/components/learn/shared'
import { AccessApplication } from './AccessApplication'
import { ctaPrimary, ctaSecondary, FadeUp, FaqItem, SectionHeading, textLink } from './shared'

const PROMISES = [
  { title: 'The same clinical standards', body: 'Qualified Rehabify physiotherapists. Not a lower-quality service.' },
  { title: 'Fair and consistent', body: 'Every application reviewed against the same criteria.' },
  { title: 'Only what we need', body: 'Income in ranges, no documents up front.' },
]

const WHO_FOR = [
  "You've lost your job or income, including partway through treatment",
  "Your income doesn't stretch to the cost of the care you need",
  "You're a student, retired or not currently working",
  'Your HMO, employer or family can only cover part of it',
  "You're applying for someone you care for",
]

const STEPS = [
  { title: 'Apply', body: 'A short form from your Rehabify patient account. About five minutes.' },
  { title: 'We review', body: 'Each application is reviewed against the same criteria. We may get in touch to confirm details.' },
  { title: "You're matched", body: 'If approved, we match you with a Rehabify physiotherapist and confirm which sessions your Access rate covers.' },
  { title: 'Book and recover', body: 'Book through your account at your Access rate. Same care, same standards.' },
]

const WE_ASK = [
  { title: 'What you need help with', body: 'The care you need and a line about your condition.' },
  { title: 'Your situation, in ranges', body: 'Your circumstances and a monthly income band. Never exact figures or payslips.' },
  { title: 'Any other help you have', body: 'HMO, employer or family support, so Access reaches the people who need it most.' },
  { title: 'Nothing more', body: 'No documents up front. If we verify details during review, we only use them to assess your application.' },
]

const number = (i: number) => String(i + 1).padStart(2, '0')

export function AccessPage() {
  return (
    <div className="overflow-x-clip bg-rh-canvas text-rh-ink">
      <Hero />

      <section className="px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-16">
          <FadeUp>
            <SectionHeading
              title="For people who need rehab but are worried about the cost"
              description="If any of these sound like you, apply. Not sure? Apply anyway and we'll look at your situation."
            />
          </FadeUp>
          <FadeUp delay={0.06}>
            <ul className="space-y-4 rounded-[2rem] bg-white p-7 sm:p-9">
              {WHO_FOR.map((item) => (
                <CheckItem key={item}>{item}</CheckItem>
              ))}
            </ul>
          </FadeUp>
        </div>
      </section>

      <section className="bg-rh-ink px-4 py-20 text-white sm:px-6 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <FadeUp>
            <SectionHeading onDark title="Four steps, and the same care at the end" />
          </FadeUp>
          <FadeUp delay={0.05}>
            <ol className="mt-12 grid gap-x-8 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="border-t border-white/10 py-6">
                  <span aria-hidden className="text-sm font-semibold tabular-nums text-white/40">
                    {number(i)}
                  </span>
                  <h3 className="mt-3 text-[20px] font-bold leading-snug tracking-tight text-white">{step.title}</h3>
                  <p className="mt-2 text-[15px] font-medium leading-6 text-white/70">{step.body}</p>
                </li>
              ))}
            </ol>
          </FadeUp>
          <p className="mt-8 max-w-2xl text-[15px] font-medium leading-6 text-white/60">
            Already being treated by a Rehabify physiotherapist? Say so on the form and, where we can, we&apos;ll keep you with them.
          </p>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <FadeUp>
            <SectionHeading title="We only ask what we need" description="Here's everything the form covers." />
          </FadeUp>
          <ol className="mt-10 grid gap-x-10 sm:grid-cols-2 lg:mt-12">
            {WE_ASK.map((item, i) => (
              <li key={item.title} className="flex gap-4 border-t border-rh-ink/10 py-5">
                <span aria-hidden className="w-6 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-rh-ink/40">
                  {number(i)}
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold leading-snug tracking-tight text-rh-ink">{item.title}</h3>
                  <p className="mt-1 text-[15px] font-medium leading-6 text-rh-ink/70">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <FadeUp>
            <div className="mt-8 rounded-[2rem] bg-white p-7 sm:p-9">
              <p className="text-lg font-bold text-rh-ink">Places are limited</p>
              <p className="mt-2 max-w-3xl text-[15px] font-medium leading-6 text-rh-ink/70 sm:text-base">
                Access depends on programme capacity, so assisted rates aren&apos;t guaranteed. If there&apos;s no place straight
                away, we may add you to the waiting list. Meanwhile, book at our{' '}
                <Link href="/pricing" className={textLink}>
                  standard prices
                </Link>{' '}
                or spread the cost with{' '}
                <Link href="/pricing#mediloan" className={textLink}>
                  MediLoan
                </Link>
                .
              </p>
            </div>
          </FadeUp>
        </div>
      </section>

      <section id="apply" className="scroll-mt-20 px-4 pb-20 pt-4 sm:px-6 lg:pb-28">
        <div className="mx-auto max-w-3xl">
          <FadeUp>
            <SectionHeading title="Apply for Assisted Care" description="Tell us a little about your situation. It takes about five minutes." />
          </FadeUp>
          <div className="mt-10">
            <AccessApplication />
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 pt-4 sm:px-6 lg:pb-28">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <FadeUp>
            <h2 className="text-[34px] font-bold leading-[1.05] tracking-tight text-rh-ink sm:text-5xl">Rehabify Access, answered</h2>
          </FadeUp>
          <div className="border-b border-rh-ink/10">
            <FaqItem question="Is assisted care a lower-quality service?">
              No. You see a qualified Rehabify physiotherapist, with the same assessment, treatment and clinical standards as any
              other patient. Only the price is different.
            </FaqItem>
            <FaqItem question="How do you decide who gets a place?">
              Every application is reviewed against the same criteria: your clinical need, your circumstances and any other help
              you have. Places also depend on the programme&apos;s capacity at the time.
            </FaqItem>
            <FaqItem question="Do I need to send documents?">
              Not to apply. We ask for an income range, not exact figures. If we need to verify anything, we&apos;ll get in touch
              during the review.
            </FaqItem>
            <FaqItem question="Can I book while I wait for a decision?">
              Yes. You can book at our{' '}
              <Link href="/pricing" className={textLink}>
                standard prices
              </Link>{' '}
              at any time. An Access rate applies to sessions booked after you&apos;re approved.
            </FaqItem>
            <FaqItem question="Is Rehabify Access the same as MediLoan?">
              No. Rehabify Access is our own assisted care programme, offering reduced fees or flexible arrangements to eligible
              patients. MediLoan is healthcare financing from our partner MyItura: you pay for care now and repay MyItura over
              time.{' '}
              <Link href="/partners/mediloan" className={textLink}>
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
    <section className="px-4 pb-16 pt-28 sm:px-6 sm:pt-32 lg:pb-20 lg:pt-40">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16">
        <FadeUp>
          <h1 className="text-[40px] font-bold leading-[1.04] tracking-tight text-rh-ink sm:text-[56px] lg:text-[60px]">
            Cost shouldn&apos;t stand between you and recovery
          </h1>
          <p className="mt-6 max-w-xl text-lg font-medium leading-relaxed text-rh-ink/75">
            Rehabify Access offers eligible patients reduced-fee physiotherapy or a flexible arrangement.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#apply" className={ctaPrimary}>
              Apply for Assisted Care <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
            <Link href="/pricing" className={ctaSecondary}>
              See our standard prices
            </Link>
          </div>
        </FadeUp>

        <FadeUp delay={0.08}>
          <ol className="rounded-[2rem] bg-white px-7 py-3 sm:px-9 sm:py-4">
            {PROMISES.map((item, i) => (
              <li key={item.title} className="flex gap-4 border-t border-rh-ink/10 py-5 first:border-t-0">
                <span aria-hidden className="w-6 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-rh-ink/40">
                  {number(i)}
                </span>
                <div className="min-w-0">
                  <p className="text-base font-semibold leading-snug text-rh-ink">{item.title}</p>
                  <p className="mt-1 text-[15px] font-medium leading-6 text-rh-ink/65">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </FadeUp>
      </div>
    </section>
  )
}
