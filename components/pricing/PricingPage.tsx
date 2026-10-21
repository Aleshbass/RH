'use client'

import type { ComponentType } from 'react'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, Banknote, CalendarCheck, HeartHandshake, Receipt, Wallet } from 'lucide-react'
import { CheckItem, displayFont, pillGhostOnDark, pillLime, pillTeal } from '@/components/learn/shared'
import { formatKobo } from '@/lib/rehabify-services'
import { cn } from '@/lib/utils'
import { CareChooser } from './CareChooser'
import {
  FadeUp,
  FaqItem,
  findService,
  getCareHref,
  modeLabel,
  SectionHeading,
  servicePrice,
  useCatalogue,
  WHATSAPP_HELP_URL,
  type Catalogue,
  type CatalogueService,
} from './shared'

const TRUST: { icon: ComponentType<{ className?: string }>; title: string; body: string }[] = [
  { icon: Receipt, title: 'The price you see is the price you pay', body: 'No booking or platform fee at checkout.' },
  { icon: Wallet, title: 'No subscriptions — pay per session', body: 'Pay for each session as you go.' },
  { icon: CalendarCheck, title: 'Confirmed once paid', body: "Pick a time from your physio's availability. It's yours once you've paid." },
  { icon: BadgeCheck, title: 'Same price whichever physiotherapist', body: 'Standard prices across the Rehabify network.' },
]

const PRICE_GROUPS = [
  { title: 'Not sure where to start?', ids: ['automated_screening', 'recovery_consultation'] },
  { title: 'Your first assessment', ids: ['virtual_assessment', 'home_assessment'] },
  { title: 'Treatment and follow-up', ids: ['virtual_treatment', 'home_treatment'] },
]

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

export function PricingPage({ initialCatalogue }: { initialCatalogue: Catalogue | null }) {
  const catalogue = useCatalogue(initialCatalogue)

  return (
    <div className="bg-rh-cream">
      <Hero consultation={findService(catalogue, 'recovery_consultation')} />

      <section id="find-your-care" className="scroll-mt-20 bg-white px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <FadeUp>
            <SectionHeading
              eyebrow="Find your care"
              title="A few questions to the right session"
              description="Tell us where you are in your recovery and how you'd like to be seen. We'll show you the session, what's included and the full price."
            />
          </FadeUp>
          <div className="mt-10 rounded-[2rem] bg-rh-cream p-3 sm:p-6 lg:mt-12 lg:p-8">
            <CareChooser catalogue={catalogue} />
          </div>
        </div>
      </section>

      <PriceList catalogue={catalogue} />
      <CostHelp />
      <Faq catalogue={catalogue} />
    </div>
  )
}

function Hero({ consultation }: { consultation: CatalogueService }) {
  const price = formatKobo(consultation.priceKobo)
  return (
    <section className="px-4 pb-16 pt-24 sm:px-6 sm:pt-28 lg:pb-20">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[linear-gradient(140deg,#005b57_0%,#005b57_58%,#003f3c_100%)] text-white sm:rounded-[2.5rem]">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-rh-aqua/10 blur-3xl" />
        <div className="relative grid gap-12 px-6 py-12 sm:px-10 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14 lg:px-16 lg:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-rh-mint ring-1 ring-inset ring-white/15">
              <span className="h-1.5 w-1.5 rounded-full bg-rh-lime" />
              Prices · Pay per session
            </span>
            <h1 className="mt-6 text-[40px] leading-[1.04] tracking-tight text-white sm:text-[56px] lg:text-[60px]">
              Not sure where to start?
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
              Book a {consultation.durationLabel} Recovery Consultation. A physiotherapist listens, checks what&apos;s going on and
              tells you the right next step, and what it costs.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {consultation.bookable && (
                <Link href={getCareHref({ service: consultation.id })} className={cn(pillLime, 'h-12 px-7 text-[15px]')}>
                  Book a consultation · {price} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              <a href="#find-your-care" className={cn(pillGhostOnDark, 'h-12 px-7 text-[15px]')}>
                Book an assessment directly
              </a>
            </div>
            <p className="mt-6 text-sm text-white/65">Same price whichever physiotherapist you see. Nothing added at checkout.</p>
          </div>

          <div className="relative rounded-[1.75rem] bg-white p-6 text-rh-night shadow-[0_40px_80px_-40px_rgba(0,46,44,0.75)] sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rh-night/45">Your first step</p>
                <h2 className="mt-1 text-xl leading-tight text-rh-night">{consultation.name}</h2>
                <p className="mt-1 text-sm text-rh-night/55">
                  {consultation.durationLabel} · Video call
                </p>
              </div>
              <p className={cn('shrink-0 text-[32px] leading-none tracking-tight', displayFont)}>{price}</p>
            </div>
            <ul className="mt-6 space-y-2.5">
              {consultation.whatHappens.map((item) => (
                <CheckItem key={item}>{item}</CheckItem>
              ))}
            </ul>
            <p className="mt-5 rounded-2xl bg-rh-honeydew p-4 text-sm leading-6 text-rh-night/80">
              <span className="font-semibold text-rh-night">You receive: </span>
              {consultation.youReceive}
            </p>
            {consultation.notIncluded && (
              <p className="mt-3 text-sm leading-6 text-rh-night/55">
                <span className="font-semibold text-rh-night/75">Not a full assessment.</span> It doesn&apos;t include{' '}
                {lowerFirst(consultation.notIncluded)}
              </p>
            )}
          </div>
        </div>
      </div>

      <ul className="mx-auto mt-6 grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST.map((item) => (
          <li key={item.title} className="flex items-start gap-3.5 rounded-[1.5rem] bg-white p-5 shadow-soft">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rh-honeydew text-rh-teal">
              <item.icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-snug text-rh-night">{item.title}</p>
              <p className="mt-1 text-sm leading-5 text-rh-night/60">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PriceList({ catalogue }: { catalogue: Catalogue }) {
  return (
    <section className="px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <FadeUp>
          <SectionHeading
            eyebrow="All prices"
            title="Every service, one standard price"
            description="Set by Rehabify and the same whichever physiotherapist you see. Pay per session."
          />
        </FadeUp>
        <div className="mt-10 grid gap-4 lg:mt-12 lg:grid-cols-3">
          {PRICE_GROUPS.map((group, i) => (
            <FadeUp key={group.title} delay={i * 0.06}>
              <div className="h-full rounded-[1.75rem] bg-white p-6 shadow-soft sm:p-7">
                <h3 className="text-lg leading-tight text-rh-night">{group.title}</h3>
                <ul className="mt-4 divide-y divide-rh-night/[0.07]">
                  {group.ids.map((id) => (
                    <PriceRow key={id} service={findService(catalogue, id)} />
                  ))}
                </ul>
              </div>
            </FadeUp>
          ))}
        </div>
        <p className="mt-6 text-sm leading-6 text-rh-night/60">
          Any travel charge for a home visit depends on your area and is shown, with your total, before you pay.
        </p>
      </div>
    </section>
  )
}

function PriceRow({ service }: { service: CatalogueService }) {
  return (
    <li className="flex items-start justify-between gap-4 py-4 last:pb-0">
      <div className="min-w-0">
        <p className="font-semibold leading-snug text-rh-night">{service.name}</p>
        <p className="mt-0.5 text-sm text-rh-night/55">
          {service.durationLabel} · {modeLabel(service)}
        </p>
        {service.bookable ? (
          <Link
            href={getCareHref({ service: service.id })}
            className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-rh-teal underline-offset-4 hover:underline"
          >
            Book<span className="sr-only"> {service.name}</span> <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : service.kind === 'screening' ? (
          <span className="mt-2 inline-block rounded-full bg-rh-jasmine px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rh-night">
            Coming soon
          </span>
        ) : (
          <span className="mt-2 inline-block text-sm text-rh-night/45">Not available right now</span>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className={cn('text-xl leading-none text-rh-night', displayFont)}>{servicePrice(service)}</p>
        {service.travelApplies && <p className="mt-1.5 text-xs text-rh-night/50">+ travel for your area</p>}
      </div>
    </li>
  )
}

function CostHelp() {
  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <FadeUp>
          <SectionHeading
            eyebrow="Help with the cost"
            title="Worried about the cost?"
            description="Financial circumstances shouldn't prevent appropriate recovery care. There are two ways we can help."
          />
        </FadeUp>
        <div className="mt-10 grid gap-4 lg:mt-12 lg:grid-cols-2">
          <FadeUp>
            <article id="rehabify-access" className="flex h-full flex-col rounded-[2rem] bg-rh-teal p-7 text-white shadow-lift sm:p-9">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-rh-lime">
                <HeartHandshake className="h-5 w-5" />
              </span>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-rh-mint">Rehabify Access</p>
              <h3 className="mt-2 text-[26px] leading-tight text-white">Assisted care</h3>
              <p className="mt-3 text-[15px] leading-6 text-white/80">
                If you need rehabilitation but the cost is a worry, apply for Rehabify Access. Eligible patients may get
                reduced-fee physiotherapy or a flexible arrangement, with the same clinical standards.
              </p>
              <ul className="mt-6 space-y-3">
                <CheckItem onDark>Every application reviewed individually, against the same criteria</CheckItem>
                <CheckItem onDark>We only ask what we need. No documents up front</CheckItem>
                <CheckItem onDark>Places depend on programme capacity, so assisted rates aren&apos;t guaranteed for everyone</CheckItem>
              </ul>
              <div className="mt-auto flex flex-col gap-3 pt-8 sm:flex-row">
                <Link href="/rehabify-access#apply" className={cn(pillLime, 'h-12 px-7 text-[15px]')}>
                  Apply for Assisted Care <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/rehabify-access" className={cn(pillGhostOnDark, 'h-12 px-7 text-[15px]')}>
                  How it works
                </Link>
              </div>
            </article>
          </FadeUp>

          <FadeUp delay={0.06}>
            <article id="mediloan" className="flex h-full flex-col rounded-[2rem] bg-rh-peach p-7 text-rh-night sm:p-9">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70 text-rh-night">
                <Banknote className="h-5 w-5" />
              </span>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-rh-night/55">MediLoan by MyItura</p>
              <h3 className="mt-2 text-[26px] leading-tight text-rh-night">Get treated now, pay later</h3>
              <p className="mt-3 text-[15px] leading-6 text-rh-night/75">
                MediLoan is healthcare financing from our partner MyItura. Apply in a few minutes and spread the cost of your
                physiotherapy.
              </p>
              <ul className="mt-6 space-y-3">
                <CheckItem>Quick SMS-based application, no paperwork</CheckItem>
                <CheckItem>Repayment plans to suit your budget</CheckItem>
                <CheckItem>Start treatment without waiting to save up</CheckItem>
              </ul>
              <div className="mt-auto pt-8">
                <Link href="/payment" className={cn(pillTeal, 'h-12 px-7 text-[15px]')}>
                  Apply for MediLoan <ArrowRight className="h-4 w-4" />
                </Link>
                <p className="mt-4 text-xs leading-5 text-rh-night/60">
                  MediLoan is provided by MyItura, an independent company. Loan approvals and repayments are handled by MyItura.{' '}
                  <Link href="/partners/mediloan" className="font-semibold text-rh-night underline underline-offset-2">
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
  const link = 'font-semibold text-rh-teal underline-offset-4 hover:underline'

  return (
    <section className="px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-3xl">
        <FadeUp>
          <SectionHeading eyebrow="Questions" title="Prices and payment, answered" center />
        </FadeUp>
        <div className="mt-10">
          <FaqItem question="What is the Recovery Consultation, and what isn't it?">
            A {consultation.durationLabel} video call with a physiotherapist, for {formatKobo(consultation.priceKobo)}. You explain
            what&apos;s wrong, they take a brief history, check for anything that needs urgent medical attention, and recommend
            the right next step, with its price. It isn&apos;t a full assessment
            {consultation.notIncluded ? `: it doesn't include ${lowerFirst(consultation.notIncluded)}` : '.'}
          </FaqItem>
          <FaqItem question="Can I book an assessment directly?">
            Yes. You don&apos;t need a consultation first. Book a {virtualAssessment.name} ({virtualAssessment.durationLabel} by
            video, {formatKobo(virtualAssessment.priceKobo)}) or an {homeAssessment.name} ({homeAssessment.durationLabel} at home,{' '}
            {formatKobo(homeAssessment.priceKobo)}).{' '}
            <a href="#find-your-care" className={link}>
              Find the right one
            </a>
          </FaqItem>
          <FaqItem question="What's included in an assessment?">
            The video assessment covers your history, pain, movement and everyday difficulties, your goals and your treatment
            options. Your initial recovery plan is included. If you need a physical examination, your physiotherapist will
            recommend an in-person assessment. The home assessment is {homeAssessment.durationLabel} with your physiotherapist
            (not counting their travel), with a clinical examination, initial treatment or supervised exercise where appropriate,
            and a personalised rehabilitation plan.
          </FaqItem>
          <FaqItem question="How do travel charges work?">
            {withTravel.length > 0
              ? `Some home visits include a travel charge, set by your city and area. It currently applies to ${withTravel.join(' and ')}. `
              : "Home visits don't currently carry a travel charge. "}
            Any travel charge is shown, with your total, before you pay. Video sessions never have one.
          </FaqItem>
          <FaqItem question="Does the price depend on which physiotherapist I see?">
            No. Prices are set by Rehabify and are the same across our network, whichever physiotherapist you see.
          </FaqItem>
          <FaqItem question="Are there any other fees?">
            No. The price you see is the price you pay. There&apos;s no booking or platform fee at checkout and no subscription:
            you pay for each session as you go.
          </FaqItem>
          <FaqItem question="How do payment and confirmation work?">
            Choose a time from your physiotherapist&apos;s availability, then pay securely through Paystack. We hold the time
            while you pay, and your booking is confirmed as soon as payment goes through.
          </FaqItem>
          <FaqItem question="What if I need to cancel or get a refund?">
            Cancellations and refunds follow our{' '}
            <Link href="/payment-policy" className={link}>
              Payment Policy
            </Link>
            .
          </FaqItem>
          <FaqItem question="What if I can't afford it?">
            You can apply for{' '}
            <Link href="/rehabify-access" className={link}>
              Rehabify Access
            </Link>{' '}
            (assisted care), or spread the cost with{' '}
            <Link href="/payment" className={link}>
              MediLoan
            </Link>{' '}
            from MyItura.
          </FaqItem>
        </div>
        <p className="mt-10 text-center text-[15px] text-rh-night/65">
          Still unsure?{' '}
          {consultation.bookable && (
            <>
              <Link href={getCareHref({ service: consultation.id })} className={link}>
                Book a Recovery Consultation
              </Link>{' '}
              or{' '}
            </>
          )}
          <a href={WHATSAPP_HELP_URL} target="_blank" rel="noopener noreferrer" className={link}>
            ask Joy on WhatsApp
          </a>
          .
        </p>
      </div>
    </section>
  )
}
