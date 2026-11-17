'use client'

/**
 * Joining a group from its invite link (owner 2026-11-15): /community/join/<code>. Shows the group,
 * then one tap to join; people who aren't signed in (or haven't joined Learn yet) do that first and
 * come back here.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { ArrowRight, Loader2, Lock, Users } from '@/components/icons'
import { groupTone } from '@/lib/learnAdminsApi'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { displayFont, pillInk } from '../shared'
import { BackToCommunity } from './Community'
import { EmptyState, JoinPrompt, Skeleton } from './ui'
import { roomPath } from './socialApi'
import { groupApi, groupJoinPath } from './groupApi'
import { GroupAvatar } from './GroupAvatar'

export function GroupJoin({ code }: { code: string }) {
  const data = useQuery(groupApi.invitePreview, { code })
  const join = useMutation(groupApi.joinByInvite)
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const onJoin = async () => {
    setBusy(true)
    try {
      const res = await join({ code })
      playSound('success')
      toast.success('You’re in. Say hello to the group.')
      router.push(roomPath(res.roomSlug))
    } catch (err) {
      const msg = (err as { data?: unknown })?.data
      toast.error(typeof msg === 'string' && msg ? msg : 'Couldn’t join. Try again.')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <BackToCommunity />
      <div className="mt-6">
        {data === undefined ? (
          <Skeleton className="h-64 rounded-3xl" />
        ) : data.state === 'invalid' ? (
          <EmptyState icon={<Lock className="h-5 w-5" />} title="This invite link isn’t working">
            The group’s lead may have turned it off or made a new one. Ask them for the latest link.
          </EmptyState>
        ) : (
          <GroupCard group={data.group}>
            {data.state === 'signin' ? (
              <JoinPrompt signedIn={false} returnTo={groupJoinPath(code)}>
                Join Rehabify Learn for free (or sign in), then you’ll join {data.group.name}.
              </JoinPrompt>
            ) : data.state === 'welcome' ? (
              <JoinPrompt signedIn returnTo={groupJoinPath(code)}>
                Tell us whether you’re a physio, a student or something else, then you’ll join {data.group.name}.
              </JoinPrompt>
            ) : data.state === 'member' ? (
              <Link href={roomPath(data.group.roomSlug)} className={cn(pillInk, 'h-12 w-full')}>
                You’re already in. Open the group <ArrowRight className="h-4 w-4" />
              </Link>
            ) : data.state === 'full' ? (
              <p className="rounded-2xl bg-rh-cream p-4 text-sm text-rh-ink/70">This group is full. Ask the lead about another group.</p>
            ) : (
              <button type="button" onClick={() => void onJoin()} disabled={busy} className={cn(pillInk, 'h-12 w-full')}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Join the group
              </button>
            )}
          </GroupCard>
        )}
      </div>
    </main>
  )
}

function GroupCard({
  group,
  children,
}: {
  group: { name: string; description: string | null; color: string; imageUrl?: string | null; memberCount: number; leads: string[] }
  children: React.ReactNode
}) {
  const tone = groupTone(group.color)
  return (
    <div className="rounded-3xl border border-rh-ink/[0.08] bg-white p-6 sm:p-8">
      {group.imageUrl ? (
        <GroupAvatar group={group} size={56} rounded="2xl" />
      ) : (
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: tone.soft, color: tone.ink }}>
          <Users className="h-6 w-6" />
        </span>
      )}
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-rh-ink/50">You’re invited to a private group</p>
      <h1 className={cn('mt-1.5 break-words text-[30px] leading-tight tracking-tight text-rh-ink sm:text-[38px]', displayFont)}>{group.name}</h1>
      {group.description && <p className="mt-2 text-[15px] leading-6 text-rh-ink/65">{group.description}</p>}
      <p className="mt-3 text-sm text-rh-ink/55">
        {group.memberCount} {group.memberCount === 1 ? 'person' : 'people'}
        {group.leads.length ? ` · led by ${group.leads.join(' & ')}` : ''}
      </p>
      <p className="mt-4 text-sm leading-6 text-rh-ink/60">Members get the group’s private room, its Spaces, work set by the lead and a group leaderboard.</p>
      <div className="mt-6">{children}</div>
    </div>
  )
}
