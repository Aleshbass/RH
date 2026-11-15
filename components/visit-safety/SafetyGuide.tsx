'use client'

/**
 * "How visit safety works" for physios: the short film (once published) and the five steps.
 * Opened from the safety card, the safety bar and Help.
 */

import { useState } from 'react'
import { Car, Clock, DoorOpen, LogOut, PlayCircle, ShieldAlert } from '@/components/icons'
import { PhysioDrawer } from '@/components/physio/ui'
import { cn } from '@/lib/utils'
import { SAFETY_GUIDE_VIDEO_URL } from './safetyApi'

const STEPS = [
  {
    icon: Car,
    title: 'Tap “On my way” when you set off',
    text: 'Open the visit in your Schedule. Your patient gets your photo, name, licence number and a 4-digit door code.',
  },
  {
    icon: DoorOpen,
    title: 'Check in with their code at the door',
    text: 'They check your face against the photo, then give you the code. Enter it and their screen shows you’re checked in. No code? Check in without it and say why.',
  },
  {
    icon: LogOut,
    title: 'Tap “Left safely” when you go',
    text: 'Running long? Tap “Need more time” to add 30 minutes.',
  },
  {
    icon: Clock,
    title: 'If a visit runs over, we check on you',
    text: '20 minutes after it should have ended we ask “Are you OK?” on your phone and WhatsApp. No answer in 10 minutes and the care team calls you.',
  },
  {
    icon: ShieldAlert,
    title: 'Feel unsafe? Hold the help button',
    text: 'It’s on every page during a visit. The care team gets your location, the address and both phone numbers, and calls you straight away. In danger, call 112 too.',
  },
]

export function SafetyGuideButton({ className, label = 'How it works' }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('inline-flex items-center gap-1.5 text-xs font-semibold text-pt-muted underline-offset-2 hover:text-pt-ink hover:underline', className)}
      >
        <PlayCircle className="h-3.5 w-3.5" />
        {label}
      </button>
      <SafetyGuideDrawer open={open} onOpenChange={setOpen} />
    </>
  )
}

export function SafetyGuideDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <PhysioDrawer open={open} onOpenChange={onOpenChange} title="How visit safety works" description="For every home visit. About a minute.">
      <div className="space-y-5">
        {SAFETY_GUIDE_VIDEO_URL && (
          <video
            src={SAFETY_GUIDE_VIDEO_URL}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-2xl bg-black"
          />
        )}
        <ol className="space-y-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pt-sunken text-pt-ink">
                <step.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-pt-ink">
                  {index + 1}. {step.title}
                </p>
                <p className="mt-0.5 text-sm text-pt-muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="rounded-2xl bg-pt-sunken p-3 text-xs text-pt-muted">
          Your location is shared only while a visit is open or a help alert is on, and it’s cleared after 30 days. Keep the app open
          during visits: phones can stop sharing location when the screen locks.
        </p>
      </div>
    </PhysioDrawer>
  )
}
