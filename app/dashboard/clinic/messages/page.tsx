'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ChevronLeft, MessageSquare, Plus } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import RealtimeChat from '@/components/chat/RealtimeChat'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/clinic/drawerDialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, PageShell } from '@/components/clinic/ui'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'
import { TeamChat } from '@/components/clinic/team/TeamChat'
import { cn } from '@/lib/utils'

type Conversation = {
  _id: Id<'conversations'>
  otherParticipant: { _id: Id<'users'>; firstName?: string; lastName?: string; displayName?: string }
  lastMessage?: { content: string }
  unreadCount: number
}

type ClinicPatient = { _id: string; firstName?: string; lastName?: string; email?: string }

const teamUnreadRef = makeFunctionReference<'query', Record<string, never>, number>('clinicTeamChat:getTeamUnreadCount')

// How they appear (convex/helpers/displayIdentity.ts): patients by their profile name
const fullName = (p?: { firstName?: string; lastName?: string; displayName?: string }) =>
  p?.displayName || [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Patient'
const initials = (p?: { firstName?: string; lastName?: string; displayName?: string }) =>
  fullName(p).split(/\s+/).slice(0, 2).map((word) => word[0] ?? '').join('').toUpperCase() || '?'

/**
 * Messages in the clinic portal: the clinic's patients (a clinician sees their own patients,
 * the owner the whole clinic) and colleagues. Same chat as the physio and patient portals.
 */
export default function ClinicMessagesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isReadOnly } = useClinicAccess()
  const conversations = useQuery(api.chat.getMyConversations, isReadOnly ? 'skip' : {}) as Conversation[] | undefined
  const clinicPatients = useQuery(api.clinics.getClinicPatients, isReadOnly ? 'skip' : {}) as ClinicPatient[] | undefined
  const patients = useMemo(() => clinicPatients ?? [], [clinicPatients])
  const teamUnread = useQuery(teamUnreadRef, isReadOnly ? 'skip' : {})
  const patientUnread = (conversations ?? []).reduce((sum, c) => sum + (c.unreadCount ?? 0), 0)

  const [recipientId, setRecipientId] = useState<Id<'users'> | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Patients, or the staff-only team chat (?team=team | ?team=patient:<id> opens a thread)
  const teamParam = searchParams.get('team')
  const [tab, setTab] = useState<'patients' | 'team'>(teamParam ? 'team' : 'patients')
  useEffect(() => {
    if (teamParam) setTab('team')
  }, [teamParam])
  const [pickerSearch, setPickerSearch] = useState('')

  // ?with=<userId> opens that conversation
  useEffect(() => {
    const target = searchParams.get('with')
    if (target) setRecipientId(target as Id<'users'>)
  }, [searchParams])

  const recipient = useMemo(() => {
    if (!recipientId) return undefined
    return (
      conversations?.find((c) => c.otherParticipant._id === recipientId)?.otherParticipant ??
      patients.find((p) => p._id === recipientId)
    )
  }, [recipientId, conversations, patients])

  const pickerResults = useMemo(() => {
    const term = pickerSearch.trim().toLowerCase()
    return patients.filter((p) => !term || `${fullName(p)} ${p.email ?? ''}`.toLowerCase().includes(term))
  }, [patients, pickerSearch])

  const select = (id: Id<'users'>) => {
    setRecipientId(id)
    if (searchParams.get('with')) router.replace('/dashboard/clinic/messages')
  }

  if (isReadOnly) {
    return (
      <PageShell title="Messages">
        <EmptyState
          icon={<MessageSquare />}
          title="Messages open once your clinic is live"
          description="Then you and your clinicians can message your patients here, and talk to each other in the team chat."
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Messages"
      description={tab === 'team' ? 'Only your team sees these. Patients never do.' : 'Your patients write to the clinic here.'}
      info="Patients see messages from you as coming from the clinic, and from clinicians as “Name — Clinic”. The Team chat is staff-only: one group for everyone, and one thread per patient."
    >
      <div className="-mt-2 inline-flex rounded-2xl bg-pt-sunken p-1" role="tablist" aria-label="Messages">
        {(
          [
            ['patients', 'Patients'],
            ['team', 'Team'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition',
              tab === value ? 'bg-pt-surface text-pt-ink shadow-pt dark:shadow-none' : 'text-pt-muted hover:text-pt-ink'
            )}
          >
            {label}
            {(value === 'team' ? teamUnread ?? 0 : patientUnread) > 0 && (
              <span className="min-w-[18px] rounded-full bg-pt-accent px-1 text-center text-[10px] font-bold leading-[18px] text-[#06210a]">
                {value === 'team' ? teamUnread : patientUnread}
              </span>
            )}
          </button>
        ))}
      </div>
      {tab === 'team' && (
        <div className="h-[calc(100dvh-17rem)] min-h-[28rem] overflow-hidden rounded-3xl border border-pt-line bg-pt-surface shadow-pt dark:shadow-none">
          <TeamChat initial={teamParam ?? 'team'} />
        </div>
      )}
      <div className={cn('flex h-[calc(100dvh-17rem)] min-h-[28rem] overflow-hidden rounded-3xl border border-pt-line bg-pt-surface shadow-pt dark:shadow-none', tab === 'team' && 'hidden')}>
        <aside
          className={cn(
            'flex w-full flex-col border-r border-pt-line md:w-80 md:shrink-0',
            recipientId ? 'hidden md:flex' : 'flex'
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-pt-line px-4">
            <h1 className="text-base font-semibold text-pt-ink">Messages</h1>
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              New
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations === undefined ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <EmptyState
                icon={<MessageSquare className="h-8 w-8" />}
                title="No conversations yet"
                description="Message a patient to check in between sessions or answer their questions."
              />
            ) : (
              <ul>
                {conversations.map((conversation) => {
                  const person = conversation.otherParticipant
                  const active = person._id === recipientId
                  return (
                    <li key={conversation._id}>
                      <button
                        type="button"
                        onClick={() => select(person._id)}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                          active ? 'bg-pt-sunken' : 'hover:bg-pt-hover'
                        )}
                      >
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarFallback className="bg-pt-sunken text-xs font-medium text-pt-muted">
                            {initials(person)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-sm text-pt-ink', conversation.unreadCount > 0 && 'font-semibold')}>
                            {fullName(person)}
                          </span>
                          {conversation.lastMessage && (
                            <span className="block truncate text-xs text-pt-muted">{conversation.lastMessage.content}</span>
                          )}
                        </span>
                        {conversation.unreadCount > 0 && (
                          <span className="min-w-5 rounded-full bg-rh-lime px-1.5 text-center text-[11px] font-medium leading-5 text-rh-ink dark:bg-rh-lime dark:text-neutral-950">
                            {conversation.unreadCount}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        <section className={cn('min-w-0 flex-1 flex-col', recipientId ? 'flex' : 'hidden md:flex')}>
          {recipientId ? (
            <>
              <div className="flex h-14 shrink-0 items-center gap-2 border-b border-pt-line px-2 md:px-4">
                <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setRecipientId(null)} aria-label="Back to conversations">
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <p className="truncate text-sm font-semibold text-pt-ink">{fullName(recipient)}</p>
              </div>
              <div className="min-h-0 flex-1">
                <RealtimeChat key={recipientId} recipientId={recipientId} embedded />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState title="Choose a conversation" description="Or start a new one with a patient." />
            </div>
          )}
        </section>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="gap-0 p-0 sm:max-w-md">
          <DialogHeader className="border-b border-pt-line p-4">
            <DialogTitle>New message</DialogTitle>
          </DialogHeader>
          <div className="p-3">
            <Input
              autoFocus
              placeholder="Search patients"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              aria-label="Search patients"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto pb-2">
            {clinicPatients === undefined ? (
              <li className="px-4 py-3 text-sm text-pt-muted">Loading…</li>
            ) : pickerResults.length === 0 ? (
              <li className="px-4 py-3 text-sm text-pt-muted">No patients found.</li>
            ) : (
              pickerResults.map((patient) => (
                <li key={patient._id}>
                  <button
                    type="button"
                    onClick={() => {
                      select(patient._id as Id<'users'>)
                      setPickerOpen(false)
                      setPickerSearch('')
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-pt-hover"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-pt-sunken text-xs">{initials(patient)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-pt-ink">{fullName(patient)}</span>
                      {patient.email && <span className="block truncate text-xs text-pt-muted">{patient.email}</span>}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
