'use client'

// A physiotherapist's own patient link: /join/<their booking slug>. Patients type their name and
// phone, choose a 4-digit PIN and are in that physio's care straight away. A number that already
// has an account needs that account's PIN; someone the physio already added waits for their
// personal link (convex/patientJoin.ts).

import { useState } from 'react'
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

const DASHBOARD = '/dashboard/patient'

function minutesUntil(at?: number) {
  return at ? Math.max(1, Math.ceil((at - Date.now()) / 60_000)) : 15
}

export default function PhysioJoinLinkPage() {
  const params = useParams()
  const router = useRouter()
  const slug = String(params.slug ?? '')
  const page = useQuery(joinRefs.getPhysioLinkPage, { slug })
  const join = useAction(joinRefs.joinWithPhysioLink)
  const joinSignedIn = useMutation(joinRefs.joinPhysioSignedIn)
  const { finish } = useTicketSignIn()
  const { signOut } = useClerk()
  const [outcome, setOutcome] = useState<'already_added' | 'manual' | 'done' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (page === undefined || outcome === 'done') return <JoinLoading />

  if (page.state === 'not_found') {
    return (
      <JoinMessage title="This link isn’t working">
        Ask your physiotherapist to send you their current Rehabify link.
      </JoinMessage>
    )
  }

  const physio = page.physioName

  if (outcome === 'already_added') {
    return (
      <JoinMessage title={`${physio} has already added you`}>
        We’ve let them know you’d like to join. They’ll send you your personal link on WhatsApp: tap it to finish. It only takes a
        minute.
      </JoinMessage>
    )
  }

  if (outcome === 'manual') {
    return (
      <JoinMessage
        title="You’re all set"
        actions={
          <Link href="/sign-in?redirect=%2Fdashboard%2Fpatient" className={primaryLinkClass}>
            Sign in
          </Link>
        }
      >
        Your PIN is saved. Sign in with your phone number and PIN to open your dashboard.
      </JoinMessage>
    )
  }

  const switchAccount = (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void signOut({ redirectUrl: `/join/${slug}` })
      }}
      className={secondaryLinkClass}
    >
      Sign out
    </button>
  )

  if (page.signedIn && page.signedIn.role !== 'patient') {
    return (
      <JoinMessage title="This link is for patients" actions={switchAccount}>
        You’re signed in with a {page.signedIn.role ? page.signedIn.role.replace(/_/g, ' ') : 'Rehabify'} account. Sign out to join {physio} as a
        patient.
      </JoinMessage>
    )
  }

  if (page.signedIn) {
    const name = page.signedIn.firstName
    return (
      <JoinMessage
        title={page.signedIn.alreadyLinked ? `You’re already with ${physio}` : `Join ${physio} on Rehabify`}
        actions={
          <>
            {page.signedIn.alreadyLinked ? (
              <Link href={DASHBOARD} className={primaryLinkClass}>
                Open my dashboard
              </Link>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  try {
                    await joinSignedIn({ slug })
                    router.replace(DASHBOARD)
                  } catch {
                    setError('We couldn’t add them just now. Please try again.')
                    setBusy(false)
                  }
                }}
                className={primaryLinkClass}
              >
                {busy ? 'Joining…' : 'Accept and start'}
              </button>
            )}
            {error && <p className="text-center text-sm text-rose-600">{error}</p>}
            {!page.signedIn.alreadyLinked && switchAccount}
          </>
        }
      >
        {page.signedIn.alreadyLinked
          ? 'Your exercises, appointments and messages are on your dashboard.'
          : `${name ? `Signed in as ${name}. ` : ''}${physio} will see your progress and can send you exercises and appointments.`}
      </JoinMessage>
    )
  }

  const problemFor = (result: Extract<JoinResult, { ok: false }>) => {
    switch (result.reason) {
      case 'name':
        return { field: 'name' as const, message: result.message ?? 'Enter your first and last name.' }
      case 'phone':
        return { field: 'phone' as const, message: result.message ?? 'Check your phone number.' }
      case 'pin':
        return { field: 'pin' as const, message: result.message ?? 'Pick a different PIN.' }
      case 'phone_taken':
        return {
          field: 'pin' as const,
          message: 'This number already has a Rehabify account. Enter that account’s PIN to add your physio to it.',
        }
      case 'cooldown':
        return { message: `Too many wrong PINs. Try again in ${minutesUntil(result.lockedUntil)} minutes, or ask ${physio} to add you.` }
      case 'locked':
        return { message: `This account is locked after too many wrong PINs. Ask ${physio} to send you a new link on WhatsApp.` }
      case 'busy':
        return { message: `This link has had a lot of sign-ups today. Ask ${physio} to add you instead.` }
      case 'not_found':
        return { message: 'This link isn’t working any more. Ask your physiotherapist for their current link.' }
      default:
        return { message: 'We couldn’t finish just now. Please try again in a minute.' }
    }
  }

  return (
    <AuthShell>
      <SenderRow name={physio} imageUrl={page.physioImageUrl} clinicName={page.clinicName} />
      <StepHeading
        eyebrow="Rehabify"
        title={`Join ${physio} on Rehabify`}
        subtitle="See your exercises, appointments and messages in one place. Enter your details and choose a PIN. No email needed."
      />
      <JoinDetailsForm
        showEmail
        submitLabel="Accept and start"
        onSubmit={async (details) => {
          const result = await join({ slug, ...details })
          if (!result.ok) {
            if (result.reason === 'already_added') {
              setOutcome('already_added')
              return null
            }
            return problemFor(result)
          }
          setOutcome('done')
          if (!result.ticket || !(await finish(result.ticket, { justJoined: !result.existing, to: AFTER_JOIN_PATH }))) setOutcome('manual')
          return null
        }}
      >
        <p className="text-center text-sm text-rh-night/65">
          Already on Rehabify?{' '}
          <Link
            href={`/sign-in?redirect=${encodeURIComponent(`/join/${slug}`)}`}
            className="font-semibold text-rh-teal underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </JoinDetailsForm>
    </AuthShell>
  )
}
