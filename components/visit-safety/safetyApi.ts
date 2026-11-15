'use client'

/**
 * Home-visit safety (convex/homeVisitSafety.ts): function references and result types for the
 * physio's safety card and bar, the patient's "who's at your door" card, and the admin board.
 * Plain references: the generated api type is at TypeScript's depth limit.
 */

import { makeFunctionReference } from 'convex/server'

export type VisitStage = 'on_the_way' | 'arrived' | 'left'
export type SkipReason = 'no_code' | 'family_answered' | 'code_wrong' | 'other'

export type HelpState = { _id: string; createdAt: number; status: 'open' | 'handling' | 'resolved'; physioSafeAt: number | null }

export type SafetyVisit = {
  _id: string
  appointmentId: string
  stage: VisitStage
  onTheWayAt: number
  arrivedAt: number | null
  leftAt: number | null
  expectedEndAt: number
  extensions: number
  canExtend: boolean
  doorCheck: 'code' | 'skipped' | null
  codeAttemptsLeft: number
  check: 'ok' | 'check_sent' | 'escalated'
  checkSentAt: number | null
  patientFirstName: string
  patientName: string
  address: string | null
  startTime: number | null
  endTime: number | null
  help: HelpState | null
}

export type ActiveVisit = SafetyVisit | { _id: null; stage: 'help_only'; help: HelpState }

export type AppointmentSafety = {
  visit: SafetyVisit | null
  canStart: boolean
  opensAt: number
  tooLate: boolean
  open: boolean
} | null

export type VisitIdentity = {
  stage: VisitStage
  onTheWayAt: number
  arrivedAt: number | null
  leftAt: number | null
  verified: boolean
  doorCode: string | null
  startTime: number | null
  endTime: number | null
  physio: {
    name: string
    firstName: string
    imageUrl: string | null
    staffNumber: string | null
    licenseNumber: string | null
    gender: string | null
  }
}

type Position = { lat?: number; lng?: number; accuracy?: number }
type ArriveResult = { ok: true } | { ok: false; attemptsLeft: number; message: string }

export type AlertRow = {
  _id: string
  kind: 'panic' | 'overdue'
  status: 'open' | 'handling' | 'resolved'
  createdAt: number
  physioName: string
  physioPhone: string | null
  physioImage: string | null
  staffNumber: string | null
  patientName: string | null
  patientPhone: string | null
  address: string | null
  location: { lat: number; lng: number; accuracy: number | null; at: number | null } | null
  lastPing: { lat: number; lng: number; at: number | null } | null
  physioSafeAt: number | null
  handledBy: string | null
  handledAt: number | null
  resolvedBy: string | null
  resolvedAt: number | null
  resolution: string | null
  falseAlarm: boolean
}

export type LiveVisitRow = {
  _id: string
  stage: 'on_the_way' | 'arrived'
  physioName: string
  physioPhone: string | null
  patientName: string
  address: string | null
  onTheWayAt: number
  arrivedAt: number | null
  expectedEndAt: number
  doorCheck: 'code' | 'skipped' | null
  doorSkipReason: string | null
  check: 'ok' | 'check_sent' | 'escalated'
  overdue: boolean
  lastPing: { lat: number; lng: number; at: number | null } | null
}

export type AdminBoard = { alerts: AlertRow[]; visits: LiveVisitRow[]; recent: AlertRow[] }

const q = <Args extends Record<string, unknown>, R>(name: string) => makeFunctionReference<'query', Args, R>(`homeVisitSafety:${name}`)
const m = <Args extends Record<string, unknown>, R = null>(name: string) => makeFunctionReference<'mutation', Args, R>(`homeVisitSafety:${name}`)

export const safetyApi = {
  myActiveVisit: q<Record<string, never>, ActiveVisit | null>('myActiveVisit'),
  forAppointment: q<{ appointmentId: string }, AppointmentSafety>('forAppointment'),
  visitByToken: q<{ token: string }, ({ expired: true } | ({ expired: false } & VisitIdentity)) | null>('visitByToken'),
  myIncomingVisit: q<Record<string, never>, (VisitIdentity & { token: string }) | null>('myIncomingVisit'),
  adminBoard: q<Record<string, never>, AdminBoard>('adminBoard'),
  adminOpenAlerts: q<Record<string, never>, { count: number; newest: { kind: 'panic' | 'overdue'; physioName: string; createdAt: number } | null } | null>('adminOpenAlerts'),

  startVisit: m<{ appointmentId: string } & Position, { visitId: string }>('startVisit'),
  ping: m<{ visitId: string; lat: number; lng: number; accuracy?: number }>('ping'),
  arrive: m<{ visitId: string; code?: string; skipReason?: SkipReason; skipNote?: string } & Position, ArriveResult>('arrive'),
  moreTime: m<{ visitId: string }, { expectedEndAt: number }>('moreTime'),
  leave: m<{ visitId: string } & Position>('leave'),
  sendHelp: m<{ visitId?: string } & Position, { alertId: string }>('sendHelp'),
  helpLocation: m<{ alertId: string; lat: number; lng: number; accuracy?: number }>('helpLocation'),
  imSafe: m<{ visitId?: string; alertId?: string; then?: 'left' | 'more_time' }>('imSafe'),
  handleAlert: m<{ alertId: string }>('handleAlert'),
  resolveAlert: m<{ alertId: string; note: string; falseAlarm: boolean; closeVisit?: boolean }>('resolveAlert'),
  adminCloseVisit: m<{ visitId: string }>('adminCloseVisit'),
}

/** Short "how it works" film for physios (set once the video is published; hidden while null). */
export const SAFETY_GUIDE_VIDEO_URL: string | null = null

/**
 * The phone's position, or {} if it can't be had quickly. Never blocks an action for long:
 * a safety action must work without location too.
 */
export function currentPosition(timeoutMs = 6000): Promise<{ lat?: number; lng?: number; accuracy?: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return resolve({})
    let done = false
    const finish = (value: { lat?: number; lng?: number; accuracy?: number }) => {
      if (done) return
      done = true
      resolve(value)
    }
    const timer = window.setTimeout(() => finish({}), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        window.clearTimeout(timer)
        finish({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy })
      },
      () => {
        window.clearTimeout(timer)
        finish({})
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 }
    )
  })
}

export const mapsHref = (lat: number, lng: number) => `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`

/** "+2348012345678" -> "tel:+2348012345678" */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
