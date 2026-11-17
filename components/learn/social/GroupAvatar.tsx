'use client'

/**
 * A Learn group's picture (user 2026-11-17), or its colour with the group icon when it has none.
 * GroupImageButton lets Learn admins and the group's champion add, change or remove it.
 */

import { useRef, useState } from 'react'
import Image from 'next/image'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Camera, Loader2, Trash2, Users } from '@/components/icons'
import { cn } from '@/lib/utils'
import { groupImageUploadUrlRef, groupTone, setGroupImageRef } from '@/lib/learnAdminsApi'
import type { Id } from '@/convex/_generated/dataModel'

type GroupLook = { name: string; color: string | null | undefined; imageUrl?: string | null }

export function GroupAvatar({ group, size = 44, className, rounded = 'xl' }: { group: GroupLook; size?: number; className?: string; rounded?: 'xl' | '2xl' | 'full' }) {
  const tone = groupTone(group.color)
  const radius = rounded === 'full' ? 'rounded-full' : rounded === '2xl' ? 'rounded-2xl' : 'rounded-xl'
  if (group.imageUrl) {
    return (
      <Image
        src={group.imageUrl}
        alt={group.name}
        width={size}
        height={size}
        unoptimized
        className={cn('shrink-0 object-cover', radius, className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span className={cn('flex shrink-0 items-center justify-center', radius, className)} style={{ width: size, height: size, background: tone.soft, color: tone.ink }} aria-hidden>
      <Users style={{ width: Math.round(size * 0.4), height: Math.round(size * 0.4) }} />
    </span>
  )
}

const MAX_BYTES = 5 * 1024 * 1024

/** "Add picture" / "Change picture" (+ remove) for a group. */
export function GroupImageButton({ groupId, hasImage, className, tone = 'learn' }: { groupId: Id<'learnGroups'> | string; hasImage: boolean; className?: string; tone?: 'learn' | 'admin' }) {
  const getUrl = useMutation(groupImageUploadUrlRef)
  const setImage = useMutation(setGroupImageRef)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const errorText = (err: unknown) => {
    const data = (err as { data?: unknown })?.data
    return typeof data === 'string' ? data : 'Something went wrong. Please try again.'
  }

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) return toast.error('Use a JPG, PNG or WebP picture.')
    if (file.size > MAX_BYTES) return toast.error('The picture is over 5 MB. Please use a smaller one.')
    setBusy('upload')
    try {
      const url = await getUrl({ groupId: groupId as Id<'learnGroups'> })
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
      if (!res.ok) throw new Error('upload failed')
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> }
      await setImage({ groupId: groupId as Id<'learnGroups'>, storageId })
      toast.success('Group picture updated.')
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
      if (input.current) input.current.value = ''
    }
  }

  const remove = async () => {
    setBusy('remove')
    try {
      await setImage({ groupId: groupId as Id<'learnGroups'>, storageId: null })
      toast.success('Picture removed.')
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  const base =
    tone === 'admin'
      ? 'inline-flex h-9 items-center gap-1.5 rounded-xl bg-rh-honeydew px-3 text-sm font-medium text-rh-ink transition hover:bg-[#e2f7d8] disabled:opacity-60 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1]'
      : 'inline-flex h-9 items-center gap-1.5 rounded-full border border-rh-ink/10 bg-white px-3.5 text-sm font-medium text-rh-ink transition hover:border-rh-ink/25 disabled:opacity-60'

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2', className)}>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
        }}
      />
      <button type="button" className={base} onClick={() => input.current?.click()} disabled={busy !== null}>
        {busy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {hasImage ? 'Change picture' : 'Add picture'}
      </button>
      {hasImage && (
        <button type="button" className={cn(base, 'px-2.5')} onClick={remove} disabled={busy !== null} aria-label="Remove picture" title="Remove picture">
          {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      )}
    </span>
  )
}
