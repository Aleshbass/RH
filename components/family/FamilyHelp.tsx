'use client'

import { useState } from 'react'
import { HelpCircle, WhatsApp } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { PatientDrawer, primaryButtonClass } from '@/components/patient/ui'
import { topBarButtonClass } from '@/components/patient/shell/PatientControls'
import { joyWhatsAppUrl } from '@/lib/joyWhatsApp'
import { cn } from '@/lib/utils'

const TOPICS: { q: string; a: string }[] = [
  {
    q: 'What can I see?',
    a: 'Their visits, care plan and goals, home exercises and how they’re doing. You never see their private clinical notes.',
  },
  {
    q: 'How do I add someone I care for?',
    a: 'Tap “Add someone” and fill in their name. If they don’t use a phone, you manage their profile: you check in for them, ask for visits and pay.',
  },
  {
    q: 'I was invited. Where do I start?',
    a: 'Open the link from the message or email you got and sign in. The person appears here straight away.',
  },
  {
    q: 'How do I book a visit for them?',
    a: '“Ask for a visit” goes to their clinic or physio. If they don’t have one yet, Joy on WhatsApp finds a physio near them.',
  },
  {
    q: 'Can I change what I can do?',
    a: 'Your access is set by them (or their clinic, or whoever manages their profile). Ask them to change it in their Care circle.',
  },
]

export function FamilyHelp({ className }: { className?: string }) {
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
        description="Caring for someone on Rehabify"
        footer={
          <Button asChild className={cn(primaryButtonClass, 'w-full')}>
            <a href={joyWhatsAppUrl('Hi Joy, I help care for a family member on Rehabify and have a question.')} target="_blank" rel="noopener noreferrer">
              <WhatsApp className="mr-2 h-4 w-4" />
              Ask Joy on WhatsApp
            </a>
          </Button>
        }
      >
        <div className="space-y-2">
          {TOPICS.map((topic) => (
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
