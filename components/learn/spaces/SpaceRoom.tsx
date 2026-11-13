'use client'

/**
 * A Rehabify Space, like an X Space: the host and speakers on stage, listeners below, hands up to
 * ask to speak, emoji reactions, and avatars that breathe with each speaker's voice.
 *
 * Audio: Stream "audio_room" call. Speakers' mics ask for 48 kHz mono with echo cancellation,
 * noise suppression and auto gain (crisp, steady speech); the room itself uses Opus with RED and
 * DTX (learnSpacesNode.ts). Who's on stage is in Convex, so it updates for everyone instantly.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useAction, useMutation, useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import {
  CallingState,
  hasAudio,
  OwnCapability,
  ParticipantsAudio,
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  useCall,
  useCallStateHooks,
  type StreamVideoParticipant,
} from '@stream-io/video-react-sdk'
import {
  ArrowLeft,
  Bell,
  BellRing,
  CalendarClock,
  Check,
  Hand,
  Headphones,
  Link2,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  Radio,
  Smile,
  Users,
  X,
} from '@/components/icons'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import type { Id } from '@/convex/_generated/dataModel'
import { displayFont, pillInk, pillLime, pillOutline } from '../shared'
import { TagBadge } from '../platform/identity'
import { errorText, relativeTime, SPACES_PATH, spacePath, spacesApi, type SpacePage, type StageSeat } from '../social/socialApi'
import { Avatar, JoinPrompt, Sheet, Skeleton } from '../social/ui'
import { LiveEq, spaceWhen } from './SpacesHome'
import { useVoiceMeter, wakeVoiceMeters } from './voiceMeter'

type StreamCallHandle = ReturnType<StreamVideoClient['call']>

function withoutKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record }
  delete next[key]
  return next
}
type Role = 'host' | 'speaker' | 'listener'

/** Mic settings for clear speech: mono at Opus's native 48 kHz, cleaned up by the browser. */
const CRISP_MIC: MediaTrackConstraints = {
  channelCount: 1,
  sampleRate: 48000,
  sampleSize: 16,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

const REACTIONS = [
  { code: ':green-heart:', emoji: '💚' },
  { code: ':clap:', emoji: '👏' },
  { code: ':100:', emoji: '💯' },
  { code: ':joy:', emoji: '😂' },
  { code: ':fire:', emoji: '🔥' },
  { code: ':raised-hands:', emoji: '🙌' },
]
const emojiFor = (code?: string, custom?: Record<string, unknown>) =>
  (typeof custom?.emoji === 'string' && custom.emoji) || REACTIONS.find((r) => r.code === code)?.emoji || '💚'

// ── Avatar tile ───────────────────────────────────────────────────────────────

function Tile({
  name,
  imageUrl,
  role,
  muted,
  hand,
  stream,
  level,
  size,
  reaction,
  isYou,
  onClick,
}: {
  name: string
  imageUrl?: string | null
  role: Role
  muted: boolean
  hand: boolean
  stream?: MediaStream
  level: number
  size: number
  reaction?: { key: string; emoji: string } | null
  isYou: boolean
  onClick?: () => void
}) {
  const onStage = role !== 'listener'
  const ref = useVoiceMeter<HTMLButtonElement>(onStage ? stream : undefined, onStage ? level : 0, muted || !onStage)
  const reduce = useReducedMotion()
  const label = isYou ? 'You' : name.split(' ')[0] || name

  return (
    <motion.button
      ref={ref}
      type="button"
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${name}, ${role === 'host' ? 'host' : role === 'speaker' ? 'speaker' : 'listener'}${onStage ? (muted ? ', muted' : '') : ''}${hand ? ', hand raised' : ''}`}
      className="space-voice group flex w-full min-w-0 flex-col items-center text-center focus-visible:outline-none disabled:cursor-default"
    >
      <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        {onStage && (
          <>
            <span className="space-ring-outer pointer-events-none absolute -inset-[9px] rounded-full bg-rh-lime/25" />
            <span className="space-ring-inner pointer-events-none absolute -inset-[4px] rounded-full border-[2.5px] border-rh-lime" />
          </>
        )}
        <span className="space-avatar relative block rounded-full transition-[filter] group-focus-visible:ring-2 group-focus-visible:ring-white" style={{ width: size, height: size }}>
          <Avatar name={name} imageUrl={imageUrl} size={size} className="bg-white/10 text-white" />
        </span>

        {/* Muted: a small mic-off badge that pops in */}
        <AnimatePresence>
          {onStage && muted && (
            <motion.span
              key="muted"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 600, damping: 22 }}
              className="absolute -bottom-0.5 -right-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white text-rh-ink shadow ring-[2.5px] ring-rh-ink"
            >
              <MicOff className="h-[11px] w-[11px]" />
            </motion.span>
          )}
        </AnimatePresence>

        {/* Hand raised: waves gently until the host responds */}
        <AnimatePresence>
          {hand && (
            <motion.span
              key="hand"
              initial={{ scale: 0, rotate: -30 }}
              animate={reduce ? { scale: 1, rotate: 0 } : { scale: 1, rotate: [0, -14, 10, -8, 0] }}
              exit={{ scale: 0 }}
              transition={reduce ? { duration: 0.2 } : { rotate: { duration: 1.4, repeat: Infinity, repeatDelay: 1.2 }, scale: { type: 'spring', stiffness: 500, damping: 18 } }}
              className="absolute -right-1 -top-1 flex h-7 w-7 origin-bottom items-center justify-center rounded-full bg-rh-lime text-[15px] shadow ring-[2.5px] ring-rh-ink"
              aria-hidden
            >
              ✋
            </motion.span>
          )}
        </AnimatePresence>

        {/* Reactions float up from the avatar */}
        <AnimatePresence>
          {reaction && (
            <motion.span
              key={reaction.key}
              initial={{ y: 0, scale: 0.4, opacity: 0 }}
              animate={{ y: -size * 0.75, scale: 1.25, opacity: [0, 1, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 text-[28px]"
              aria-hidden
            >
              {reaction.emoji}
            </motion.span>
          )}
        </AnimatePresence>
      </span>

      <span className="mt-2.5 block w-full truncate px-1 text-[13px] font-semibold text-white">{label}</span>
      <span className="mt-0.5 flex h-4 items-center justify-center gap-1.5 text-[11px] font-medium text-white/50">
        {role === 'host' ? (
          <span className="text-rh-lime">Host</span>
        ) : role === 'speaker' ? (
          <span>Speaker</span>
        ) : (
          <span>Listener</span>
        )}
        {onStage && !muted && <span className="space-eq h-3 text-rh-lime" aria-hidden><span /><span /><span /><span /></span>}
      </span>
    </motion.button>
  )
}

// ── Live room (inside StreamCall) ─────────────────────────────────────────────

type Person = {
  participant: StreamVideoParticipant
  role: Role
  seat?: StageSeat
  hand: boolean
}

function Timer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const s = Math.max(0, Math.floor((now - since) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return <span className="tabular-nums">{h > 0 ? `${h}:${String(m).padStart(2, '0')}` : m}:{String(sec).padStart(2, '0')}</span>
}

function LiveRoom({ page, joinedAs, onLeft }: { page: SpacePage; joinedAs: { isHost: boolean; canModerate: boolean }; onLeft: (ended: boolean) => void }) {
  const call = useCall()!
  const { useParticipants, useCallCallingState, useHasPermissions, useMicrophoneState, useParticipantCount } = useCallStateHooks()
  const participants = useParticipants()
  const callingState = useCallCallingState()
  const canSendAudio = useHasPermissions(OwnCapability.SEND_AUDIO)
  const canReact = useHasPermissions(OwnCapability.CREATE_REACTION)
  const { isMute } = useMicrophoneState()
  const participantCount = useParticipantCount()
  const stage = useQuery(spacesApi.stage, { spaceId: page.space.id })
  const setHand = useMutation(spacesApi.setHand)
  const leaveStage = useMutation(spacesApi.leaveStage)
  const setSpeaker = useAction(spacesApi.setSpeaker)
  const endSpace = useAction(spacesApi.end)
  const [requestsOpen, setRequestsOpen] = useState(false)
  const [reactionsOpen, setReactionsOpen] = useState(false)
  const [manage, setManage] = useState<Person | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reactions, setReactions] = useState<Record<string, { key: string; emoji: string }>>({})

  const me = page.viewer
  const hostStreamId = page.space.host.streamUserId
  const seatsByStream = useMemo(() => new Map((stage ?? []).map((s) => [s.streamUserId, s])), [stage])
  const mySeat = me.streamUserId ? seatsByStream.get(me.streamUserId) : undefined
  const amSpeaker = joinedAs.isHost || mySeat?.state === 'speaker'
  const myHand = mySeat?.state === 'hand'

  // Everyone present, once each, sorted: host, speakers (in the order they came up), listeners
  const people = useMemo(() => {
    const seen = new Set<string>()
    const list: Person[] = []
    for (const p of participants) {
      if (seen.has(p.userId)) continue
      seen.add(p.userId)
      const seat = seatsByStream.get(p.userId)
      const role: Role = p.userId === hostStreamId ? 'host' : seat?.state === 'speaker' ? 'speaker' : 'listener'
      list.push({ participant: p, role, seat, hand: seat?.state === 'hand' })
    }
    const rank = { host: 0, speaker: 1, listener: 2 }
    return list.sort((a, b) => rank[a.role] - rank[b.role] || (a.seat?.since ?? 0) - (b.seat?.since ?? 0))
  }, [participants, seatsByStream, hostStreamId])
  const onStage = people.filter((p) => p.role !== 'listener')
  const listeners = people.filter((p) => p.role === 'listener')
  const hands = people.filter((p) => p.hand)

  // Reactions: show each one over the sender's avatar, then clear it so the next one shows too
  useEffect(() => {
    for (const p of participants) {
      if (!p.reaction) continue
      if (p.isLocalParticipant) {
        // Already shown the moment it was tapped
        call.resetReaction(p.sessionId)
        continue
      }
      const key = `${p.sessionId}:${p.reaction.emoji_code}:${Date.now()}`
      const emoji = emojiFor(p.reaction.emoji_code, p.reaction.custom as Record<string, unknown> | undefined)
      setReactions((r) => ({ ...r, [p.userId]: { key, emoji } }))
      call.resetReaction(p.sessionId)
      window.setTimeout(() => setReactions((r) => (r[p.userId]?.key === key ? withoutKey(r, p.userId) : r)), 1900)
    }
  }, [participants, call])

  // Brought up to speak, or back down
  const wasSpeaker = useRef(amSpeaker)
  useEffect(() => {
    if (amSpeaker && !wasSpeaker.current) {
      playSound('approve')
      toast.success('You’re a speaker now. Unmute when you’re ready.')
    }
    if (!amSpeaker && wasSpeaker.current) {
      void call.microphone.disable().catch(() => undefined)
      toast('You’re listening again')
    }
    wasSpeaker.current = amSpeaker
  }, [amSpeaker, call])

  // A new hand for the host: a soft sound
  const handCount = useRef(0)
  useEffect(() => {
    if (joinedAs.canModerate && hands.length > handCount.current) playSound('receive')
    handCount.current = hands.length
  }, [hands.length, joinedAs.canModerate])

  // The Space ended (host ended it, or Stream closed the room)
  useEffect(() => {
    if (callingState === CallingState.LEFT) onLeft(true)
  }, [callingState, onLeft])
  useEffect(() => {
    if (page.space.status === 'ended') onLeft(true)
  }, [page.space.status, onLeft])

  const toggleMic = async () => {
    try {
      await call.microphone.toggle()
    } catch {
      toast.error('Couldn’t use your microphone. Check the browser’s permission.')
    }
  }

  const raiseHand = async () => {
    try {
      await setHand({ spaceId: page.space.id, raised: !myHand })
      if (!myHand) {
        playSound('vote')
        toast.success('Hand raised. The host will see it.')
      }
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t raise your hand.'))
    }
  }

  const sendReaction = async (r: (typeof REACTIONS)[number]) => {
    setReactionsOpen(false)
    if (me.streamUserId) setReactions((s) => ({ ...s, [me.streamUserId!]: { key: `me:${Date.now()}`, emoji: r.emoji } }))
    try {
      await call.sendReaction({ type: 'reaction', emoji_code: r.code, custom: { emoji: r.emoji } })
    } catch {
      // Reactions are a nicety
    }
  }

  const moveTo = async (person: Person, speaker: boolean) => {
    const target = person.seat?.id ?? null
    setManage(null)
    if (!target) {
      toast('Ask them to raise their hand first, then bring them up.')
      return
    }
    setBusy(String(target))
    try {
      await setSpeaker({ spaceId: page.space.id, userId: target as Id<'users'>, speaker })
      if (speaker) playSound('approve')
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t update the stage.'))
    } finally {
      setBusy(null)
    }
  }

  const stepDown = async () => {
    setManage(null)
    try {
      await call.microphone.disable()
      await leaveStage({ spaceId: page.space.id })
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t leave the stage.'))
    }
  }

  const leave = async () => {
    if (joinedAs.isHost) {
      if (!window.confirm('End this Space for everyone?')) return
      setBusy('end')
      try {
        await endSpace({ spaceId: page.space.id })
      } catch (err) {
        toast.error(errorText(err, 'Couldn’t end the Space.'))
        setBusy(null)
        return
      }
      onLeft(true)
      return
    }
    if (mySeat) void leaveStage({ spaceId: page.space.id }).catch(() => undefined)
    onLeft(false)
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Link copied')
    } catch {
      toast('Copy the link from the address bar')
    }
  }

  const tileProps = (person: Person, size: number) => {
    const p = person.participant
    return {
      name: p.name || 'Rehabify member',
      imageUrl: p.image,
      role: person.role,
      muted: !hasAudio(p),
      hand: person.hand,
      stream: p.audioStream,
      level: p.audioLevel ?? 0,
      size,
      reaction: reactions[p.userId] ?? null,
      isYou: Boolean(p.isLocalParticipant),
      onClick:
        joinedAs.canModerate && person.role !== 'host' && !p.isLocalParticipant
          ? () => setManage(person)
          : p.isLocalParticipant && person.role === 'speaker'
            ? () => setManage(person)
            : undefined,
    }
  }

  const remote = participants.filter((p) => !p.isLocalParticipant)
  const shownListeners = listeners.slice(0, 48)

  return (
    <>
      <ParticipantsAudio participants={remote} />

      {/* Top bar */}
      <div className="flex items-center gap-2 px-5 pt-5 sm:px-7 sm:pt-6">
        <span className="inline-flex items-center gap-2 rounded-full bg-rh-lime px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-rh-ink">
          <LiveEq className="text-rh-ink" /> Live
        </span>
        {page.space.startedAt && (
          <span className="text-xs font-semibold text-white/55">
            <Timer since={page.space.startedAt} />
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white/80">
          <Users className="h-3.5 w-3.5" /> {participantCount}
        </span>
        <button type="button" onClick={() => void copyLink()} aria-label="Copy link" className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white">
          <Link2 className="h-4 w-4" />
        </button>
      </div>

      {/* Title */}
      <div className="px-5 pt-5 sm:px-7">
        <h1 className={cn('text-[26px] leading-tight tracking-tight text-white sm:text-[32px]', displayFont)}>{page.space.title}</h1>
        {page.space.description && <p className="mt-2 text-sm leading-6 text-white/55">{page.space.description}</p>}
      </div>

      {/* Stage */}
      <div className="flex-1 px-5 pb-6 pt-8 sm:px-7">
        <ul className="grid grid-cols-3 gap-x-3 gap-y-7 min-[420px]:grid-cols-4 sm:grid-cols-5">
          <AnimatePresence mode="popLayout">
            {onStage.map((person) => (
              <li key={person.participant.userId} className="min-w-0">
                <Tile {...tileProps(person, 68)} />
              </li>
            ))}
          </AnimatePresence>
        </ul>
        {onStage.length === 0 && <p className="text-sm text-white/45">The host will be back in a moment.</p>}

        {listeners.length > 0 && (
          <>
            <p className="mb-5 mt-9 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
              <Headphones className="h-3.5 w-3.5" /> Listening · {listeners.length}
            </p>
            <ul className="grid grid-cols-4 gap-x-3 gap-y-6 min-[420px]:grid-cols-5 sm:grid-cols-6">
              <AnimatePresence mode="popLayout">
                {shownListeners.map((person) => (
                  <li key={person.participant.userId} className="min-w-0">
                    <Tile {...tileProps(person, 50)} />
                  </li>
                ))}
              </AnimatePresence>
            </ul>
            {listeners.length > shownListeners.length && <p className="mt-5 text-xs text-white/45">and {listeners.length - shownListeners.length} more listening</p>}
          </>
        )}
      </div>

      {/* Controls */}
      <div className="sticky bottom-0 z-10 border-t border-white/[0.08] bg-rh-ink/95 px-4 py-3.5 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          {amSpeaker ? (
            <motion.button
              type="button"
              onClick={() => void toggleMic()}
              disabled={!canSendAudio}
              whileTap={{ scale: 0.92 }}
              aria-pressed={!isMute}
              aria-label={isMute ? 'Unmute' : 'Mute'}
              className={cn(
                'flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-colors duration-200 disabled:opacity-40',
                isMute ? 'bg-white/[0.1] text-white hover:bg-white/[0.16]' : 'bg-rh-lime text-rh-ink'
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={isMute ? 'off' : 'on'}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex"
                >
                  {isMute ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={() => void raiseHand()}
              whileTap={{ scale: 0.94 }}
              aria-pressed={myHand}
              className={cn(
                'inline-flex h-12 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors',
                myHand ? 'bg-rh-lime text-rh-ink' : 'bg-white/[0.1] text-white hover:bg-white/[0.16]'
              )}
            >
              <Hand className="h-4 w-4" />
              {myHand ? 'Hand raised' : 'Ask to speak'}
            </motion.button>
          )}

          {amSpeaker && <span className="hidden text-xs text-white/50 sm:block">{!canSendAudio ? 'Connecting your mic…' : isMute ? 'You’re muted' : 'You’re live'}</span>}

          <div className="relative ml-auto flex items-center gap-1.5">
            {joinedAs.canModerate && (
              <button
                type="button"
                onClick={() => setRequestsOpen(true)}
                className="relative inline-flex h-11 items-center gap-2 rounded-full bg-white/[0.08] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.14]"
              >
                <Hand className="h-4 w-4" /> <span className="hidden sm:inline">Requests</span>
                <AnimatePresence>
                  {hands.length > 0 && (
                    <motion.span
                      key={hands.length}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rh-lime px-1.5 text-[11px] font-bold text-rh-ink"
                    >
                      {hands.length}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            )}
            {canReact && (
              <button
                type="button"
                onClick={() => setReactionsOpen((o) => !o)}
                aria-label="React"
                aria-expanded={reactionsOpen}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.08] text-white transition hover:bg-white/[0.14]"
              >
                <Smile className="h-[18px] w-[18px]" />
              </button>
            )}
            <AnimatePresence>
              {reactionsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                  className="absolute bottom-14 right-0 flex gap-1 rounded-full bg-white p-1.5 shadow-2xl"
                >
                  {REACTIONS.map((r, i) => (
                    <motion.button
                      key={r.code}
                      type="button"
                      onClick={() => void sendReaction(r)}
                      initial={{ y: 6, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      whileHover={{ scale: 1.25, y: -3 }}
                      whileTap={{ scale: 0.9 }}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-[22px]"
                      aria-label={`React ${r.emoji}`}
                    >
                      {r.emoji}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={() => void leave()}
              disabled={busy === 'end'}
              className={cn(
                'inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition',
                joinedAs.isHost ? 'bg-rose-500 text-white hover:bg-rose-600' : 'text-rose-300 hover:bg-white/[0.08]'
              )}
            >
              {busy === 'end' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              {joinedAs.isHost ? 'End' : 'Leave'}
            </button>
          </div>
        </div>
      </div>

      {/* Host: hands up */}
      <Sheet open={requestsOpen} onClose={() => setRequestsOpen(false)} title={hands.length ? `Asking to speak (${hands.length})` : 'Asking to speak'}>
        {hands.length === 0 ? (
          <p className="py-6 text-center text-sm text-rh-ink/55">No hands up right now. Listeners tap “Ask to speak” to join you on stage.</p>
        ) : (
          <ul className="divide-y divide-rh-ink/[0.07]">
            {hands.map((person) => (
              <li key={person.participant.userId} className="flex items-center gap-3 py-3">
                <Avatar name={person.participant.name || 'Member'} imageUrl={person.participant.image} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-rh-ink">{person.participant.name || 'Member'}</p>
                  {person.seat?.tag && <TagBadge tag={person.seat.tag} size="xs" className="mt-1" />}
                </div>
                <button
                  type="button"
                  onClick={() => void moveTo(person, true)}
                  disabled={busy === String(person.seat?.id)}
                  className={cn(pillInk, 'h-9 px-4 text-xs')}
                >
                  {busy === String(person.seat?.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />} Bring up
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      {/* Host: one person; a speaker: themselves */}
      <Sheet open={Boolean(manage)} onClose={() => setManage(null)} title={manage?.participant.isLocalParticipant ? 'You’re on stage' : manage?.participant.name || 'Member'}>
        {manage && (
          <div className="space-y-2 pb-1 pt-2">
            {manage.participant.isLocalParticipant ? (
              <button type="button" onClick={() => void stepDown()} className={cn(pillOutline, 'h-12 w-full')}>
                <Headphones className="h-4 w-4" /> Go back to listening
              </button>
            ) : manage.role === 'speaker' ? (
              <button type="button" onClick={() => void moveTo(manage, false)} className={cn(pillOutline, 'h-12 w-full')}>
                <Headphones className="h-4 w-4" /> Move to listeners
              </button>
            ) : manage.hand ? (
              <button type="button" onClick={() => void moveTo(manage, true)} className={cn(pillInk, 'h-12 w-full')}>
                <Mic className="h-4 w-4" /> Bring up to speak
              </button>
            ) : (
              <p className="py-2 text-sm leading-6 text-rh-ink/60">To bring a listener up, ask them to tap “Ask to speak”. Their hand shows in Requests.</p>
            )}
          </div>
        )}
      </Sheet>
    </>
  )
}

// ── Page: lobby, live room, ended ─────────────────────────────────────────────

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-3 pb-16 pt-4 sm:px-6 sm:pt-8">
      <Link href={SPACES_PATH} className="mb-4 inline-flex items-center gap-1.5 px-1 text-sm font-semibold text-rh-ink/60 transition hover:text-rh-ink">
        <ArrowLeft className="h-4 w-4" /> Spaces
      </Link>
      <div className="relative flex min-h-[72dvh] flex-col overflow-hidden rounded-[32px] bg-rh-ink text-white shadow-[0_30px_80px_-40px_rgba(5,12,11,0.7)]">{children}</div>
    </main>
  )
}

/** Mic check before a host goes live. */
function MicCheck() {
  const [stream, setStream] = useState<MediaStream | undefined>()
  const [denied, setDenied] = useState(false)
  useEffect(() => {
    let live: MediaStream | null = null
    let cancelled = false
    navigator.mediaDevices
      ?.getUserMedia({ audio: CRISP_MIC })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        live = s
        setStream(s)
      })
      .catch(() => setDenied(true))
    return () => {
      cancelled = true
      live?.getTracks().forEach((t) => t.stop())
    }
  }, [])
  const ref = useVoiceMeter<HTMLDivElement>(stream, 0, false)
  return (
    <div ref={ref} className="space-voice mt-8 flex items-center gap-4 rounded-2xl bg-white/[0.06] p-4">
      <span className="relative flex h-11 w-11 items-center justify-center">
        <span className="space-ring-outer absolute -inset-[6px] rounded-full bg-rh-lime/25" />
        <span className="space-ring-inner absolute -inset-[3px] rounded-full border-2 border-rh-lime" />
        <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
          {denied ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{denied ? 'Microphone blocked' : stream ? 'Say something to test your mic' : 'Checking your microphone…'}</p>
        <p className="text-xs text-white/50">{denied ? 'Allow the microphone in your browser’s site settings, then reload.' : 'Headphones and a quiet room sound best.'}</p>
      </div>
      {!denied && (
        <span className="space-eq h-4 text-rh-lime" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </span>
      )}
    </div>
  )
}

type Session = { client: StreamVideoClient; call: StreamCallHandle; isHost: boolean; canModerate: boolean }

export function SpaceRoom({ spaceId }: { spaceId: string }) {
  const page = useQuery(spacesApi.get, { spaceId })
  const join = useAction(spacesApi.join)
  const start = useAction(spacesApi.start)
  const cancel = useMutation(spacesApi.cancel)
  const toggleReminder = useMutation(spacesApi.toggleReminder)
  const [session, setSession] = useState<Session | null>(null)
  const [joining, setJoining] = useState<'listen' | 'start' | null>(null)
  const [left, setLeft] = useState<'left' | 'ended' | null>(null)
  const sessionRef = useRef<Session | null>(null)
  sessionRef.current = session

  const disconnect = useCallback(async () => {
    const s = sessionRef.current
    if (!s) return
    sessionRef.current = null
    setSession(null)
    try {
      await s.call.leave()
    } catch {
      // already left
    }
    try {
      await s.client.disconnectUser()
    } catch {
      // ignore
    }
  }, [])

  // Leaving the page leaves the Space
  useEffect(() => () => void disconnect(), [disconnect])

  const onLeft = useCallback(
    (ended: boolean) => {
      void disconnect()
      // A voluntary leave also ends Stream's side; keep "You left" rather than "Ended"
      setLeft((prev) => prev ?? (ended ? 'ended' : 'left'))
      playSound(ended ? 'reject' : 'send')
    },
    [disconnect]
  )

  const enter = async (mode: 'listen' | 'start') => {
    if (!page) return
    wakeVoiceMeters()
    setJoining(mode)
    try {
      if (mode === 'start') await start({ spaceId })
      const res = await join({ spaceId })
      const client = new StreamVideoClient({
        apiKey: res.apiKey,
        user: { id: res.streamUserId, name: page.viewer.name ?? undefined, image: page.viewer.imageUrl ?? undefined },
        token: res.token,
      })
      const call = client.call(res.callType, res.callId)
      call.microphone.setDefaultConstraints(CRISP_MIC)
      // Listeners never open the mic, speakers rejoin muted, the host starts unmuted
      if (!res.isHost) await call.microphone.disable()
      await call.join()
      if (res.isHost) await call.microphone.enable().catch(() => toast.error('Allow the microphone so listeners can hear you.'))
      setLeft(null)
      setSession({ client, call, isHost: res.isHost, canModerate: res.canModerate })
      playSound(mode === 'start' ? 'booked' : 'receive')
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Couldn’t join the Space. Check your connection and try again.'))
    } finally {
      setJoining(null)
    }
  }

  if (page === undefined) {
    return (
      <Shell>
        <div className="p-7">
          <Skeleton className="h-6 w-24 bg-white/10" />
          <Skeleton className="mt-6 h-10 w-3/4 bg-white/10" />
          <div className="mt-10 flex gap-6">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-16 rounded-full bg-white/10" />
            ))}
          </div>
        </div>
      </Shell>
    )
  }
  if (page === null) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <Radio className="h-6 w-6 text-white/50" />
          <p className="mt-4 text-lg font-semibold">This Space doesn’t exist</p>
          <Link href={SPACES_PATH} className={cn(pillLime, 'mt-6 h-11 px-6')}>
            See all Spaces
          </Link>
        </div>
      </Shell>
    )
  }

  const { space, viewer } = page

  if (session) {
    return (
      <Shell>
        <StreamVideo client={session.client}>
          <StreamCall call={session.call}>
            <LiveRoom page={page} joinedAs={{ isHost: session.isHost, canModerate: session.canModerate }} onLeft={onLeft} />
          </StreamCall>
        </StreamVideo>
      </Shell>
    )
  }

  const hostLine = (
    <div className="mt-6 flex items-center gap-3">
      <Avatar name={space.host.name} imageUrl={space.host.imageUrl} size={44} className="bg-white/10 text-white ring-2 ring-rh-lime ring-offset-2 ring-offset-rh-ink" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{space.host.name}</p>
        <p className="text-xs text-white/50">Host</p>
      </div>
    </div>
  )

  // Ended, cancelled, or this person left
  if (space.status === 'ended' || space.status === 'cancelled' || left) {
    const over = space.status === 'ended' || space.status === 'cancelled' || left === 'ended'
    return (
      <Shell>
        <div className="flex flex-1 flex-col justify-center p-7 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
            {space.status === 'cancelled' ? 'Cancelled' : over ? 'Ended' : 'You left'}
          </p>
          <h1 className={cn('mt-3 text-[28px] leading-tight tracking-tight sm:text-[34px]', displayFont)}>{space.title}</h1>
          {hostLine}
          {over && space.startedAt && space.endedAt && (
            <p className="mt-6 text-sm text-white/55">
              Ran for {Math.max(1, Math.round((space.endedAt - space.startedAt) / 60000))} min
              {space.peakListeners > 1 ? ` · ${space.peakListeners} people at its peak` : ''}
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-2">
            {!over && space.status === 'live' && (
              <button type="button" onClick={() => void enter('listen')} disabled={Boolean(joining)} className={cn(pillLime, 'h-12 px-6')}>
                {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Headphones className="h-4 w-4" />} Rejoin
              </button>
            )}
            <Link href={SPACES_PATH} className={cn('inline-flex h-12 items-center rounded-full border border-white/20 px-6 text-sm font-semibold text-white transition hover:bg-white/10')}>
              More Spaces
            </Link>
          </div>
        </div>
      </Shell>
    )
  }

  // Not a member yet
  if (!viewer.member) {
    return (
      <Shell>
        <div className="p-7 sm:p-10">
          {space.status === 'live' && (
            <span className="inline-flex items-center gap-2 rounded-full bg-rh-lime px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-rh-ink">
              <LiveEq className="text-rh-ink" /> Live
            </span>
          )}
          <h1 className={cn('mt-5 text-[28px] leading-tight tracking-tight sm:text-[34px]', displayFont)}>{space.title}</h1>
          {hostLine}
        </div>
        <div className="mt-auto bg-white p-4 sm:p-6">
          <JoinPrompt signedIn={viewer.signedIn} returnTo={spacePath(space.id)} />
        </div>
      </Shell>
    )
  }

  // Scheduled
  if (space.status === 'scheduled') {
    const due = !space.scheduledFor || space.scheduledFor <= Date.now() + 15 * 60 * 1000
    return (
      <Shell>
        <div className="flex flex-1 flex-col p-7 sm:p-10">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white/80">
            <CalendarClock className="h-3.5 w-3.5" /> {spaceWhen(space)}
          </span>
          <h1 className={cn('mt-5 text-[28px] leading-tight tracking-tight sm:text-[36px]', displayFont)}>{space.title}</h1>
          {space.description && <p className="mt-2 text-[15px] leading-6 text-white/60">{space.description}</p>}
          {hostLine}

          {space.isHost ? (
            <>
              <MicCheck />
              <div className="mt-auto flex flex-wrap gap-2 pt-10">
                <button type="button" onClick={() => void enter('start')} disabled={Boolean(joining)} className={cn(pillLime, 'h-12 px-7')}>
                  {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                  {due ? 'Start your Space' : 'Start now'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('Cancel this Space?')) return
                    try {
                      await cancel({ spaceId: space.id })
                      toast('Space cancelled')
                    } catch (err) {
                      toast.error(errorText(err, 'Couldn’t cancel.'))
                    }
                  }}
                  className="inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" /> Cancel Space
                </button>
              </div>
              {space.reminderCount > 0 && <p className="mt-4 text-xs text-white/50">{space.reminderCount} people will be told when you go live.</p>}
            </>
          ) : (
            <div className="mt-auto pt-10">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await toggleReminder({ spaceId: space.id })
                    if (res.reminded) {
                      playSound('success')
                      toast.success('We’ll let you know when it starts')
                    }
                  } catch (err) {
                    toast.error(errorText(err, 'Couldn’t set the reminder.'))
                  }
                }}
                className={cn(space.reminded ? pillLime : 'inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-rh-ink', 'h-12 px-6')}
              >
                {space.reminded ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                {space.reminded ? (
                  <>
                    Reminder set <Check className="h-4 w-4" />
                  </>
                ) : (
                  'Remind me'
                )}
              </button>
              <p className="mt-3 text-xs text-white/50">You’ll get a notification when {space.host.name.split(' ')[0]} goes live.</p>
            </div>
          )}
        </div>
      </Shell>
    )
  }

  // Live: tap to listen (a tap lets the browser play the audio)
  return (
    <Shell>
      <div className="flex flex-1 flex-col p-7 sm:p-10">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-rh-lime px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-rh-ink">
            <LiveEq className="text-rh-ink" /> Live
          </span>
          {space.startedAt && <span className="text-xs font-semibold text-white/50">started {relativeTime(space.startedAt)}</span>}
        </div>
        <h1 className={cn('mt-5 text-[28px] leading-tight tracking-tight sm:text-[36px]', displayFont)}>{space.title}</h1>
        {space.description && <p className="mt-2 text-[15px] leading-6 text-white/60">{space.description}</p>}
        {hostLine}
        <div className="mt-auto pt-12">
          <button type="button" onClick={() => void enter('listen')} disabled={Boolean(joining)} className={cn(pillLime, 'h-14 w-full text-base sm:w-auto sm:px-10')}>
            {joining ? <Loader2 className="h-5 w-5 animate-spin" /> : <Headphones className="h-5 w-5" />}
            {space.isHost ? 'Rejoin as host' : 'Start listening'}
          </button>
          <p className="mt-3 text-xs text-white/45">You’ll join as a listener. Raise your hand to ask a question.</p>
        </div>
      </div>
    </Shell>
  )
}
