'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useAction, useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { Clock, Link2Off, Loader2, Lock, ShieldCheck } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { ProgramPlayer } from '@/components/exercise-programs/ProgramPlayer'
import type { LinkStatus, LogInput, SharedProgramResult } from '@/components/exercise-programs/types'
import { useViewerGrant } from '@/lib/exercise3d/useViewerGrant'
import { cn } from '@/lib/utils'

// Exercise programme sent on WhatsApp: /x/<token>. No account; the patient unlocks it with a PIN
// and this device keeps a session (in localStorage) until the link expires.

const storageKey = (code: string) => `rh-x:${code.slice(0, 8)}`

function readSession(code: string) {
  try {
    const raw = localStorage.getItem(storageKey(code))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { code: string; session: string }
    return parsed.code === code ? parsed.session : null
  } catch {
    return null
  }
}

function writeSession(code: string, session: string | null) {
  try {
    if (session) localStorage.setItem(storageKey(code), JSON.stringify({ code, session }))
    else localStorage.removeItem(storageKey(code))
  } catch {
    // Private mode: the PIN will be asked again next time.
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-rh-canvas dark:bg-rh-night">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Image src="/logos/MainRehabify.svg" alt="Rehabify" width={103} height={28} priority className="h-7 w-auto dark:hidden" />
        <Image src="/logos/WhiteGreen MainRehabify.svg" alt="Rehabify" width={103} height={28} priority className="hidden h-7 w-auto dark:block" />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs text-rh-teal shadow-sm dark:bg-white/[0.06] dark:text-rh-aqua">
          <ShieldCheck className="h-3.5 w-3.5" /> Private to you
        </span>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16">{children}</main>
    </div>
  )
}

function Status({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-3xl bg-white p-8 text-center shadow-soft dark:bg-rh-ink-2">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rh-mist text-rh-teal dark:bg-white/[0.06] dark:text-rh-aqua">{icon}</div>
      <h1 className="text-lg font-semibold text-rh-night dark:text-white">{title}</h1>
      <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">{text}</p>
    </div>
  )
}

function PinPad({
  code,
  senderName,
  pinSource,
  lockedUntil,
  onUnlocked,
}: {
  code: string
  senderName: string
  pinSource: 'phone' | 'custom'
  lockedUntil: number | null
  onUnlocked: (session: string) => void
}) {
  const unlock = useAction(api.exerciseShareLinks.unlockShareLink)
  const [digits, setDigits] = useState(['', '', '', ''])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState<number | null>(lockedUntil)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!cooldown) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [cooldown])
  const waiting = cooldown && cooldown > now ? Math.ceil((cooldown - now) / 60000) : 0

  const submit = useCallback(
    async (pin: string) => {
      setBusy(true)
      setMessage(null)
      try {
        const res = await unlock({ code, pin })
        if (res.ok) {
          onUnlocked(res.session)
          return
        }
        setDigits(['', '', '', ''])
        inputs.current[0]?.focus()
        if (res.reason === 'cooldown') {
          setCooldown(res.lockedUntil ?? Date.now() + 15 * 60_000)
          setMessage('Too many wrong PINs. Wait a little, then try again.')
        } else if (res.reason === 'locked') {
          setMessage(`This link is locked after too many wrong PINs. Ask ${senderName} to send a new one.`)
        } else if (res.reason === 'wrong_pin') {
          setMessage(`That PIN isn't right.${res.attemptsLeft ? ` ${res.attemptsLeft} ${res.attemptsLeft === 1 ? 'try' : 'tries'} left before a short wait.` : ''}`)
        } else {
          setMessage('This link is no longer available.')
        }
      } catch {
        setMessage('Couldn’t check your PIN. Check your connection and try again.')
      } finally {
        setBusy(false)
      }
    },
    [code, onUnlocked, senderName, unlock]
  )

  const setDigit = (i: number, value: string) => {
    const v = value.replace(/\D/g, '')
    if (v.length > 1) {
      // Pasted the whole PIN.
      const all = v.slice(0, 4).split('')
      const next = ['', '', '', ''].map((_, j) => all[j] ?? '')
      setDigits(next)
      if (all.length === 4) void submit(all.join(''))
      return
    }
    const next = [...digits]
    next[i] = v
    setDigits(next)
    if (v && i < 3) inputs.current[i + 1]?.focus()
    if (next.every(Boolean)) void submit(next.join(''))
  }

  return (
    <div className="mx-auto mt-8 max-w-md rounded-3xl bg-white p-7 text-center shadow-soft dark:bg-rh-ink-2">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rh-teal text-white dark:bg-rh-aqua dark:text-rh-night">
        <Lock className="h-5 w-5" />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-teal dark:text-rh-aqua">Home exercises</p>
      <h1 className="mt-1 text-xl font-semibold text-rh-night dark:text-white">{senderName} sent you exercises</h1>
      <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
        {pinSource === 'phone' ? 'Enter the last 4 digits of your phone number.' : `Enter the 4-digit PIN ${senderName} gave you.`}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el
            }}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus()
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            disabled={busy || waiting > 0}
            autoFocus={i === 0}
            aria-label={`PIN digit ${i + 1}`}
            className="h-14 w-12 rounded-2xl border-2 border-black/[0.08] bg-rh-canvas text-center text-2xl font-semibold text-rh-night outline-none transition focus:border-rh-teal disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
          />
        ))}
      </div>
      <div className="mt-4 min-h-[2.5rem] text-sm">
        {busy ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-rh-teal" />
        ) : waiting > 0 ? (
          <p className="inline-flex items-center gap-1.5 text-amber-700"><Clock className="h-4 w-4" /> Try again in about {waiting} minute{waiting === 1 ? '' : 's'}.</p>
        ) : (
          message && <p className={cn('text-rose-600')}>{message}</p>
        )}
      </div>
      <p className="mt-2 text-xs text-neutral-400">This link is just for you. Please don&apos;t forward it.</p>
    </div>
  )
}

function Unlocked({ code, session, onSessionLost }: { code: string; session: string; onSessionLost: () => void }) {
  const data = useQuery(api.exerciseShareLinks.sharedProgram, { code, session }) as SharedProgramResult | undefined
  const requestGrant = useViewerGrant({ kind: 'link', code, session })
  const log = useMutation(api.exercisePrograms.logExerciseFromLink)

  useEffect(() => {
    if (data && !data.ok) onSessionLost()
  }, [data, onSessionLost])

  if (data === undefined) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-rh-teal" />
      </div>
    )
  }
  if (!data.ok) return null
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        {data.patientFirstName ? `Hi ${data.patientFirstName}. ` : ''}This link works until {format(data.expiresAt, 'd MMMM yyyy')}.
      </p>
      <ProgramPlayer
        program={data.program}
        doneToday={data.doneToday}
        requestGrant={requestGrant}
        mediaContext={{ kind: 'link', code, session }}
        onLog={(input: LogInput) => log({ code, session, ...input })}
      />
    </div>
  )
}

export default function ShareLinkPage() {
  const params = useParams()
  const code = String(params.code ?? '')
  const status = useQuery(api.exerciseShareLinks.linkStatus, { code }) as LinkStatus | undefined
  const [session, setSession] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setSession(readSession(code))
    setReady(true)
  }, [code])

  const onUnlocked = useCallback(
    (s: string) => {
      writeSession(code, s)
      setSession(s)
    },
    [code]
  )
  const onSessionLost = useCallback(() => {
    writeSession(code, null)
    setSession(null)
  }, [code])

  let body: React.ReactNode
  if (!ready || status === undefined) {
    body = (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-rh-teal" />
      </div>
    )
  } else if (status.state === 'not_found') {
    body = <Status icon={<Link2Off className="h-5 w-5" />} title="Link not recognised" text="Check you opened the whole link from WhatsApp, or ask your physiotherapist to send it again." />
  } else if (status.state === 'expired') {
    body = <Status icon={<Clock className="h-5 w-5" />} title="This link has expired" text="Ask your physiotherapist for a new link to keep seeing your exercises." />
  } else if (status.state === 'revoked') {
    body = <Status icon={<Link2Off className="h-5 w-5" />} title="This link was turned off" text="Your physiotherapist has stopped this link. Ask them if you need your exercises again." />
  } else if (status.state === 'locked') {
    body = <Status icon={<Lock className="h-5 w-5" />} title="This link is locked" text="Too many wrong PINs were entered. Ask your physiotherapist to send you a new link." />
  } else if (session) {
    body = <Unlocked code={code} session={session} onSessionLost={onSessionLost} />
  } else {
    body = (
      <PinPad
        code={code}
        senderName={status.senderName ?? 'Your physiotherapist'}
        pinSource={status.pinSource ?? 'phone'}
        lockedUntil={status.lockedUntil ?? null}
        onUnlocked={onUnlocked}
      />
    )
  }

  return <Shell>{body}</Shell>
}
