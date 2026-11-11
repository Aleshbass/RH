'use client'

// A patient's personal join link from their physio or clinic, sent from the physio's own
// WhatsApp: /j/<code>. They check their name and number, choose a 4-digit PIN and are signed in.
// Opening the page changes nothing, so WhatsApp's link preview can't use it up
// (convex/patientJoin.ts, convex/actions/patientJoin.ts).

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useClerk } from '@clerk/nextjs'
import { useAction, useMutation, useQuery } from 'convex/react'
import { AuthShell } from '@/components/auth/AuthShell'
import { StepHeading } from '@/components/auth/AuthControls'
import { JoinDetailsForm } from '@/components/patient-join/JoinDetailsForm'
import { JoinLoading, JoinMessage, SenderRow, primaryLinkClass, secondaryLinkClass } from '@/components/patient-join/JoinFrame'
import { AFTER_JOIN_PATH, joinRefs, type JoinResult } from '@/components/patient-join/refs'
import { useTicketSignIn } from '@/components/patient-join/useTicketSignIn'

const SIGN_IN = '/sign-in?redirect=%2Fdashboard%2Fpatient'

function problemFor(result: Extract<JoinResult, { ok: false }>, who: string) {
  switch (result.reason) {
    case 'name':
      return { field: 'name' as const, message: result.message ?? 'Enter your first and last name.' }
    case 'phone':
      return { field: 'phone' as const, message: result.message ?? 'Check your phone number.' }
    case 'pin':
      return { field: 'pin' as const, message: result.message ?? 'Pick a different PIN.' }
    case 'used':
    case 'expired':
    case 'not_found':
      return { message: `This link can't be used any more. Ask ${who} to send you a new one.` }
    case 'own_account':
      return { message: 'You already have a Rehabify account. Sign in with your email instead.' }
    default:
      return { message: 'We couldn’t finish just now. Please try again in a minute.' }
  }
}

export default function PatientJoinPage() {
  const params = useParams()
  const router = useRouter()
  const code = String(params.code ?? '')
  const page = useQuery(joinRefs.getJoinPage, { code })
  const markOpened = useMutation(joinRefs.markJoinOpened)
  const complete = useAction(joinRefs.completeJoin)
  const { finish } = useTicketSignIn()
  const { signOut } = useClerk()
  const [manual, setManual] = useState(false)
  // Joined: the link now reads "used", so don't flash that while signing in
  const [done, setDone] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const opened = useRef(false)

  useEffect(() => {
    if (page?.state !== 'ok' || opened.current) return
    opened.current = true
    void markOpened({ code }).catch(() => undefined)
  }, [page?.state, code, markOpened])

  // Nothing to set up for someone already signed in to this account with a fresh link
  useEffect(() => {
    if (page?.state === 'ok' && page.viewer === 'this_patient' && page.purpose === 'join') router.replace(AFTER_JOIN_PATH)
  }, [page, router])

  if (page === undefined || (done && !manual)) return <JoinLoading />

  const who = page.state === 'not_found' ? 'your physiotherapist' : page.physioName ?? page.clinicName ?? 'your physiotherapist'

  if (manual) {
    return (
      <JoinMessage
        title="You’re all set"
        actions={
          <Link href={SIGN_IN} className={primaryLinkClass}>
            Sign in
          </Link>
        }
      >
        Your PIN is saved. Sign in with your phone number and PIN to open your dashboard.
      </JoinMessage>
    )
  }

  if (page.state === 'not_found') {
    return (
      <JoinMessage title="Link not recognised">
        Check that you opened the whole link your physiotherapist sent you on WhatsApp. If it still doesn’t work, ask them to send it
        again.
      </JoinMessage>
    )
  }

  if (page.state !== 'ok') {
    return (
      <JoinMessage
        title={page.state === 'used' ? 'This link has been used' : 'This link has expired'}
        actions={
          <Link href={SIGN_IN} className={primaryLinkClass}>
            Sign in with phone and PIN
          </Link>
        }
      >
        {page.state === 'used'
          ? `Each link works once. If you’ve joined, sign in with your phone number and PIN. Forgot your PIN? Ask ${who} to send you a new link.`
          : `Ask ${who} to send you a new link on WhatsApp.`}
      </JoinMessage>
    )
  }

  if (page.access === 'own_account') {
    return (
      <JoinMessage
        title="You already have a Rehabify account"
        actions={
          <Link href={SIGN_IN} className={primaryLinkClass}>
            Sign in
          </Link>
        }
      >
        Sign in with your email to see your care from {who}.
      </JoinMessage>
    )
  }

  if (page.viewer === 'someone_else') {
    return (
      <JoinMessage
        title="You’re signed in to another account"
        actions={
          <button
            type="button"
            disabled={leaving}
            onClick={() => {
              setLeaving(true)
              void signOut({ redirectUrl: `/j/${code}` })
            }}
            className={primaryLinkClass}
          >
            {leaving ? 'Signing out…' : 'Sign out and continue'}
          </button>
        }
      >
        This link is for {page.patient.firstName || 'someone else'}. Sign out of the other account on this phone to continue.
      </JoinMessage>
    )
  }

  const reset = page.purpose === 'reset'
  const title = reset
    ? 'Choose a new PIN'
    : `${page.physioName ?? page.clinicName ?? 'Your physiotherapist'} has added you to Rehabify`

  return (
    <AuthShell>
      <SenderRow name={page.physioName} imageUrl={page.physioImageUrl} clinicName={page.clinicName} />
      <StepHeading
        eyebrow="Rehabify"
        title={title}
        subtitle={
          reset
            ? `Hi ${page.patient.firstName || 'there'}. Your new PIN replaces the old one.`
            : 'See your exercises, appointments and messages in one place. Check your details and choose a PIN. No email needed.'
        }
      />
      <JoinDetailsForm
        initial={page.patient}
        submitLabel={reset ? 'Save PIN and sign in' : 'Accept and start'}
        pinLabel={reset ? 'New 4-digit PIN' : 'Choose a 4-digit PIN'}
        onSubmit={async (details) => {
          const result = await complete({
            code,
            firstName: details.firstName,
            lastName: details.lastName,
            phone: details.phone,
            pin: details.pin,
            accepted: details.accepted,
          })
          if (!result.ok) return problemFor(result, who)
          setDone(true)
          if (!result.ticket || !(await finish(result.ticket, { justJoined: !reset }))) setManual(true)
          return null
        }}
      >
        {reset && (
          <Link href={SIGN_IN} className={secondaryLinkClass}>
            I remember my PIN
          </Link>
        )}
      </JoinDetailsForm>
    </AuthShell>
  )
}
