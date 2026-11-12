'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { ArrowRight, GraduationCap, Newspaper, UserCheck, WhatsApp } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { primaryButtonClass } from '@/components/admin/ui'
import { teamAccessApi } from '@/lib/teamAccessApi'

const PAGE = '/dashboard/admin/team-access'

const POINTS = [
  {
    icon: WhatsApp,
    title: 'Just an email or WhatsApp number',
    text: 'An existing account switches straight away. Anyone else gets a one-time invite link, by email or sent from your WhatsApp in one tap.',
  },
  {
    icon: Newspaper,
    title: 'Blog writers',
    text: 'See only the blog. They write and send posts for review; you publish.',
  },
  {
    icon: GraduationCap,
    title: 'Learn instructors',
    text: 'See only their own video courses on Rehabify Learn. They send them for review; you set the price and publish.',
  },
]

/**
 * A one-time "New" pop-up for admins about Blog & Learn access. Seen once per admin on any
 * device (featureIntros in Convex); closing it or opening the page both count as seen.
 */
export function TeamAccessIntro() {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const intro = useQuery(teamAccessApi.intro, {})
  const dismiss = useMutation(teamAccessApi.dismissIntro)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!intro?.show || done) return
    // Already on the page: that counts as seeing it
    if (pathname.startsWith(PAGE)) {
      setDone(true)
      void dismiss({}).catch(() => undefined)
      return
    }
    // A moment after the console loads, so it doesn't fight the page for attention
    const timer = window.setTimeout(() => setOpen(true), 1200)
    return () => window.clearTimeout(timer)
  }, [intro?.show, done, pathname, dismiss])

  const close = (goToPage: boolean) => {
    setOpen(false)
    setDone(true)
    void dismiss({}).catch(() => undefined)
    if (goToPage) router.push(PAGE)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close(false)}>
      <DialogContent className="overflow-hidden rounded-3xl border-0 p-0 sm:max-w-md dark:bg-rh-ink-2">
        <div className="bg-rh-ink px-6 pb-6 pt-7 text-white">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rh-lime px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-rh-ink">
            New
          </span>
          <DialogHeader className="mt-4 space-y-2 text-left">
            <DialogTitle className="text-2xl font-bold leading-tight text-white">Give Blog and Learn access in seconds</DialogTitle>
            <DialogDescription className="text-[15px] leading-relaxed text-white/75">
              Let people write for the blog or teach on Rehabify Learn, without giving them the rest of the admin console.
            </DialogDescription>
          </DialogHeader>
        </div>
        <ul className="space-y-4 px-6 py-5">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rh-honeydew text-rh-ink dark:bg-white/10 dark:text-rh-lime">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-rh-ink dark:text-white">{title}</span>
                <span className="block text-[13px] leading-snug text-neutral-500 dark:text-neutral-400">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col-reverse gap-2 border-t border-black/[0.06] px-6 py-4 sm:flex-row sm:justify-end dark:border-white/10">
          <Button variant="ghost" className="rounded-xl" onClick={() => close(false)}>
            Got it
          </Button>
          <Button className={primaryButtonClass} onClick={() => close(true)}>
            <UserCheck className="mr-2 h-4 w-4" /> Open Blog &amp; Learn access <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
