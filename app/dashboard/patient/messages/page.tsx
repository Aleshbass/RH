'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Loader2, MessageSquare, Plus, Search, Stethoscope } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import RealtimeChat from '@/components/chat/RealtimeChat'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  EmptyState,
  InfoTip,
  LoadingBlocks,
  PatientDrawer,
  fieldClass,
  primaryButtonClass,
} from '@/components/patient/ui'
import { PhysioPhoto } from '@/components/patient/PhysioPhoto'
import { programError } from '@/components/exercise-programs/errors'
import { cn } from '@/lib/utils'

// Shape returned by api.chat.getMyConversations
interface ConversationWithParticipant {
  _id: Id<'conversations'>
  otherParticipant: {
    _id: Id<'users'>
    firstName?: string
    lastName?: string
    role?: string
    imageUrl?: string
    isOnline?: boolean
  }
  lastMessage?: {
    content: string
    timestamp: number
    senderName: string
  }
  unreadCount: number
  updatedAt: number
}

// Shape returned by api.patientInvitations.getMyPhysiotherapists (only the fields used here)
type MyPhysiotherapist = {
  _id: Id<'users'>
  firstName?: string
  lastName?: string
  imageUrl?: string
  clinic?: { name?: string } | null
}

const ROLE_LABELS: Record<string, string> = {
  physiotherapist: 'Physiotherapist',
  clinic_owner: 'Clinic',
  clinic_staff: 'Clinic team',
  admin: 'Rehabify support',
}

const fullName = (p: { firstName?: string; lastName?: string }) =>
  [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Your physiotherapist'

/**
 * Card height: the screen minus the top bar and the page padding (and the tab bar on phones),
 * so the conversation scrolls inside the card and the message box stays in view.
 */
const PANE_HEIGHT = 'h-[calc(100dvh_-_10.5rem_-_env(safe-area-inset-bottom))] min-h-[420px] lg:h-[calc(100dvh_-_9rem)]'

function MessagesPage() {
  const searchParams = useSearchParams()
  const withParam = searchParams.get('with')

  const [selectedId, setSelectedId] = useState<Id<'conversations'> | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')

  const currentUser = useQuery(api.users.getMyUser) as { _id: Id<'users'>; role?: string } | null | undefined
  const conversations = useQuery(api.chat.getMyConversations, currentUser ? {} : 'skip') as
    | ConversationWithParticipant[]
    | undefined
  const myPhysiotherapists = useQuery(
    api.patientInvitations.getMyPhysiotherapists,
    currentUser?.role === 'patient' ? {} : 'skip'
  ) as MyPhysiotherapist[] | undefined
  const getOrCreateConversation = useMutation(api.chat.getOrCreateConversation)

  const selected = useMemo(
    () => conversations?.find((c) => c._id === selectedId) ?? null,
    [conversations, selectedId]
  )

  const filtered = useMemo(() => {
    if (!conversations) return []
    const term = search.trim().toLowerCase()
    if (!term) return conversations
    return conversations.filter(
      (c) =>
        fullName(c.otherParticipant).toLowerCase().includes(term) ||
        c.lastMessage?.content.toLowerCase().includes(term)
    )
  }, [conversations, search])

  // Physios the patient can message who don't have a conversation yet
  const notYetMessaged = useMemo(() => {
    const talking = new Set((conversations ?? []).map((c) => c.otherParticipant._id))
    return (myPhysiotherapists ?? []).filter((p) => !talking.has(p._id))
  }, [conversations, myPhysiotherapists])

  const openConversation = (id: Id<'conversations'>) => {
    setSelectedId(id)
    setMobileView('chat')
  }

  const startWith = async (physiotherapistId: Id<'users'>) => {
    const existing = conversations?.find((c) => c.otherParticipant._id === physiotherapistId)
    if (existing) {
      openConversation(existing._id)
      setNewOpen(false)
      return
    }
    setStarting(physiotherapistId)
    try {
      const res = await getOrCreateConversation({ participantId: physiotherapistId })
      openConversation(res.conversationId)
      setNewOpen(false)
    } catch (err) {
      toast.error(programError(err, 'Couldn’t start the conversation. Please try again.'))
    } finally {
      setStarting(null)
    }
  }

  // ?with=<physio user id> (from My physiotherapist): open or start that chat once everything has loaded
  const handledWith = useRef(false)
  useEffect(() => {
    if (!withParam || handledWith.current || conversations === undefined || myPhysiotherapists === undefined) return
    handledWith.current = true
    const existing = conversations.find((c) => c.otherParticipant._id === withParam)
    if (existing) {
      openConversation(existing._id)
      return
    }
    if (myPhysiotherapists.some((p) => p._id === withParam)) void startWith(withParam as Id<'users'>)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withParam, conversations, myPhysiotherapists])

  const loading = currentUser === undefined || (currentUser && conversations === undefined)
  const canMessageSomeone = (myPhysiotherapists?.length ?? 0) > 0

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className={cn('flex overflow-hidden rounded-3xl border border-pt-line bg-pt-surface shadow-pt dark:shadow-none', PANE_HEIGHT)}>
        {/* Conversation list */}
        <aside
          className={cn(
            'w-full min-w-0 flex-col border-pt-line md:flex md:w-80 md:border-r lg:w-96',
            mobileView === 'chat' ? 'hidden' : 'flex'
          )}
        >
          <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
            <h1 className="flex items-center gap-1.5 text-xl font-semibold tracking-tight text-pt-ink">
              Messages
              <InfoTip>
                Private messages with the physiotherapists looking after you. They usually reply within a working day. For anything urgent, call
                your clinic or seek medical help.
              </InfoTip>
            </h1>
            <Button size="sm" className={cn(primaryButtonClass, 'h-9 px-3')} onClick={() => setNewOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New
            </Button>
          </div>

          {(conversations?.length ?? 0) > 3 && (
            <div className="px-4 pb-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pt-faint" />
                <Input
                  placeholder="Search messages"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={cn(fieldClass, 'h-10 pl-9')}
                  aria-label="Search messages"
                />
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {loading ? (
              <LoadingBlocks rows={4} className="px-2" />
            ) : filtered.length === 0 && search ? (
              <p className="px-4 py-8 text-center text-sm text-pt-muted">No conversations match “{search}”.</p>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No messages yet"
                description={
                  canMessageSomeone
                    ? 'Ask your physio a question about your exercises, your plan or your next visit.'
                    : 'You can message a physiotherapist once you’re under their care: after you book a session or accept their invitation.'
                }
                action={
                  canMessageSomeone ? (
                    <Button className={primaryButtonClass} onClick={() => setNewOpen(true)}>
                      Start a conversation
                    </Button>
                  ) : (
                    <Button asChild className={primaryButtonClass}>
                      <Link href="/find-a-physio">Find a physio</Link>
                    </Button>
                  )
                }
              />
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((conversation) => {
                  const other = conversation.otherParticipant
                  const isSelected = selectedId === conversation._id
                  const unread = conversation.unreadCount > 0
                  return (
                    <li key={conversation._id}>
                      <button
                        type="button"
                        onClick={() => openConversation(conversation._id)}
                        aria-current={isSelected ? 'true' : undefined}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50',
                          isSelected ? 'bg-pt-sunken' : 'hover:bg-pt-hover'
                        )}
                      >
                        <span className="relative">
                          <PhysioPhoto name={fullName(other)} imageUrl={other.imageUrl} size={44} />
                          {other.isOnline && (
                            <span
                              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-pt-surface bg-pt-accent"
                              aria-label="Online"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={cn('truncate text-sm text-pt-ink', unread ? 'font-bold' : 'font-semibold')}>
                              {fullName(other)}
                            </span>
                            {conversation.lastMessage?.timestamp && (
                              <span className="shrink-0 text-[11px] text-pt-faint">
                                {formatDistanceToNowStrict(conversation.lastMessage.timestamp)}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2">
                            <span className={cn('truncate text-[13px]', unread ? 'font-medium text-pt-ink' : 'text-pt-muted')}>
                              {conversation.lastMessage?.content || 'No messages yet'}
                            </span>
                            {unread && (
                              <span className="min-w-[20px] shrink-0 rounded-full bg-pt-accent px-1.5 text-center text-[11px] font-bold leading-5 text-[#06210a]">
                                {conversation.unreadCount}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Conversation */}
        <section className={cn('min-w-0 flex-1 flex-col md:flex', mobileView === 'chat' ? 'flex' : 'hidden')}>
          {selected ? (
            <>
              <div className="flex h-16 shrink-0 items-center gap-3 border-b border-pt-line px-3 sm:px-4">
                <button
                  type="button"
                  onClick={() => setMobileView('list')}
                  aria-label="Back to all messages"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-pt-muted hover:bg-pt-hover hover:text-pt-ink md:hidden"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <PhysioPhoto name={fullName(selected.otherParticipant)} imageUrl={selected.otherParticipant.imageUrl} size={38} className="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-pt-ink">{fullName(selected.otherParticipant)}</p>
                  <p className="text-xs text-pt-muted">
                    {selected.otherParticipant.isOnline
                      ? 'Online now'
                      : (selected.otherParticipant.role && ROLE_LABELS[selected.otherParticipant.role]) || 'Care team'}
                  </p>
                </div>
                {selected.otherParticipant.role === 'physiotherapist' && (
                  <Link
                    href={`/dashboard/patient/my-physiotherapist/${selected.otherParticipant._id}`}
                    className="hidden items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-pt-muted hover:bg-pt-hover hover:text-pt-ink sm:inline-flex"
                  >
                    View profile
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <RealtimeChat key={selected.otherParticipant._id} recipientId={selected.otherParticipant._id} embedded variant="patient" />
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-pt-sunken text-pt-muted">
                <MessageSquare className="h-6 w-6" />
              </span>
              <p className="text-base font-semibold text-pt-ink">Pick a conversation</p>
              <p className="mt-1 max-w-xs text-sm text-pt-muted">Choose someone on the left, or start a new message to your physio.</p>
            </div>
          )}
        </section>
      </div>

      {/* New message */}
      <PatientDrawer
        open={newOpen}
        onOpenChange={setNewOpen}
        title="New message"
        description="Who would you like to message?"
      >
        {myPhysiotherapists === undefined ? (
          <LoadingBlocks rows={2} />
        ) : myPhysiotherapists.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No physiotherapist yet"
            description="You can message a physiotherapist once you’re under their care: after you book a session or accept their invitation."
            action={
              <Button asChild className={primaryButtonClass}>
                <Link href="/find-a-physio">Find a physio</Link>
              </Button>
            }
          />
        ) : (
          <ul className="-mx-2 space-y-1">
            {[...notYetMessaged, ...myPhysiotherapists.filter((p) => !notYetMessaged.includes(p))].map((p) => (
              <li key={p._id}>
                <button
                  type="button"
                  disabled={starting !== null}
                  onClick={() => startWith(p._id)}
                  className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-pt-hover disabled:opacity-60"
                >
                  <PhysioPhoto name={fullName(p)} imageUrl={p.imageUrl} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-pt-ink">{fullName(p)}</span>
                    <span className="block truncate text-xs text-pt-muted">{p.clinic?.name ?? 'Physiotherapist'}</span>
                  </span>
                  {starting === p._id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-pt-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-pt-faint" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PatientDrawer>
    </div>
  )
}

export default function PatientMessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl">
          <LoadingBlocks rows={4} />
        </div>
      }
    >
      <MessagesPage />
    </Suspense>
  )
}
