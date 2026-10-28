'use client'

import { useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { BookOpen, ExternalLink, Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { PhysioDrawer, primaryButtonClass, secondaryButtonClass, useIsPhone } from '@/components/physio/ui'
import { SettingsSection } from '@/components/physio/SettingsUI'

type Handbook = { title: string; version: string; uploadedAt: number; size: number }

// Plain references: the generated api type is at TypeScript's depth limit (TS2589)
const getCurrentRef = makeFunctionReference<'query', Record<string, never>, Handbook | null>('physioSetup:getPracticeHandbook')
const getReadLinkRef = makeFunctionReference<'action', Record<string, never>, { url: string; expiresAt: number }>(
  'physioSetup:getPracticeHandbookLink'
)

const errorText = (error: unknown) =>
  error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Couldn’t open the handbook. Please try again.'

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

/**
 * Rehabify's physiotherapist handbook (Standard of Physiotherapy Practice), read inside Rehabify.
 * The PDF is private: each open fetches a link that works for an hour. Wide screens show it in a
 * drawer beside the page; phones can't show a PDF inside a page, so it opens in their PDF viewer.
 */
export function PracticeHandbookSection() {
  const handbook = useQuery(getCurrentRef, {})
  const getReadLink = useAction(getReadLinkRef)
  const isPhone = useIsPhone()
  const [link, setLink] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  // Only approved physios see it, and only once the clinical team has published it
  if (!handbook) return null

  const read = async () => {
    // Opened before the link arrives, so the phone doesn't treat it as an unwanted pop-up
    const tab = isPhone ? window.open('', '_blank') : null
    setOpening(true)
    try {
      const { url } = await getReadLink({})
      if (!isPhone) setLink(url)
      else if (tab) tab.location.href = url
      else window.location.href = url
    } catch (error) {
      tab?.close()
      toast.error(errorText(error))
    } finally {
      setOpening(false)
    }
  }

  return (
    <SettingsSection
      title="Physiotherapist handbook"
      description="Rehabify’s Standard of Physiotherapy Practice: how every appointment runs, what to record, and when to review, refer or discharge."
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rh-honeydew text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime" aria-hidden>
            <BookOpen className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 dark:text-white">{handbook.title}</p>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Version {handbook.version} · Updated {new Date(handbook.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · PDF,{' '}
              {megabytes(handbook.size)}
            </p>
          </div>
        </div>
        <Button onClick={() => void read()} disabled={opening} className={primaryButtonClass}>
          {opening && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Read handbook
        </Button>
      </div>

      <PhysioDrawer
        open={link !== null}
        onOpenChange={(open) => !open && setLink(null)}
        title={handbook.title}
        description={`Version ${handbook.version}`}
        className="sm:max-w-none md:max-w-3xl xl:max-w-5xl"
        footer={
          link && (
            <div className="flex justify-end">
              <Button asChild className={secondaryButtonClass}>
                <a href={link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  Open in a new tab
                </a>
              </Button>
            </div>
          )
        }
      >
        {link && (
          <iframe
            src={`${link}#view=FitH`}
            title={handbook.title}
            className="h-[calc(100dvh-11rem)] w-full rounded-xl border border-pt-line bg-pt-sunken"
          />
        )}
      </PhysioDrawer>
    </SettingsSection>
  )
}
