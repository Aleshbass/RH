'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from '@/components/icons'
import { displayFont } from '@/components/learn/shared'
import { joyWhatsAppUrl } from '@/lib/joyWhatsApp'
import { formatKobo } from '@/lib/rehabify-services'
import { RECOVERY_PLANS, recoveryPlanStatus } from '@/lib/recoveryPlans'
import { cn } from '@/lib/utils'
import { CareChooser } from './CareChooser'
import {
  bookWithJoyUrl,
  ctaPrimary,
  ctaSecondary,
  ctaSecondaryOnDark,
  FadeUp,
  FaqItem,
  findService,
  ListItem,
  SectionHeading,
  servicePrice,
  showsPrice,
  textLink,
  useCatalogue,
  WHATSAPP_HELP_URL,
  type Catalogue,
  type CatalogueService,
} from './shared'

const MEDILOAN_LOGO = 'https://loans.myitura.com/static/assets/logos/mediloan.svg?v=a5762be08a39'
const ASSESSMENT_WITH_JOY_URL = joyWhatsAppUrl("Hi Joy! I'd like to book a physiotherapy assessment.")

const PROMISES = [
  { title: 'The price you see is the price you pay', body: 'No booking or platform fee at checkout.' },
  { title: 'Pay as you go', body: 'Pay for each session. No subscription for your care.' },
  { title: 'Confirmed once paid', body: "Pick a time. It's yours once you've paid." },
  { title: 'Same price, any physiotherapist', body: 'Standard prices across the Rehabify network.' },
]

const PRICE_GROUPS = [
  { title: 'Not sure where to start?', ids: ['automated_screening', 'recovery_consultation'] },
  { title: 'Your first assessment', ids: ['virtual_assessment', 'home_assessment'] },
  { title: 'Treatment and follow-up', ids: ['virtual_treatment', 'home_treatment'] },
]

const arrow = 'h-4 w-4 transition-transform duration-300 group-hover:translate-x-1'
const number = (i: number) => String(i + 1).padStart(2, '0')
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

export function PricingPage({ initialCatalogue }: { initialCatalogue: Catalogue | null }) {
  const catalogue = useCatalogue(initialCatalogue)

  return (
    <div className="overflow-x-clip bg-rh-canvas text-rh-ink">
      <Hero consultation={findService(catalogue, 'recovery_consultation')} />

      <section id="find-your-care" className="scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <FadeUp>
            <SectionHeading
              title="A few questions to the right session"
              description="Answer a few questions and we'll show you the right session."
            />
          </FadeUp>
          <div className="mt-10 lg:mt-12">
            <CareChooser catalogue={catalogue} />
          </div>
        </div>
      </section>

      <PriceList catalogue={catalogue} />
      <BetweenSessions />
      <CostHelp />
      <Faq catalogue={catalogue} />
    </div>
  )
}

function Hero({ consultation }: { consultation: CatalogueService }) {
  const price = formatKobo(consultation.priceKobo)
  return (
    <section className="px-4 pb-16 pt-28 sm:px-6 sm:pt-32 lg:pb-20 lg:pt-40">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16">
          <FadeUp>
            <h1 className="text-[40px] font-bold leading-[1.04] tracking-tight text-rh-ink sm:text-[56px] lg:text-[64px]">
              Not sure where to start?
            </h1>
            <p className="mt-6 max-w-xl text-lg font-medium leading-relaxed text-rh-ink/75">
              Book a {consultation.durationLabel} Recovery Consultation. A physiotherapist tells you the right next step, and what
              it costs.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {consultation.bookable && (
                <a href={bookWithJoyUrl(consultation)} target="_blank" rel="noopener noreferrer" className={ctaPrimary}>
                  Book a consultation · {price} <ArrowRight className={arrow} />
                </a>
              )}
              <a href={ASSESSMENT_WITH_JOY_URL} target="_blank" rel="noopener noreferrer" className={ctaSecondary}>
                Book an assessment directly
              </a>
            </div>
          </FadeUp>

          <FadeUp delay={0.08}>
            <div className="rounded-[2rem] bg-white p-7 sm:p-9">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-[22px] font-bold leading-tight tracking-tight text-rh-ink">{consultation.name}</h2>
                  <p className="mt-1 text-[15px] font-medium text-rh-ink/60">{consultation.durationLabel}</p>
                </div>
                <p className={cn('shrink-0 text-[32px] leading-none tracking-tight text-rh-ink sm:text-[36px]', displayFont)}>{price}</p>
              </div>
              <ol className="mt-6">
                {consultation.whatHappens.map((item, i) => (
                  <li key={item} className="flex gap-4 border-t border-rh-ink/10 py-3.5 text-[15px] font-medium leading-snug text-rh-ink/80">
                    <span aria-hidden className="w-5 shrink-0 tabular-nums text-rh-ink/40">
                      {number(i)}
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
              <p className="mt-2 rounded-2xl bg-rh-canvas p-4 text-[15px] font-medium leading-6 text-rh-ink/80">
                <span className="font-semibold text-rh-ink">You receive: </span>
                {consultation.youReceive}
              </p>
              {consultation.notIncluded && (
                <p className="mt-4 text-sm font-medium leading-6 text-rh-ink/65">
                  <span className="font-semibold text-rh-ink">Not a full assessment.</span> It doesn&apos;t include{' '}
                  {lowerFirst(consultation.notIncluded)}
                </p>
              )}
            </div>
          </FadeUp>
        </div>

        <ol className="mt-14 grid gap-x-8 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
          {PROMISES.map((item, i) => (
            <li key={item.title} className="border-t border-rh-ink/10 py-5">
              <span aria-hidden className="text-sm font-semibold tabular-nums text-rh-ink/40">
                {number(i)}
              </span>
              <p className="mt-2 text-base font-semibold leading-snug text-rh-ink">{item.title}</p>
              <p className="mt-1 text-[15px] font-medium leading-6 text-rh-ink/65">{item.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function PriceList({ catalogue }: { catalogue: Catalogue }) {
  return (
    <section className="bg-rh-ink px-4 py-20 text-white sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <FadeUp>
          <SectionHeading
            onDark
            title="Every service, one standard price"
            description="Set by Rehabify and the same whichever physiotherapist you see."
          />
        </FadeUp>
        <div className="mt-12 grid gap-x-10 gap-y-12 lg:mt-14 lg:grid-cols-3">
          {PRICE_GROUPS.map((group, i) => (
            <FadeUp key={group.title} delay={i * 0.06}>
              <h3 className="text-[20px] font-bold leading-tight tracking-tight text-white">{group.title}</h3>
              <ul className="mt-5">
                {group.ids.map((id) => (
                  <PriceRow key={id} service={findService(catalogue, id)} />
                ))}
              </ul>
            </FadeUp>
          ))}
        </div>
        <p className="mt-12 max-w-2xl text-[15px] font-medium leading-6 text-white/60">
          Any travel charge for a home visit depends on your area and is shown, with your total, before you pay.
        </p>
      </div>
    </section>
  )
}

function PriceRow({ service }: { service: CatalogueService }) {
  return (
    <li className="flex items-start justify-between gap-4 border-t border-white/10 py-5">
      <div className="min-w-0">
        <p className="text-base font-semibold leading-snug text-white">{service.name}</p>
        {service.kind !== 'screening' && <p className="mt-0.5 text-[15px] font-medium text-white/60">{service.durationLabel}</p>}
        {service.bookable ? (
          <a
            href={bookWithJoyUrl(service)}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-2 inline-flex items-center gap-1.5 rounded-sm text-[15px] font-semibold text-rh-lime underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-2 focus-visible:ring-offset-rh-ink"
          >
            Book<span className="sr-only"> {service.name}</span> <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
          </a>
        ) : service.kind === 'screening' ? (
          <span className="mt-2 inline-block text-sm font-semibold text-white/60">Coming soon</span>
        ) : (
          <span className="mt-2 inline-block text-sm font-medium text-white/50">Not available right now</span>
        )}
      </div>
      {showsPrice(service) && (
        <p className={cn('shrink-0 text-right text-[22px] leading-none text-white', displayFont)}>{servicePrice(service)}</p>
      )}
    </li>
  )
}

/** Basic, Flex and Flex Max: support between sessions (Flex plans show as coming soon until launch). */
function BetweenSessions() {
  return (
    <section className="px-4 pt-20 sm:px-6 lg:pt-28">
      <div className="mx-auto max-w-6xl">
        <FadeUp>
          <SectionHeading
            title="Support between sessions"
            description="Your physiotherapist’s plan, with as much help at home as you want."
          />
        </FadeUp>
        <div className="mt-10 grid gap-5 lg:mt-12 lg:grid-cols-3">
          {RECOVERY_PLANS.map((plan, i) => (
            <FadeUp key={plan.id} delay={i * 0.06} className="flex">
              <article
                className={cn(
                  'flex w-full flex-col rounded-[2rem] p-7 sm:p-8',
                  plan.available ? 'bg-rh-ink text-white' : 'bg-white text-rh-ink'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[26px] font-bold leading-tight tracking-tight">{plan.name}</h3>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                      plan.available ? 'bg-rh-lime text-rh-ink' : 'bg-rh-canvas text-rh-ink/70'
                    )}
                  >
                    {recoveryPlanStatus(plan)}
                  </span>
                </div>
                <p className={cn('mt-3 text-[15px] font-medium leading-relaxed', plan.available ? 'text-white/75' : 'text-rh-ink/70')}>
                  {plan.description}
                </p>
              </article>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

function CostHelp() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <FadeUp>
          <SectionHeading title="Worried about the cost?" description="There are two ways we can help." />
        </FadeUp>
        <div className="mt-10 grid gap-5 lg:mt-12 lg:grid-cols-2">
          <FadeUp className="flex">
            <article id="rehabify-access" className="flex w-full scroll-mt-24 flex-col rounded-[2rem] bg-rh-ink p-7 text-white sm:p-9">
              <h3 className="text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[32px]">Assisted care</h3>
              <p className="mt-3 max-w-md text-[15px] font-medium leading-relaxed text-white/75 sm:text-base">
                Rehabify Access offers eligible patients reduced-fee physiotherapy or a flexible arrangement, with the same clinical
                standards.
              </p>
              <ul className="mt-6 space-y-3">
                <ListItem onDark>Every application reviewed against the same criteria</ListItem>
                <ListItem onDark>No documents up front</ListItem>
                <ListItem onDark>Places depend on capacity, so assisted rates aren&apos;t guaranteed</ListItem>
              </ul>
              <div className="mt-auto flex flex-col gap-3 pt-8 sm:flex-row">
                <Link
                  href="/rehabify-access#apply"
                  className={cn(ctaPrimary, 'focus-visible:ring-rh-lime focus-visible:ring-offset-rh-ink')}
                >
                  Apply for Assisted Care <ArrowRight className={arrow} />
                </Link>
                <Link href="/rehabify-access" className={ctaSecondaryOnDark}>
                  How it works
                </Link>
              </div>
            </article>
          </FadeUp>

          <FadeUp delay={0.06} className="flex">
            <article id="mediloan" className="flex w-full scroll-mt-24 flex-col rounded-[2rem] bg-white p-7 sm:p-9">
              <Image src={MEDILOAN_LOGO} alt="MediLoan by MyItura" width={160} height={48} unoptimized className="h-10 w-auto self-start" />
              <h3 className="mt-6 text-[28px] font-bold leading-tight tracking-tight text-rh-ink sm:text-[32px]">
                Get treated now, pay later
              </h3>
              <p className="mt-3 max-w-md text-[15px] font-medium leading-relaxed text-rh-ink/75 sm:text-base">
                Spread the cost of your physiotherapy with MediLoan, healthcare financing from our partner MyItura.
              </p>
              <ul className="mt-6 space-y-3">
                <ListItem>Quick SMS-based application, no paperwork</ListItem>
                <ListItem>Repayment plans to suit your budget</ListItem>
                <ListItem>Start treatment without waiting to save up</ListItem>
              </ul>
              <div className="mt-auto pt-8">
                <Link href="/pay-later" className={ctaPrimary}>
                  Apply for MediLoan <ArrowRight className={arrow} />
                </Link>
                <p className="mt-4 text-sm font-medium leading-6 text-rh-ink/60">
                  MediLoan is provided by MyItura, an independent company that handles loan approvals and repayments.{' '}
                  <Link href="/partners/mediloan" className={textLink}>
                    Read the disclaimer
                  </Link>
                </p>
              </div>
            </article>
          </FadeUp>
        </div>
      </div>
    </section>
  )
}

function Faq({ catalogue }: { catalogue: Catalogue }) {
  const consultation = findService(catalogue, 'recovery_consultation')
  const virtualAssessment = findService(catalogue, 'virtual_assessment')
  const homeAssessment = findService(catalogue, 'home_assessment')
  const withTravel = catalogue.services.filter((s) => s.travelApplies).map((s) => s.name)

  return (
    <section className="px-4 pb-20 pt-4 sm:px-6 lg:pb-28">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <FadeUp>
          <h2 className="text-[34px] font-bold leading-[1.05] tracking-tight text-rh-ink sm:text-5xl">Prices and payment, answered</h2>
          <p className="mt-5 text-base font-medium text-rh-ink/70">Still unsure?</p>
          <a href={WHATSAPP_HELP_URL} target="_blank" rel="noopener noreferrer" className={cn(ctaSecondary, 'group mt-3')}>
            Ask Joy on WhatsApp <ArrowRight className={arrow} />
          </a>
        </FadeUp>

        <div className="border-b border-rh-ink/10">
          <FaqItem question="What is the Recovery Consultation, and what isn't it?">
            A {consultation.durationLabel} video call with a physiotherapist, for {formatKobo(consultation.priceKobo)}. They take a
            brief history, check for anything that needs urgent medical attention, and recommend the right next step, with its
            price. It isn&apos;t a full assessment
            {consultation.notIncluded ? `: it doesn't include ${lowerFirst(consultation.notIncluded)}` : '.'}
          </FaqItem>
          <FaqItem question="Can I book an assessment directly?">
            Yes, no consultation needed. Book a {virtualAssessment.name} ({virtualAssessment.durationLabel} by video) or an{' '}
            {homeAssessment.name} ({homeAssessment.durationLabel} at home). You&apos;ll see the price when you book.{' '}
            <a href={ASSESSMENT_WITH_JOY_URL} target="_blank" rel="noopener noreferrer" className={textLink}>
              Ask Joy to book one
            </a>
          </FaqItem>
          <FaqItem question="What's included in an assessment?">
            The video assessment covers your history, pain, movement, everyday difficulties, goals and treatment options, plus your
            initial recovery plan. If you need a physical examination, your physiotherapist will recommend an in-person
            assessment. The home assessment is {homeAssessment.durationLabel} with your physiotherapist (not counting their
            travel), with a clinical examination, initial treatment or supervised exercise where appropriate, and a personalised
            rehabilitation plan.
          </FaqItem>
          <FaqItem question="How do travel charges work?">
            {withTravel.length > 0
              ? `Some home visits include a travel charge, set by your city and area. It currently applies to ${withTravel.join(' and ')}. `
              : "Home visits don't currently carry a travel charge. "}
            Any travel charge is shown, with your total, before you pay. Video sessions never have one.
          </FaqItem>
          <FaqItem question="Does the price depend on which physiotherapist I see?">
            No. Prices are set by Rehabify and are the same across our network.
          </FaqItem>
          <FaqItem question="Are there any other fees?">
            No. There&apos;s no booking or platform fee at checkout and no subscription for your care: you pay for each session as you go.
          </FaqItem>
          <FaqItem question="How do payment and confirmation work?">
            You book through Joy on WhatsApp. Joy confirms your time and sends a secure Paystack payment link, and your
            appointment is confirmed once it&apos;s paid.
          </FaqItem>
          <FaqItem question="What if I need to cancel or get a refund?">
            Cancellations and refunds follow our{' '}
            <Link href="/payment-policy" className={textLink}>
              Payment Policy
            </Link>
            .
          </FaqItem>
          <FaqItem question="What if I can't afford it?">
            You can apply for{' '}
            <Link href="/rehabify-access" className={textLink}>
              Rehabify Access
            </Link>{' '}
            (assisted care), or spread the cost with{' '}
            <Link href="/pay-later" className={textLink}>
              MediLoan
            </Link>{' '}
            from MyItura.
          </FaqItem>
        </div>
      </div>
    </section>
  )
}
