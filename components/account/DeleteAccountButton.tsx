'use client'

import { useState } from 'react'
import { useClerk } from '@clerk/nextjs'
import { toast } from 'sonner'
import { Loader2, Trash2 } from '@/components/icons'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'

/**
 * Deletes the signed-in person's account (POST /api/account/delete) once they type DELETE, then
 * signs them out. Each portal passes its own trigger style and says which records are kept.
 */
export function DeleteAccountButton({ triggerClassName, kept }: { triggerClassName?: string; kept: string }) {
  const { signOut } = useClerk()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(body.error ?? "We couldn't delete your account. Please try again.")
        return
      }
      toast.success('Your account has been deleted')
      await signOut({ redirectUrl: '/' })
    } catch {
      toast.error("We couldn't delete your account. Check your connection and try again.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (deleting) return
        setOpen(next)
        setTyped('')
      }}
    >
      <AlertDialogTrigger asChild>
        <button type="button" className={triggerClassName}>
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete account
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This erases your name, contact details and profile and signs you out for good. {kept} This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="block text-sm font-medium">
          Type DELETE to confirm
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            className="mt-1.5"
            disabled={deleting}
          />
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Keep my account</AlertDialogCancel>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={typed.trim() !== 'DELETE' || deleting}
            className="inline-flex h-9 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete my account
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
