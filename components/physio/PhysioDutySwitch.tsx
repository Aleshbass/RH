'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { Check, ChevronDown } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type DutyStatus = 'idle' | 'in_transit' | 'at_patient'

const STATUS_LABELS: Record<DutyStatus, string> = {
  idle: 'Available',
  in_transit: 'Travelling',
  at_patient: 'With a patient',
}

/** Re-send position at least this often even when the device hasn't moved. */
const HEARTBEAT_MS = 3 * 60 * 1000
/** Between those, send at most this often, unless the physio moved at least MIN_MOVE_M. */
const MIN_INTERVAL_MS = 30 * 1000
const MIN_MOVE_M = 50

/** Distance in metres between two points (haversine). */
function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * "On duty" switch for home visits. While on, the physio's position is shared with
 * Rehabify operations so a visit can be coordinated. It lives in the dashboard shell so it
 * keeps running while the physio moves between pages.
 */
export function PhysioDutySwitch({ className }: { className?: string }) {
  const pingLocation = useMutation(api.locationTracking.pingLocation)
  const stopTracking = useMutation(api.locationTracking.stopTracking)
  const [onDuty, setOnDuty] = useState(false)
  const [status, setStatus] = useState<DutyStatus>('idle')
  const [starting, setStarting] = useState(false)

  // Watchers read the latest status from here, not from the render they were created in
  const statusRef = useRef<DutyStatus>('idle')
  const watchIdRef = useRef<number | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const failedRef = useRef(false)
  const lastSentRef = useRef<{ at: number; lat: number; lng: number; status: DutyStatus } | null>(null)

  /**
   * Sends the position. Phones report positions every second or so; each ping is a write that
   * queues ahead of the physio's own actions, so only send when 30 s have passed, they moved
   * 50 m, or their status changed (`force` for status changes and the heartbeat).
   */
  const send = useCallback(
    (position: GeolocationPosition, force = false) => {
      const here = { lat: position.coords.latitude, lng: position.coords.longitude }
      const last = lastSentRef.current
      const now = Date.now()
      if (
        !force &&
        last &&
        last.status === statusRef.current &&
        now - last.at < MIN_INTERVAL_MS &&
        metresBetween(last, here) < MIN_MOVE_M
      ) {
        return
      }
      lastSentRef.current = { at: now, ...here, status: statusRef.current }
      pingLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        status: statusRef.current,
      })
        .then(() => {
          failedRef.current = false
        })
        .catch(() => {
          // Tell the user once, not on every ping
          if (!failedRef.current) toast.error('Your location isn’t syncing. Check your connection.')
          failedRef.current = true
        })
    },
    [pingLocation]
  )

  const clearWatchers = useCallback(() => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    watchIdRef.current = null
    heartbeatRef.current = null
  }, [])

  const goOnDuty = () => {
    if (!('geolocation' in navigator)) {
      toast.error('This browser can’t share your location.')
      return
    }
    setStarting(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStarting(false)
        setOnDuty(true)
        send(position, true)
        // Network-level accuracy is enough for coordinating visits and saves battery
        watchIdRef.current = navigator.geolocation.watchPosition((p) => send(p), () => undefined, {
          enableHighAccuracy: false,
          maximumAge: 30_000,
          timeout: 20_000,
        })
        heartbeatRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition((p) => send(p, true), () => undefined)
        }, HEARTBEAT_MS)
        toast.success('You’re on duty. Your location is shared while this tab is open.')
      },
      () => {
        setStarting(false)
        toast.error('Allow location access in your browser to go on duty.')
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    )
  }

  const goOffDuty = async () => {
    clearWatchers()
    setOnDuty(false)
    try {
      await stopTracking({})
    } catch {
      // The location expires on its own after a few minutes without pings
    }
  }

  const changeStatus = (next: DutyStatus) => {
    statusRef.current = next
    setStatus(next)
    navigator.geolocation.getCurrentPosition((p) => send(p, true), () => undefined)
  }

  // Leaving the dashboard ends the shift
  useEffect(
    () => () => {
      if (watchIdRef.current !== null || heartbeatRef.current) {
        clearWatchers()
        stopTracking({}).catch(() => undefined)
      }
    },
    [clearWatchers, stopTracking]
  )

  const pillClass = cn(
    'inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50 active:scale-95',
    onDuty
      ? 'border-transparent bg-pt-green-bg text-pt-green-fg'
      : 'border-pt-line bg-pt-surface text-pt-muted hover:bg-pt-hover hover:text-pt-ink',
    className
  )
  const dot = <span className={cn('h-2 w-2 rounded-full', onDuty ? 'bg-pt-accent' : 'bg-pt-line-strong')} />

  if (!onDuty) {
    return (
      <button
        type="button"
        onClick={goOnDuty}
        disabled={starting}
        className={pillClass}
        title="Share your location with Rehabify while you do home visits"
      >
        {dot}
        {starting ? 'Starting…' : 'Off duty'}
      </button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={pillClass}>
          {dot}
          <span className="max-w-[7rem] truncate">{STATUS_LABELS[status]}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs font-normal text-neutral-500">
          On duty · location shared
        </DropdownMenuLabel>
        {(Object.keys(STATUS_LABELS) as DutyStatus[]).map((key) => (
          <DropdownMenuItem key={key} onClick={() => changeStatus(key)}>
            <span className="flex-1">{STATUS_LABELS[key]}</span>
            {status === key && <Check className="h-4 w-4 text-pt-accent-ink" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={goOffDuty}>Go off duty</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
