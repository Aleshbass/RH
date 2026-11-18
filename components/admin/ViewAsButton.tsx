'use client'

/**
 * Admin › person page: "View as" (convex/adminViewAs.ts). Full admins only. Makes a one-time,
 * 10-minute link to open in a private window, where Rehabify looks exactly as it does for them.
 */
import { useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Copy, Eye, Loader2 } from '@/components/icons'
import { primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import type { Id } from '@/convex/_generated/dataModel'

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const meRef = makeFunctionReference<'query', Record<string, never>, { full: boolean } | null>('adminAccess:me')
const createLinkRef = makeFunctionReference<'action', { userId: Id<'users'> }, { url: string; name: string; minutes: number }>(
  'adminViewAs:createViewAsLink'
)

const TEAM_ROLES = new Set(['admin', 'blog_editor', 'learn_instructor'])

export function ViewAsButton({ userId, role, isMe }: { userId: Id<'users'>; role?: string | null; isMe: boolean }) {
  const access = useQuery(meRef, {})
  const createLink = useAction(createLinkRef)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<{ url: string; name: string; minutes: number } | null>(null)
  const [copied, setCopied] = useState(false)

  if (!access?.full || isMe || TEAM_ROLES.has(role ?? '')) return null

  const make = async () => {
    setBusy(true)
    try {
      setLink(await createLink({ userId }))
      setCopied(false)
    } catch (error) {
      toast.error(error instanceof ConvexError ? String(error.data) : 'The link couldn’t be made. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button onClick={() => void make()} disabled={busy} className={softButtonClass}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
        View as
      </Button>
      <Dialog open={link !== null} onOpenChange={(open) => !open && setLink(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>See Rehabify as {link?.name}</DialogTitle>
            <DialogDescription>
              Copy the link into a private (incognito) window, so you stay signed in here. It works once, for {link?.minutes} minutes. While it&apos;s
              open you are {link?.name}: anything you do there (messages, notes, payments) happens as them. A bar shows it the whole time; press End
              when you&apos;re done. This is in the activity log.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Button
              className={primaryButtonClass}
              onClick={() => {
                if (!link) return
                void navigator.clipboard.writeText(link.url).then(() => {
                  setCopied(true)
                  toast.success('Link copied. Paste it into a private window.')
                })
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button className={softButtonClass} onClick={() => setLink(null)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
