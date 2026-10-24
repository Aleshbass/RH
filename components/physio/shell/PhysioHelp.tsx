'use client'

import { useState } from 'react'
import { HelpCircle, Mail, PlayCircle } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { PatientDrawer, primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui'
import { topBarButtonClass } from '@/components/patient/shell/PatientControls'
import { START_PHYSIO_TOUR_EVENT } from '@/components/physio/PhysioTour'
import { cn } from '@/lib/utils'

const SUPPORT_EMAIL = 'support@physioaroundme.com'

const HELP_TOPICS: { q: string; a: string }[] = [
  {
    q: 'How do I answer a booking request?',
    a: 'Open Schedule, then Requests & list. Accept, decline or suggest another time. You get a notification for every new request.',
  },
  {
    q: 'How do patients book me?',
    a: 'Share your booking page from Today. Set your hours in Settings → Working hours, and your services and home-visit areas in Settings → Services & coverage.',
  },
  {
    q: 'How do I send exercises?',
    a: 'Open a patient, go to Care plan and send exercises, or start from the Library: choose 3D exercises and send them to a patient.',
  },
  {
    q: 'How do I start a video session?',
    a: 'Go to Schedule → Video sessions. The Join button opens 10 minutes before the start time.',
  },
  {
    q: 'How do I get paid?',
    a: 'Money shows your invoices and what patients have paid. Payments go to the bank account in Settings → Payouts.',
  },
  {
    q: 'What does On duty do?',
    a: 'While you do home visits it shares your location with Rehabify. Turn it off when you finish for the day.',
  },
]

/** “?” in the top bar: quick answers, the tour, and support. */
export function PhysioHelp({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
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
    </>
  )
}
