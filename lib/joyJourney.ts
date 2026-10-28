/** Wording for Joy (WhatsApp) journeys, shared by the physio workspace, patient dashboard and /v page. */

export type JoyBookingState =
  | 'awaiting_payment'
  | 'payment_failed'
  | 'expired'
  | 'awaiting_physio'
  | 'finding_new_physio'
  | 'awaiting_schedule'
  | 'confirmed'
  | 'completed'
  | 'missed'
  | 'cancelled'

export type JoyServiceMode = 'home_visit' | 'clinic' | 'online'

export type StateTone = 'neutral' | 'teal' | 'green' | 'amber' | 'red'

export const BOOKING_STATE: Record<JoyBookingState, { label: string; tone: StateTone }> = {
  awaiting_payment: { label: 'Awaiting payment', tone: 'amber' },
  payment_failed: { label: 'Payment failed', tone: 'red' },
  expired: { label: 'Hold expired', tone: 'neutral' },
  awaiting_physio: { label: 'Waiting for the physio to accept', tone: 'amber' },
  finding_new_physio: { label: 'Finding another physio', tone: 'amber' },
  awaiting_schedule: { label: 'Being scheduled by Rehabify', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  completed: { label: 'Completed', tone: 'teal' },
  missed: { label: 'Missed', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export const SERVICE_MODE: Record<JoyServiceMode, string> = {
  home_visit: 'Home visit',
  clinic: 'At the clinic',
  online: 'Video call',
}

/** Journey stages as the physio reads them (about the patient). */
export const STAGE_LABEL: Record<string, string> = {
  conversation_started: 'Started chatting with Joy',
  referral_linked: 'Referral linked',
  triage_completed: "Answered Joy's health questions",
  eligibility_passed: 'Suitable for physiotherapy',
  eligibility_blocked: 'Advised to seek other care first',
  matches_shown: 'Shown physiotherapists',
  booking_held: 'Chose a time',
  payment_link_sent: 'Sent a payment link',
  payment_completed: 'Paid',
  payment_failed: 'Payment failed',
  provider_requested: 'Waiting for the physio to accept',
  provider_accepted: 'Physio accepted',
  provider_rejected: 'Physio declined',
  provider_timeout: "Physio didn't respond in time",
  awaiting_admin_schedule: 'Waiting for Rehabify to schedule',
  awaiting_physio: 'Waiting for the physio to accept',
  admin_scheduled: 'Scheduled by Rehabify',
  rescheduled: 'Rescheduled',
  meeting_link_sent: 'Video link sent',
  reminder_sent: 'Reminder sent',
  call_joined: 'Joined the video call',
  session_completed: 'Session completed',
  hold_expired: 'Time slot hold expired',
  abandoned: 'Stopped replying to Joy',
  cancelled: 'Cancelled',
  handed_to_human: 'Passed to the Rehabify team',
}

/** The same stages, as the patient reads them (about themselves). */
export const PATIENT_STAGE_LABEL: Record<string, string> = {
  ...STAGE_LABEL,
  conversation_started: 'You started chatting with Joy',
  triage_completed: "You answered Joy's health questions",
  eligibility_passed: 'Joy confirmed physiotherapy can help',
  eligibility_blocked: 'Joy advised you to seek other care first',
  matches_shown: 'Joy showed you physiotherapists',
  booking_held: 'You chose a time',
  payment_link_sent: 'Joy sent you a payment link',
  payment_completed: 'You paid',
  provider_requested: 'Waiting for your physio to accept',
  provider_accepted: 'Your physio accepted',
  provider_rejected: 'Your physio couldn’t take it; finding another',
  provider_timeout: 'Finding another physio',
  call_joined: 'You joined the video call',
  abandoned: 'Conversation paused',
}

export function stageLabel(stage: string, audience: 'physio' | 'patient' = 'physio') {
  return (audience === 'patient' ? PATIENT_STAGE_LABEL : STAGE_LABEL)[stage] ?? stage.replace(/_/g, ' ')
}
