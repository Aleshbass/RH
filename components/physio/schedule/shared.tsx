'use client'

/**
 * Shared pieces of the physio Schedule: the appointment shape, plain-language status (with the
 * sentence behind each "i"), when a video session can be joined, and a clock that keeps Join
 * buttons honest.
 */

import { Component, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/convex/_generated/api'
import type { getMyAppointments } from '@/convex/appointments'
import type { getMyHeldBookingsAsPhysio } from '@/convex/marketplace/booking'
import {
  awaitingConfirmationFrom,
  hasPendingProposal,
  isOpenAppointment,
} from '@/convex/helpers/appointmentStatus'
import { isVideoVisit, meetingLinkOf, type AppointmentLike } from '@/components/appointments/appointment-ui'
import type { QueryResult } from '@/lib/convexUntyped'
import type { Tone } from '@/components/physio/ui'

export type PhysioAppointment = QueryResult<typeof getMyAppointments>[number]
export type HeldBooking = QueryResult<typeof getMyHeldBookingsAsPhysio>[number]

/**
 * The generated api types sit at TypeScript's depth limit, so the Schedule reads its Convex
 * functions untyped; every result is cast to the type of the function it came from.
 */
const root = api as unknown as Record<string, Record<string, unknown>>
export const scheduleApi = {
  appointments: root.appointments,
  booking: (root.marketplace as unknown as Record<string, Record<string, unknown>>).booking,
  physioCare: root.physioCare,
  patients: root.patients,
  users: root.users,
  rehabifyFollowUps: root.rehabifyFollowUps,
  serviceTariffs: root.serviceTariffs,
  marketplaceSettings: (root.marketplace as unknown as Record<string, Record<string, unknown>>).settings,
  travelZones: root.travelZones,
}

export const asLike = (apt: PhysioAppointment) => apt as unknown as AppointmentLike

export function patientName(apt: { patient?: { firstName?: string; lastName?: string } | null }) {
  return [apt.patient?.firstName, apt.patient?.lastName].filter(Boolean).join(' ') || 'Patient'
}

export function minutesOf(apt: { startTime: number; endTime: number }) {
  return Math.max(15, Math.round((apt.endTime - apt.startTime) / 60000))
}

/** Video sessions can be joined from 10 minutes before the start until the end. */
export const JOIN_EARLY_MS = 10 * 60 * 1000

export function joinLink(apt: PhysioAppointment, now: number) {
  const like = asLike(apt)
  if (!isVideoVisit(like) || !isOpenAppointment(apt.status)) return null
  if (now < apt.startTime - JOIN_EARLY_MS || now > apt.endTime) return null
  return meetingLinkOf(like) ?? null
}

/** True when the patient asked for this time and the physio hasn't answered. */
export function needsMyAnswer(apt: PhysioAppointment, now = Date.now()) {
  const like = asLike(apt)
  return (
    isOpenAppointment(apt.status) &&
    apt.startTime > now &&
    awaitingConfirmationFrom(like) === 'provider' &&
    !hasPendingProposal(like, now)
  )
}

/** Plain status for the physio: a label, a tint, and one sentence explaining it. */
export function visitStatus(apt: PhysioAppointment, now = Date.now()): { label: string; tone: Tone; explain: string } {
  const like = asLike(apt)
  if (apt.status === 'completed') return { label: 'Done', tone: 'green', explain: 'You marked this session as done.' }
  if (apt.status === 'no_show') return { label: 'No-show', tone: 'neutral', explain: 'The patient didn’t come. You can still change it to done.' }
  if (apt.status === 'cancelled_by_patient') {
    return { label: 'Cancelled by patient', tone: 'rose', explain: 'The patient cancelled. The time is free again.' }
  }
  if (apt.status === 'cancelled_by_therapist') {
    return { label: 'Cancelled by you', tone: 'rose', explain: 'You cancelled or declined this visit. The patient was told.' }
  }
  if (apt.endTime < now) {
    return { label: 'Not closed', tone: 'ink', explain: 'This session’s time has passed. Mark it done or a no-show so your records and payments stay right.' }
  }
  if (hasPendingProposal(like, now)) {
    return { label: 'New time sent', tone: 'blue', explain: 'You suggested another time. The patient can accept it or keep the original.' }
  }
  const waitingOn = awaitingConfirmationFrom(like)
  if (waitingOn === 'provider') {
    return { label: 'Needs your answer', tone: 'ink', explain: 'The patient asked for this time. Accept it, decline it, or suggest another time.' }
  }
  if (waitingOn === 'patient') {
    return { label: 'Waiting for patient', tone: 'blue', explain: 'You booked this time. It’s confirmed once the patient accepts it.' }
  }
  return { label: 'Confirmed', tone: 'green', explain: 'Both of you have agreed this time.' }
}

/** Re-renders on an interval so time-based states (Join, Not closed) update by themselves. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

/**
 * Renders nothing if its children throw. Wraps queries on functions that may not be deployed
 * yet, so the page keeps working while the backend catches up.
 */
export class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** The readable part of a Convex error. */
export function readableError(error: unknown, fallback: string) {
  const data = (error as { data?: unknown } | null)?.data
  if (typeof data === 'string' && data.trim()) return data
  const raw = error instanceof Error ? error.message : ''
  const match = raw.match(/(?:Uncaught (?:Convex)?Error|ConvexError):\s*(.+?)(?:\n|\s+at\s|$)/)
  const message = match?.[1]?.trim()
  return message && message !== 'Server Error' ? message : fallback
}
