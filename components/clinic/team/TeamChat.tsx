'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNowStrict, format } from 'date-fns'
import { toast } from 'sonner'
import { playSound } from '@/lib/sounds'
import { ChevronLeft, Loader2, Send, Users, UserRound } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials, primaryButtonClass } from '@/components/patient/ui'
import { cn } from '@/lib/utils'

type Thread = {
  _id: string
  kind: 'team' | 'patient'
  patientId: string | null
  title: string
  preview: string | null
  lastMessageAt: number
  unread: number
}
type ThreadList = { clinicName: string; isOwner: boolean; threads: Thread[] } | null
type ThreadView = {
  threadId: string | null
  kind: 'team' | 'patient'
  title: string
  patientId: string | null
  messages: {
    _id: string
    body: string
    createdAt: number
    mine: boolean
    sender: { name: string; subtitle: string | null; imageUrl: string | null }
  }[]
} | null

const threadsRef = makeFunctionReference<'query', Record<string, never>, ThreadList>('clinicTeamChat:getMyTeamThreads')
const messagesRef = makeFunctionReference<'query', { threadId?: string; patientId?: string }, ThreadView>(
  'clinicTeamChat:getThreadMessages'
)
const sendRef = makeFunctionReference<'mutation', { threadId?: string; patientId?: string; body: string }, { threadId: string }>(
  'clinicTeamChat:sendTeamMessage'
)
const readRef = makeFunctionReference<'mutation', { threadId: string }, null>('clinicTeamChat:markTeamThreadRead')

/** "team", or "patient:<id>" for a patient's thread */
export type TeamChatTarget = string

const errorText = (err: unknown, fallback: string) => {
  const data = (err as { data?: unknown } | null)?.data
  return typeof data === 'string' && data ? data : fallback
}

/**
 * The clinic's staff chat, in both the clinic portal (owner) and the physio portal (clinicians):
 * the team group, and a thread per patient ("Ask about this patient"). Patients never see it.
 */
export function TeamChat({ initial = 'team', className }: { initial?: TeamChatTarget; className?: string }) {
  const list = useQuery(threadsRef, {})
  const [target, setTarget] = useState<TeamChatTarget>(initial)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(initial === 'team' ? 'list' : 'chat')
  useEffect(() => setTarget(initial), [initial])

  const args = target.startsWith('patient:') ? { patientId: target.slice('patient:'.length) } : { threadId: target }
  const view = useQuery(messagesRef, list ? args : 'skip')
  const send = useMutation(sendRef)
  const markRead = useMutation(readRef)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const threadKey = (thread: Thread) => (thread.kind === 'team' ? 'team' : `patient:${thread.patientId}`)
  const threads = useMemo(() => list?.threads ?? [], [list])

  // Read when opened, and keep the newest message in view
  const last = view?.messages[view.messages.length - 1]
  const lastId = last?._id
  // A soft chime when a teammate's message lands in the open conversation (not on first load)
  const heardRef = useRef<string | null>(null)
  useEffect(() => {
    if (!last) return
    const key = `${view?.threadId}:${last._id}`
    if (heardRef.current && heardRef.current.split(':')[0] === String(view?.threadId) && heardRef.current !== key && !last.mine) {
      playSound('receive')
    }
    heardRef.current = key
  }, [last, view?.threadId])
  useEffect(() => {
    if (view?.threadId) void markRead({ threadId: view.threadId }).catch(() => undefined)
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [view?.threadId, lastId, markRead])

  if (list === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-pt-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }
  if (list === null) {
    return <p className="p-6 text-sm text-pt-muted">Team chat is for a clinic&apos;s owner and clinicians.</p>
  }

  const submit = async () => {
    const text = body.trim()
    if (!text) return
    setSending(true)
    try {
      await send({ ...args, body: text })
      playSound('send')
      setBody('')
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Couldn’t send that. Please try again.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={cn('flex h-full min-h-0 overflow-hidden', className)}>
      <aside className={cn('w-full min-w-0 flex-col border-pt-line md:flex md:w-72 md:border-r', mobileView === 'chat' ? 'hidden' : 'flex')}>
        <p className="px-4 pb-2 pt-4 text-xs font-medium text-pt-faint">Only {list.clinicName}&apos;s team sees these. Patients never do.</p>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {threads.map((thread) => {
            const key = threadKey(thread)
            const active = key === target
            return (
              <li key={thread._id}>
                <button
                  type="button"
                  onClick={() => {
                    setTarget(key)
                    setMobileView('chat')
                  }}
                  className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors', active ? 'bg-pt-sunken' : 'hover:bg-pt-hover')}
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', thread.kind === 'team' ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-ink')}>
                    {thread.kind === 'team' ? <Users className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn('truncate text-sm text-pt-ink', thread.unread ? 'font-bold' : 'font-semibold')}>{thread.title}</span>
                      {thread.lastMessageAt > 0 && (
                        <span className="shrink-0 text-[11px] text-pt-faint">{formatDistanceToNowStrict(thread.lastMessageAt)}</span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-pt-muted">
                        {thread.preview ?? (thread.kind === 'team' ? 'Say hello to the team' : 'About this patient')}
                      </span>
                      {thread.unread > 0 && (
                        <span className="min-w-[18px] shrink-0 rounded-full bg-pt-accent px-1.5 text-center text-[11px] font-bold leading-[18px] text-[#06210a]">
                          {thread.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <section className={cn('min-w-0 flex-1 flex-col md:flex', mobileView === 'chat' ? 'flex' : 'hidden')}>
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-pt-line px-3">
          <button
            type="button"
            onClick={() => setMobileView('list')}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-pt-muted hover:bg-pt-hover md:hidden"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-pt-ink">{view?.title ?? '…'}</p>
            <p className="text-xs text-pt-muted">{view?.kind === 'patient' ? 'The owner and this patient’s clinicians' : 'Everyone on the team'}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {view === undefined ? (
            <div className="flex justify-center py-10 text-pt-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : view === null ? (
            <p className="py-10 text-center text-sm text-pt-muted">You&apos;re not part of this conversation.</p>
          ) : view.messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-pt-muted">
              {view.kind === 'patient' ? 'Ask about this patient’s treatment, or hand over notes.' : 'No messages yet. Start the conversation.'}
            </p>
          ) : (
            view.messages.map((message) => (
              <div key={message._id} className={cn('flex items-end gap-2', message.mine && 'flex-row-reverse')}>
                {!message.mine && (
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={message.sender.imageUrl ?? undefined} alt="" />
                    <AvatarFallback className="bg-pt-green-bg text-[10px] font-semibold text-pt-green-fg">{initials(message.sender.name)}</AvatarFallback>
                  </Avatar>
                )}
                <div className={cn('max-w-[78%] rounded-2xl px-3.5 py-2', message.mine ? 'rounded-br-md bg-pt-primary text-pt-on-primary' : 'rounded-bl-md bg-pt-sunken text-pt-ink')}>
                  {!message.mine && (
                    <p className="mb-0.5 text-[11px] font-semibold opacity-80">
                      {message.sender.name}
                      {message.sender.subtitle ? ` · ${message.sender.subtitle}` : ''}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                  <p className="mt-0.5 text-right text-[10px] opacity-60">{format(message.createdAt, 'd MMM, HH:mm')}</p>
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        {view !== null && (
          <div className="flex items-end gap-2 border-t border-pt-line p-3">
            <Textarea
              rows={1}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
              placeholder={view?.kind === 'patient' ? 'Ask about this patient…' : 'Message the team…'}
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl"
            />
            <Button onClick={() => void submit()} disabled={sending || !body.trim()} className={cn(primaryButtonClass, 'h-11 w-11 shrink-0 rounded-2xl p-0')} aria-label="Send">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
