'use client'

import { useState } from 'react'
import { HelpCircle, Mail, PlayCircle } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { PatientDrawer, primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui'
import { topBarButtonClass } from '@/components/patient/shell/PatientControls'
import { START_PHYSIO_TOUR_EVENT } from '@/components/physio/PhysioTour'
import { usePracticeMode } from '@/components/physio/practiceMode'
import { useClinicMode } from '@/components/physio/clinicMode'
import { SafetyGuideDrawer } from '@/components/visit-safety/SafetyGuide'
import { cn } from '@/lib/utils'

const SUPPORT_EMAIL = 'support@physioaroundme.com'

type HelpTopic = { q: string; a: string }

/**
 * Answers depend on which patients the physio sees: independents never get Rehabify booking or
 * payout answers, and a clinic's clinicians get their clinic's (`clinicName`).
 */
function helpTopics(independent: boolean, clinicName: string | null): HelpTopic[] {
  if (clinicName) {
    return [
      {
        q: 'Whose patients are these?',
        a: `${clinicName}'s. You see the patients the clinic gives you, with their full record: earlier notes, plans and programmes stay with the patient, so you carry on where care left off.`,
      },
      {
        q: 'How do I book my patients?',
        a: 'Tap New appointment, or open a patient. Patients book the hours you set in Settings → Working hours.',
      },
      {
        q: 'How do I send exercises?',
        a: 'Open a patient, go to Care plan and send exercises, or start from the Library: choose 3D exercises and send them to a patient.',
      },
      {
        q: 'How do I join a video session?',
        a: 'From 15 minutes before an online session, a green Join button appears at the top of every page, on Today, in your Schedule and on the patient’s page. It stays until the session ends.',
      },
      {
        q: 'Who bills the patients?',
        a: `${clinicName} does. If your role includes Billing you can send payment requests from Money or a patient's page; they're paid to the clinic.`,
      },
    ]
  }
  return [
    {
      q: 'How do I answer a booking request?',
      a: 'Open Schedule, then Requests & list. Accept, decline or suggest another time. You get a notification for every new request.',
    },
    independent
      ? {
          q: 'How do I book my patients?',
          a: 'Add them from Patients, then tap New appointment. Set your hours in Settings → Working hours.',
        }
      : {
          q: 'How do patients book me?',
          a: 'Share your booking page from Today. Set your hours in Settings → Working hours, and your services and home-visit areas in Settings → Services & coverage.',
        },
    {
      q: 'How do I send exercises?',
      a: 'Open a patient, go to Care plan and send exercises, or start from the Library: choose 3D exercises and send them to a patient.',
    },
    {
      q: 'How do I join a video session?',
      a: 'From 15 minutes before an online session, a green Join button appears at the top of every page, on Today, in your Schedule and on the patient’s page. It stays until the session ends.',
    },
    independent
      ? {
          q: 'How do I get paid?',
          a: 'Send your patients an invoice at your own prices from Money or their page. They pay by card, transfer or USSD into the bank account in Settings → Payouts, or pay you directly and you record it. Rehabify takes nothing.',
        }
      : {
          q: 'How do I get paid?',
          a: 'Money shows your invoices and what patients have paid. Payments go to the bank account in Settings → Payouts.',
        },
    {
      q: 'What does On duty do?',
      a: 'While you do home visits it shares your location with Rehabify. Turn it off when you finish for the day.',
    },
    {
      q: 'How does visit safety work on home visits?',
      a: 'Open the visit and tap On my way when you set off: your patient gets your photo and a 4-digit door code. At the door they give you the code, which checks you in. Tap Left safely when you go. If a visit runs 20 minutes over we ask if you’re OK; no answer in 10 minutes and the care team calls you. During a visit, hold the red Help button at the top of any page and the care team gets your location at once.',
    },
  ]
}

/** “?” in the top bar: quick answers, the tour, and support. */
export function PhysioHelp({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [safetyOpen, setSafetyOpen] = useState(false)
  const { isIndependent } = usePracticeMode()
  const clinic = useClinicMode()
  const HELP_TOPICS = helpTopics(isIndependent, clinic.active ? (clinic.clinicName ?? 'Your clinic') : null)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Help" title="Help" className={cn(topBarButtonClass, className)}>
        <HelpCircle className="h-4 w-4" />
      </button>
      <PatientDrawer
        open={open}
        onOpenChange={setOpen}
        title="Help"
        description="Quick answers to common questions"
        footer={
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              className={cn(secondaryButtonClass, 'w-full')}
              onClick={() => {
                setOpen(false)
                window.dispatchEvent(new Event(START_PHYSIO_TOUR_EVENT))
              }}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              Take the tour
            </Button>
            <Button asChild className={cn(primaryButtonClass, 'w-full')}>
              <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Help with my Rehabify dashboard')}`}>
                <Mail className="mr-2 h-4 w-4" />
                Email support
              </a>
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {/* Home visits are for physios outside a clinic: the visit-safety film first */}
          {!clinic.active && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setSafetyOpen(true)
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-pt-primary p-4 text-left text-pt-on-primary transition hover:opacity-95"
            >
              <PlayCircle className="h-6 w-6 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Watch: safe home visits</span>
                <span className="block text-xs opacity-80">On my way, the door code and the help button. 1 min 29 s.</span>
              </span>
            </button>
          )}
          {HELP_TOPICS.map((topic) => (
            <details key={topic.q} className="group rounded-2xl bg-pt-sunken px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-pt-ink">
                {topic.q}
                <span className="text-lg leading-none text-pt-faint transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-pt-muted">{topic.a}</p>
            </details>
          ))}
        </div>
      </PatientDrawer>
      <SafetyGuideDrawer open={safetyOpen} onOpenChange={setSafetyOpen} />
    </>
  )
}
