'use client'

import { useState } from 'react'
import { HelpCircle, Mail, PlayCircle } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { PatientDrawer, primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui'
import { topBarButtonClass } from '@/components/patient/shell/PatientControls'
import { START_CLINIC_TOUR_EVENT } from '@/components/clinic/ClinicTour'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'
import { cn } from '@/lib/utils'

const SUPPORT_EMAIL = 'support@physioaroundme.com'

type HelpTopic = { q: string; a: string }

/** Quick answers for running a clinic on Rehabify. Front desk and clinicians get the ones their role uses. */
function helpTopics(isOwner: boolean): HelpTopic[] {
  const topics: HelpTopic[] = [
    {
      q: 'How do I add a patient?',
      a: 'Patients → Add patient. Choose the clinician who will look after them. They get an email from your clinic with a link to their portal; until they open it they show as "Invite sent".',
    },
    {
      q: 'Who treats the patients?',
      a: 'Your clinicians. They write notes, care plans and exercise programmes in their own workspace. You can read everything in a patient’s record and ask their clinician about them from there.',
    },
    {
      q: 'A patient asked for an appointment. Where is it?',
      a: 'Appointments, under Requests from patients. Book it (the form opens already filled in) or decline it with a short note. The patient is told either way.',
    },
    {
      q: 'How do I talk to my team?',
      a: 'Messages → Team. There is one chat for the whole team, and one per patient for questions about their care. Patients never see these.',
    },
    {
      q: 'How do patients pay?',
      a: 'Billing → Request payment. The patient gets a message and email from your clinic with a secure link, and the money goes straight to the bank account in Settings → Payouts.',
    },
    {
      q: 'A clinician is leaving. What happens to their patients?',
      a: 'Team → remove them and choose who takes over. Patients belong to the clinic: their notes, plans and programmes move with them, so care carries on.',
    },
  ]
  if (isOwner) {
    topics.push(
      {
        q: 'What does my plan include?',
        a: 'Plan shows your seats, patient programmes and when it renews. During the pilot you have full access and nothing to pay.',
      },
      {
        q: 'Can I limit what my team sees?',
        a: 'Team → Roles. Pick which pages each role opens (Billing, Reports, Inventory…). Clinicians only bill patients if their role includes Billing.',
      }
    )
  }
  return topics
}

export function ClinicHelp({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const { isOwner } = useClinicAccess()
  const topics = helpTopics(isOwner)
  return (
    <>
      <button type="button" data-tour="clinic-help" onClick={() => setOpen(true)} aria-label="Help" title="Help" className={cn(topBarButtonClass, className)}>
        <HelpCircle className="h-4 w-4" />
      </button>
      <PatientDrawer
        open={open}
        onOpenChange={setOpen}
        title="Help"
        description="Quick answers about running your clinic"
        footer={
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              className={cn(secondaryButtonClass, 'w-full')}
              onClick={() => {
                setOpen(false)
                window.dispatchEvent(new Event(START_CLINIC_TOUR_EVENT))
              }}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              Take the tour
            </Button>
            <Button asChild className={cn(primaryButtonClass, 'w-full')}>
              <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Help with my clinic dashboard')}`}>
                <Mail className="mr-2 h-4 w-4" />
                Email support
              </a>
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {topics.map((topic) => (
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
