'use client'

/**
 * Clock-in (convex/clinicAttendance.ts): function references and result types for the
 * clinician's clock (components/clock) and the clinic's Clock-in page (components/clinic/attendance).
 * Plain references: the generated api type is at TypeScript's depth limit.
 */

import { makeFunctionReference } from 'convex/server'
import type { ClockBreak } from '@/convex/helpers/clinicClock'

export type ShiftView = {
  _id: string
  userId: string
  dateKey: string
  clockInAt: number
  clockOutAt: number | null
  breaks: ClockBreak[]
  onBreak: boolean
  lateMinutes: number | null
  offsite: boolean
  distanceM: number | null
  offsiteReason: string | null
  outOffsite: boolean
  note: string | null
  closedBy: 'self' | 'owner' | 'auto' | null
  needsReview: boolean
  edited: boolean
  lastEdit: { at: number; reason: string } | null
}

export type DayHours = { open: string; close: string; openAt: number; closeAt: number } | null

export type MyClock =
  | null
  | { enabled: false }
  | {
      enabled: true
      clinicName: string
      logoUrl: string | null
      firstName: string | null
      exempt: boolean
      locationCheck: boolean
      site: { lat: number; lng: number; radiusM: number } | null
      offsiteRule: 'flag' | 'block'
      graceMinutes: number
      hoursToday: DayHours
      today: string
      weekStart: string
      shift: ShiftView | null
      shifts: ShiftView[]
      readOnly: boolean
    }

export type ClockSettings = {
  enabled: boolean
  locationCheck: boolean
  offsiteRule: 'flag' | 'block'
  site: { lat: number; lng: number; pinnedAt: number | null } | null
  siteRadiusM: number
  graceMinutes: number
  remindClockIn: boolean
  remindClockOut: boolean
  ownerAlerts: 'exceptions' | 'every' | 'none'
  exemptUserIds: string[]
  enabledAt: number | null
}

export type BoardPerson = {
  userId: string
  name: string
  imageUrl: string | null
  exempt: boolean
  status: 'working' | 'on_break' | 'out' | 'not_in' | 'off'
  shifts: ShiftView[]
}

export type ClockBoard = null | {
  canManage: boolean
  clinicName: string
  settings: ClockSettings
  hoursToday: DayHours
  today: string
  weekStart: string
  people: BoardPerson[]
  weekShifts: { userId: string; dateKey: string; clockInAt: number; clockOutAt: number | null; breaks: ClockBreak[] }[]
  reviewCount: number
}

export type ClockHistory = null | {
  canManage: boolean
  clinicName: string
  from: string
  to: string
  team: { userId: string; name: string }[]
  shifts: (ShiftView & { name: string })[]
  truncated: boolean
}

export type Position = { lat: number; lng: number; accuracyM?: number }

export const clockRefs = {
  getMyClock: makeFunctionReference<'query', { today?: string }, MyClock>('clinicAttendance:getMyClock'),
  clockIn: makeFunctionReference<
    'mutation',
    { position?: Position; reason?: string; note?: string },
    { shiftId: string; already: boolean; lateMinutes: number | null }
  >('clinicAttendance:clockIn'),
  clockOut: makeFunctionReference<
    'mutation',
    { position?: Position; note?: string },
    { workedMs: number; clockInAt: number; clockOutAt: number }
  >('clinicAttendance:clockOut'),
  startBreak: makeFunctionReference<'mutation', Record<string, never>, null>('clinicAttendance:startBreak'),
  endBreak: makeFunctionReference<'mutation', Record<string, never>, null>('clinicAttendance:endBreak'),
  getClockBoard: makeFunctionReference<'query', { today?: string }, ClockBoard>('clinicAttendance:getClockBoard'),
  getClockHistory: makeFunctionReference<'query', { from: string; to: string; userId?: string }, ClockHistory>(
    'clinicAttendance:getClockHistory'
  ),
  saveClockSettings: makeFunctionReference<
    'mutation',
    Partial<Omit<ClockSettings, 'site' | 'enabledAt'>> & { site?: Position | null },
    { enabled: boolean }
  >('clinicAttendance:saveClockSettings'),
  correctShift: makeFunctionReference<
    'mutation',
    { shiftId: string; clockInAt: number; clockOutAt?: number; reason: string },
    null
  >('clinicAttendance:correctShift'),
  clockOutForClinician: makeFunctionReference<'mutation', { shiftId: string; at?: number }, null>(
    'clinicAttendance:clockOutForClinician'
  ),
  addMissedShift: makeFunctionReference<
    'mutation',
    { userId: string; clockInAt: number; clockOutAt: number; reason: string },
    null
  >('clinicAttendance:addMissedShift'),
  markShiftReviewed: makeFunctionReference<'mutation', { shiftId: string }, null>('clinicAttendance:markShiftReviewed'),
}

/** The readable part of a Convex error (string data), or the fallback. */
export function clockError(error: unknown, fallback: string): string {
  const data = (error as { data?: unknown } | null)?.data
  if (typeof data === 'string' && data.trim()) return data
  if (data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string') {
    return (data as { message: string }).message
  }
  return fallback
}

/** A ConvexError asking for an off-site reason, with the distance if known. */
export function offsiteRequest(error: unknown): { distanceM: number | null; message: string } | null {
  const data = (error as { data?: unknown } | null)?.data as { code?: string; distanceM?: number | null; message?: string } | undefined
  if (data && typeof data === 'object' && data.code === 'OFFSITE_REASON_NEEDED') {
    return { distanceM: data.distanceM ?? null, message: data.message ?? 'Say why you’re clocking in from here.' }
  }
  return null
}

/**
 * The phone's position once. Resolves to null when location is off, refused or too slow; the
 * server then asks for a reason or refuses, as the clinic chose.
 */
export function currentPosition(timeoutMs = 12_000): Promise<Position | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15_000 }
    )
  })
}
