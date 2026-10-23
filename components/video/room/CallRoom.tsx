'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CallingState, hasScreenShare, useCall, useCallStateHooks } from '@stream-io/video-react-sdk'
import type { Channel as ChatChannel, StreamChat } from 'stream-chat'
import { Chat, Channel, MessageInput, MessageList, Window } from 'stream-chat-react'
import { Loader2, MonitorUp, Users, WifiOff, X } from '@/components/icons'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { CallBackdrop, CallBrandMark } from './CallBackdrop'
import { ControlBar } from './ControlBar'
import { RoomTile, participantName } from './RoomTile'

export type CallChat = { client: StreamChat; channel: ChatChannel }

function useElapsed() {
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(start)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const total = Math.floor((now - start) / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

function ChatPanel({ chat, onClose }: { chat: CallChat; onClose: () => void }) {
  return (
    <aside className="fixed inset-0 z-40 flex flex-col bg-white pt-[env(safe-area-inset-top)] lg:static lg:z-auto lg:w-[360px] lg:shrink-0 lg:overflow-hidden lg:rounded-[28px] lg:pt-0 lg:shadow-[0_20px_60px_-24px_rgba(0,0,0,0.2)] lg:ring-1 lg:ring-black/5">
      <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
        <h2 className="text-[15px] font-semibold tracking-tight">In-call messages</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close messages"
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <Chat client={chat.client} theme="str-chat__theme-light">
          <Channel channel={chat.channel}>
            <Window>
              <MessageList hideDeletedMessages />
              <MessageInput focus />
            </Window>
          </Channel>
        </Chat>
      </div>
    </aside>
  )
}

/**
 * The in-call screen shared by every Stream call in the app. Render it inside
 * <StreamVideo><StreamCall> after the call has been joined.
 */
export function CallRoom({
  title,
  waitingFor,
  onLeft,
  onEndForAll,
  chat,
}: {
  /** Heading, e.g. "Appointment with David Falola". Defaults to the other participants' names. */
  title?: string
  /** Name shown while you are alone, e.g. "Waiting for David Falola to join". */
  waitingFor?: string
  /** Runs once, after you leave or the call is ended for everyone. */
  onLeft: () => void
  /** Hosts only: ends the call for every participant. */
  onEndForAll?: () => void
  chat?: CallChat | null
}) {
  const call = useCall()
  const { useCallCallingState, useParticipants, useLocalParticipant, useRemoteParticipants, useMicrophoneState } = useCallStateHooks()
  const callingState = useCallCallingState()
  const participants = useParticipants()
  const local = useLocalParticipant()
  const remotes = useRemoteParticipants()
  const { isSpeakingWhileMuted } = useMicrophoneState()
  const elapsed = useElapsed()

  const [swapped, setSwapped] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatUnread, setChatUnread] = useState(false)
  const chatOpenRef = useRef(chatOpen)
  useEffect(() => {
    chatOpenRef.current = chatOpen
  }, [chatOpen])

  const finishedRef = useRef(false)
  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    onLeft()
  }, [onLeft])

  useEffect(() => {
    if (callingState === CallingState.LEFT) finish()
  }, [callingState, finish])

  useEffect(() => {
    if (!call) return
    const offEnded = call.on('call.ended', () => {
      toast.info('The call has ended')
      finish()
    })
    const offJoined = call.on('call.session_participant_joined', (event) => {
      if (event.participant.user.id !== call.currentUserId) toast(`${event.participant.user.name || 'Someone'} joined`)
    })
    const offLeft = call.on('call.session_participant_left', (event) => {
      if (event.participant.user.id !== call.currentUserId) toast(`${event.participant.user.name || 'Someone'} left`)
    })
    return () => {
      offEnded()
      offJoined()
      offLeft()
    }
  }, [call, finish])

  useEffect(() => {
    if (!chat) return
    const subscription = chat.channel.on('message.new', (event) => {
      if (event.user?.id !== chat.client.userID && !chatOpenRef.current) setChatUnread(true)
    })
    return () => subscription.unsubscribe()
  }, [chat])

  const leave = async () => {
    try {
      await call?.leave()
    } catch {
      // Already left; fall through.
    }
    finish()
  }

  const toggleChat = () => {
    setChatOpen((open) => !open)
    setChatUnread(false)
  }

  const presenter = participants.find((p) => hasScreenShare(p))
  const other = remotes[0]
  const heading = title || (remotes.length ? `With ${remotes.map(participantName).join(', ')}` : 'Waiting for others')
  const reconnecting = callingState === CallingState.RECONNECTING || callingState === CallingState.MIGRATING
  const disconnected = callingState === CallingState.OFFLINE || callingState === CallingState.RECONNECTING_FAILED

  let stage: React.ReactNode = null
  if (presenter) {
    stage = (
      <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
        {presenter.isLocalParticipant ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-[28px] bg-white/80 p-6 text-center shadow-[0_20px_60px_-24px_rgba(0,0,0,0.2)] ring-1 ring-black/5 backdrop-blur">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand">
              <MonitorUp className="h-6 w-6" />
            </span>
            <p className="text-lg font-semibold tracking-tight">You&apos;re presenting to everyone</p>
            <button
              type="button"
              onClick={() => void call?.screenShare.disable()}
              className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
            >
              Stop presenting
            </button>
          </div>
        ) : (
          <RoomTile participant={presenter} trackType="screenShareTrack" className="min-h-0 flex-1 bg-white" />
        )}
        <div className="flex shrink-0 gap-3 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-y-auto">
          {participants.map((p) => (
            <RoomTile key={p.sessionId} participant={p} compact className="aspect-video h-24 shrink-0 lg:h-auto lg:w-full" />
          ))}
        </div>
      </div>
    )
  } else if (remotes.length <= 1) {
    const main = other && !swapped ? other : local
    const inset = other ? (swapped ? other : local) : undefined
    stage = (
      <div className="relative h-full">
        {main && <RoomTile participant={main} className="h-full w-full shadow-[0_24px_70px_-28px_rgba(0,0,0,0.35)]" />}
        {!other && (
          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
            <p className="flex items-center gap-2 rounded-full bg-white/85 px-4 py-2 text-[13px] font-medium text-neutral-700 shadow-sm ring-1 ring-black/5 backdrop-blur-xl">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
              {waitingFor ? `Waiting for ${waitingFor} to join` : "You're the only one here"}
            </p>
          </div>
        )}
        {inset && (
          <RoomTile
            participant={inset}
            compact
            onClick={() => setSwapped((value) => !value)}
            className="absolute right-3 top-3 aspect-[3/4] w-[30%] min-w-[96px] max-w-[160px] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.35)] ring-2 ring-white sm:bottom-4 sm:right-4 sm:top-auto sm:aspect-video sm:w-[24%] sm:max-w-[280px]"
          />
        )}
      </div>
    )
  } else {
    stage = (
      <div
        className={cn(
          'grid h-full auto-rows-fr gap-3',
          participants.length > 3 ? 'grid-cols-2' : 'grid-cols-1',
          participants.length > 4 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
        )}
      >
        {participants.map((p) => (
          <RoomTile key={p.sessionId} participant={p} className="min-h-0" />
        ))}
      </div>
    )
  }

  return (
    <CallBackdrop>
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <CallBrandMark className="hidden h-5 sm:block" />
          <span aria-hidden className="hidden h-5 w-px bg-black/10 sm:block" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold tracking-tight">{heading}</p>
            <p className="text-xs tabular-nums text-neutral-500">{elapsed}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {reconnecting && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reconnecting
            </span>
          )}
          <span className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-neutral-600 ring-1 ring-black/5 backdrop-blur">
            <Users className="h-3.5 w-3.5" /> {participants.length}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 px-3 sm:px-6">
        <main className="relative min-h-0 min-w-0 flex-1">
          {stage}
          {disconnected && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[28px] bg-white/70 p-4 backdrop-blur-md">
              <div className="max-w-xs text-center">
                <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
                  <WifiOff className="h-5 w-5" />
                </span>
                <p className="font-semibold tracking-tight">You&apos;re offline</p>
                <p className="mt-1 text-sm text-neutral-500">We&apos;ll reconnect you as soon as your internet is back.</p>
              </div>
            </div>
          )}
        </main>
        {chat && chatOpen && <ChatPanel chat={chat} onClose={toggleChat} />}
      </div>

      <footer className="pointer-events-none relative flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:pb-5 sm:pt-4">
        {isSpeakingWhileMuted && (
          <p className="absolute bottom-full mb-1 rounded-full bg-neutral-900/85 px-4 py-2 text-[13px] font-medium text-white shadow-lg backdrop-blur">
            You&apos;re muted. Tap the mic to talk.
          </p>
        )}
        <ControlBar
          onLeave={() => void leave()}
          onEndForAll={onEndForAll}
          onToggleChat={chat ? toggleChat : undefined}
          chatOpen={chatOpen}
          chatUnread={chatUnread}
        />
      </footer>
    </CallBackdrop>
  )
}
