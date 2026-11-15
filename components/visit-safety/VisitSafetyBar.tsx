'use client'

/**
 * A slim strip under the physio portal's top bar while a home visit is open: who they're with,
 * the help button on every page, and "Are you OK?" when a visit runs over. While it shows, the
 * phone's position is sent to the visit (every 30 s or 50 m, and every 3 minutes), so the care
 * team can find them. Tapping the strip opens the full controls.
 */

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { ChevronRight, MapPin, ShieldAlert, ShieldCheck, TriangleAlert } from '@/components/icons'
import { lagosTime } from '@/convex/helpers/lagosTime'
import { PhysioDrawer } from '@/components/physio/ui'
import { cn } from '@/lib/utils'
import { HelpPill, HelpSentNote, VisitSafetyPanel } from './VisitSafetyPanel'
import { SafetyGuideButton } from './SafetyGuide'
import { safetyApi, type ActiveVisit } from './safetyApi'

const HEARTBEAT_MS = 3 * 60_000
const MIN_INTERVAL_MS = 30_000
const MIN_MOVE_M = 50

function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Follows the phone while a visit (or a help alert) is open. */
function useVisitTracking(active: ActiveVisit | null | undefined) {
  const ping = useMutation(safetyApi.ping)
  const helpLocation = useMutation(safetyApi.helpLocation)
  const visitId = active && active.stage !== 'help_only' ? active._id : null
  const helpId = active?.help && active.help.status !== 'resolved' ? active.help._id : null
  const lastRef = useRef<{ at: number; lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (!visitId && !helpId) return
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return
    const urgent = Boolean(helpId)
    const send = (p: GeolocationPosition, force = false) => {
      const here = { lat: p.coords.latitude, lng: p.coords.longitude }
      const last = lastRef.current
      const now = Date.now()
      // During a help alert every position counts; otherwise only after 30 s or 50 m
      if (!force && !urgent && last && now - last.at < MIN_INTERVAL_MS && metresBetween(last, here) < MIN_MOVE_M) return
      lastRef.current = { at: now, ...here }
      const accuracy = p.coords.accuracy
      const call = visitId
        ? ping({ visitId, lat: here.lat, lng: here.lng, accuracy })
        : helpLocation({ alertId: helpId!, lat: here.lat, lng: here.lng, accuracy })
      call.catch(() => undefined)
    }
    const watchId = navigator.geolocation.watchPosition((p) => send(p), () => undefined, {
      enableHighAccuracy: urgent,
      maximumAge: urgent ? 5_000 : 30_000,
      timeout: 20_000,
    })
    const heartbeat = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition((p) => send(p, true), () => undefined, { maximumAge: 60_000, timeout: 20_000 })
    }, urgent ? 30_000 : HEARTBEAT_MS)
    return () => {
      navigator.geolocation.clearWatch(watchId)
      window.clearInterval(heartbeat)
    }
  }, [visitId, helpId, ping, helpLocation])
}

export function VisitSafetyBar({ className }: { className?: string }) {
  const active = useQuery(safetyApi.myActiveVisit, {})
  const [open, setOpen] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  useVisitTracking(active)

  // "Are you OK?" notifications link to ?safety=1: open the controls straight away
  const wantsOpen = searchParams?.get('safety') === '1'
  useEffect(() => {
    if (!wantsOpen || active === undefined) return
    if (active) setOpen(true)
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.delete('safety')
    router.replace(params.toString() ? `${pathname}?${params}` : pathname, { scroll: false })
  }, [wantsOpen, active, searchParams, router, pathname])

  // A visit that needs an answer opens itself once
  const asked = active && active.stage !== 'help_only' && active.check === 'check_sent' ? active.checkSentAt : null
  const seenAsk = useRef<number | null>(null)
  useEffect(() => {
    if (asked && seenAsk.current !== asked) {
      seenAsk.current = asked
      setOpen(true)
    }
  }, [asked])

  if (!active) return null

  const helpOn = Boolean(active.help && active.help.status !== 'resolved')
  const checking = active.stage !== 'help_only' && active.check !== 'ok'
  const tone = helpOn ? 'bg-pt-rose-bg text-pt-rose-fg' : checking ? 'bg-pt-amber-bg text-pt-amber-fg' : 'bg-pt-green-bg text-pt-green-fg'
  const Icon = helpOn ? ShieldAlert : checking ? TriangleAlert : active.stage === 'on_the_way' ? MapPin : ShieldCheck

  let text: string
  if (helpOn) text = active.help?.physioSafeAt ? 'Help alert: the care team will call to check' : 'Help alert sent. The care team will call you'
  else if (active.stage === 'help_only') text = 'Help alert'
  else if (checking) text = `Are you OK? Tap to answer`
  else if (active.stage === 'on_the_way') text = `On the way to ${active.patientFirstName}`
  else text = `With ${active.patientFirstName} · until ${lagosTime(active.expectedEndAt)}`

  return (
    <>
      <div className={cn('flex items-center gap-2 px-4 pb-2 sm:px-6 lg:px-8', className)}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn('flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold', tone)}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{text}</span>
          <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
        </button>
        {!helpOn && active.stage !== 'help_only' && <HelpPill visitId={active._id} compact className="shrink-0" />}
      </div>

      <PhysioDrawer
        open={open}
        onOpenChange={setOpen}
        title={active.stage === 'help_only' ? 'Help alert' : `Visit with ${active.patientName}`}
        description={
          active.stage === 'help_only' ? undefined : (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {active.address && <span>{active.address}</span>}
              <SafetyGuideButton />
            </span>
          )
        }
      >
        {active.stage === 'help_only' ? (
          active.help && <HelpSentNote alertId={active.help._id} safe={Boolean(active.help.physioSafeAt)} />
        ) : (
          <VisitSafetyPanel visit={active} />
        )}
      </PhysioDrawer>
    </>
  )
}
