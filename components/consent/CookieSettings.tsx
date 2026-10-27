'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from '@/components/icons'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { useIsPhone } from '@/components/patient/ui'
import { COOKIE_CATEGORIES, DEFAULT_CHOICES, PLAY_TO_LOAD_NOTE, type ConsentChoices, type Consent, type CookieCategory } from '@/lib/consent'
import { cn } from '@/lib/utils'

function CategoryRow({
  category,
  checked,
  onChange,
}: {
  category: CookieCategory
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const switchId = `cookie-${category.id}`
  return (
    <li className="rounded-2xl bg-rh-canvas/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor={category.required ? undefined : switchId} className="text-[15px] font-semibold text-rh-ink">
            {category.title}
          </label>
          <p className="mt-1 text-sm leading-6 text-rh-ink/65">{category.description}</p>
        </div>
        {category.required ? (
          <span className="mt-0.5 shrink-0 rounded-full bg-rh-ink px-2.5 py-1 text-[11px] font-semibold text-white">Always on</span>
        ) : (
          <Switch
            id={switchId}
            checked={checked}
            onCheckedChange={onChange}
            className="mt-0.5 data-[state=checked]:bg-rh-lime data-[state=unchecked]:bg-rh-ink/20 [&>span]:bg-white"
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-rh-ink/70 hover:text-rh-ink"
      >
        {open ? 'Hide details' : 'What we use'}
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="mt-3 divide-y divide-rh-ink/[0.07] rounded-xl bg-white">
          {category.items.map((item) => (
            <li key={item.name} className="px-3.5 py-3 text-xs leading-5">
              <p className="font-semibold text-rh-ink">
                {item.name} <span className="font-normal text-rh-ink/50">· {item.provider}</span>
              </p>
              <p className="text-rh-ink/65">{item.purpose}</p>
              {item.duration !== '—' && <p className="text-rh-ink/45">Kept for {item.duration.toLowerCase()}</p>}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function Body({
  choices,
  setChoices,
  onSave,
  onAcceptAll,
}: {
  choices: ConsentChoices
  setChoices: (choices: ConsentChoices) => void
  onSave: () => void
  onAcceptAll: () => void
}) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 sm:px-6">
        <ul className="space-y-3">
          {COOKIE_CATEGORIES.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              checked={category.id === 'essential' ? true : choices[category.id]}
              onChange={(value) => category.id !== 'essential' && setChoices({ ...choices, [category.id]: value })}
            />
          ))}
        </ul>
        <p className="mt-4 text-xs leading-5 text-rh-ink/55">
          {PLAY_TO_LOAD_NOTE}{' '}
          <Link href="/cookie-policy" className="font-semibold text-rh-ink underline-offset-4 hover:underline">
            Cookie policy
          </Link>
        </p>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-rh-ink/[0.07] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-5">
        <button
          type="button"
          onClick={onSave}
          className="h-11 rounded-full bg-rh-ink px-4 text-sm font-semibold text-white transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2"
        >
          Save choices
        </button>
        <button
          type="button"
          onClick={onAcceptAll}
          className="h-11 rounded-full bg-rh-lime px-4 text-sm font-semibold text-rh-ink transition hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2"
        >
          Accept all
        </button>
      </div>
    </>
  )
}

const DESCRIPTION = 'Choose what Rehabify may use. You can change this any time from “Cookie settings” at the bottom of the site.'

/** Category switches with the exact cookies behind each. A dialog on desktop, a bottom sheet on phones. */
export function CookieSettings({
  open,
  onOpenChange,
  initial,
  onSave,
  onAcceptAll,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: Consent | null
  onSave: (choices: ConsentChoices) => void
  onAcceptAll: () => void
}) {
  const isPhone = useIsPhone()
  const [choices, setChoices] = useState<ConsentChoices>(DEFAULT_CHOICES)

  // Start from the saved choice each time the panel opens
  useEffect(() => {
    if (open) setChoices(initial ? { analytics: initial.analytics } : DEFAULT_CHOICES)
  }, [open, initial])

  const body = <Body choices={choices} setChoices={setChoices} onSave={() => onSave(choices)} onAcceptAll={onAcceptAll} />

  if (isPhone) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="flex max-h-[92dvh] flex-col gap-0 rounded-t-3xl border-0 bg-white p-0 text-rh-ink">
          <SheetHeader className="shrink-0 px-5 pb-4 pr-12 pt-5 text-left">
            <SheetTitle className="text-xl font-semibold tracking-tight text-rh-ink">Cookie settings</SheetTitle>
            <SheetDescription className="text-sm text-rh-ink/60">{DESCRIPTION}</SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-lg flex-col gap-0 overflow-hidden rounded-[1.75rem] border-0 bg-white p-0 text-rh-ink">
        <DialogHeader className="shrink-0 px-6 pb-4 pr-12 pt-6 text-left">
          <DialogTitle className="text-xl font-semibold tracking-tight text-rh-ink">Cookie settings</DialogTitle>
          <DialogDescription className="text-sm text-rh-ink/60">{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  )
}
