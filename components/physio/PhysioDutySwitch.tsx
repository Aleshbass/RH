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

  const send = useCallback(
    (position: GeolocationPosition) => {
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
        send(position)
        watchIdRef.current = navigator.geolocation.watchPosition(send, () => undefined, {
          enableHighAccuracy: true,
          maximumAge: 10_000,
          timeout: 10_000,
        })
        heartbeatRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(send, () => undefined)
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
    navigator.geolocation.getCurrentPosition(send, () => undefined)
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
    'inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold shadow-soft transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-teal/40 active:scale-95',
    onDuty
      ? 'bg-rh-mint text-[#047857] dark:bg-emerald-400/10 dark:text-emerald-300'
      : 'bg-white text-neutral-600 hover:text-rh-night dark:bg-rh-ink-2 dark:text-neutral-300',
    className
  )
  const dot = (
    <span
      className={cn('h-2 w-2 rounded-full', onDuty ? 'animate-pulse bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600')}
    />
  )

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
            {status === key && <Check className="h-4 w-4 text-[#005b57] dark:text-[#2dd4bf]" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={goOffDuty}>Go off duty</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
