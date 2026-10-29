'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth, useClerk, useUser } from '@clerk/nextjs'
import { useRouter, useParams } from 'next/navigation'
import { toast } from 'sonner'
import { Building2, CheckCircle2, Loader2, Lock, ShieldCheck } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { accentButtonClass, initials, primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui'
import { useValidateInvitationCode } from '@/lib/api/patientInvitations'
import { usePatientOnboardingAction } from '@/lib/onboardingHelpers'
import {
  HEALTH_DATA_CONSENT_TEXT,
  HEALTH_DATA_TRANSFER_HREF,
  PATIENT_CONSENT_POLICIES,
  POLICIES,
  policyVersions,
} from '@/lib/policies'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const PENDING_INVITE_KEY = 'rehabify_pending_invite'
const PATIENT_HOME = '/dashboard/patient'

type Invitation = {
  code: string
  maskedEmail: string | null
  patientName?: string
  invitedByClinic: boolean
}
type Physio = { firstName?: string; lastName?: string; imageUrl?: string }
type Clinic = { name: string; logoUrl: string | null; city: string | null; phone: string | null }

const link = 'font-medium text-pt-ink underline underline-offset-2 hover:opacity-80'

/** Rehabify wordmark, small: the clinic leads, Rehabify is the platform underneath. */
function PoweredBy() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-xs text-pt-faint">
      Patient portal by
      <Image src="/logos/Black%20MainRehabify.svg" alt="Rehabify" width={64} height={16} className="h-3.5 w-auto dark:hidden" />
      <Image src="/logos/White%20MainRehabify.svg" alt="Rehabify" width={64} height={16} className="hidden h-3.5 w-auto dark:block" />
    </p>
  )
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-pt-canvas px-4 py-10 text-pt-ink">
      <div className="w-full max-w-md space-y-5">{children}</div>
    </main>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn('rounded-3xl border border-pt-line bg-pt-surface p-6 shadow-pt dark:shadow-none sm:p-7', className)}>{children}</section>
}

/** Who invited them: the clinic first (with their clinician), or the independent physio. */
function InviterHeader({ clinic, physio }: { clinic: Clinic | null; physio: Physio | null }) {
  const physioName = [physio?.firstName, physio?.lastName].filter(Boolean).join(' ') || 'Your physiotherapist'
  if (clinic) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          {clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clinic.logoUrl} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-pt-primary text-pt-on-primary">
              <Building2 className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-pt-faint">Your patient portal</p>
            <h1 className="truncate text-xl font-semibold tracking-tight">{clinic.name}</h1>
            {clinic.city && <p className="text-sm text-pt-muted">{clinic.city}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-pt-sunken p-3">
          <Avatar className="h-10 w-10 rounded-xl">
            <AvatarImage src={physio?.imageUrl} alt="" />
            <AvatarFallback className="rounded-xl bg-pt-green-bg text-xs font-semibold text-pt-green-fg">{initials(physioName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-xs text-pt-muted">Your physiotherapist</p>
            <p className="truncate text-sm font-semibold">{physioName}</p>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-14 w-14 rounded-2xl">
        <AvatarImage src={physio?.imageUrl} alt="" />
        <AvatarFallback className="rounded-2xl bg-pt-green-bg text-base font-semibold text-pt-green-fg">{initials(physioName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-pt-faint">Your patient portal</p>
        <h1 className="truncate text-xl font-semibold tracking-tight">{physioName}</h1>
        <p className="text-sm text-pt-muted">Physiotherapist</p>
      </div>
    </div>
  )
}

/**
 * A clinic's or physio's invitation to their patient portal (/patient-invite/<code>). It shows who
 * invited them, then creates or signs in to the account (patient only, no other Rehabify options)
 * and links it: their name and their consent in one step, so the dashboard opens straight away.
 */
export default function PatientInvitePage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string

  const { isLoaded, isSignedIn } = useAuth()
  const { signOut } = useClerk()
  const { user } = useUser()
  const completePatientOnboarding = usePatientOnboardingAction()

  const { isLoading, isValid, invitation, physiotherapist, clinic, message } = useValidateInvitationCode(code || null)
  const invite = (invitation ?? null) as Invitation | null
  const physio = (physiotherapist ?? null) as Physio | null
  const theClinic = (clinic ?? null) as Clinic | null
  const inviterName = theClinic?.name ?? ([physio?.firstName, physio?.lastName].filter(Boolean).join(' ') || 'your physiotherapist')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreeHealth, setAgreeHealth] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  // Remember a live invitation so DashboardAuthGuard can bring a new account back here after
  // sign-up; forget a dead one so it can't keep redirecting this browser
  useEffect(() => {
    if (!code || isLoading) return
    if (isValid) localStorage.setItem(PENDING_INVITE_KEY, code)
    else localStorage.removeItem(PENDING_INVITE_KEY)
  }, [code, isValid, isLoading])

  // The name the clinic typed (they can change it), else the one on their sign-in account
  useEffect(() => {
    if (firstName || lastName) return
    const [first = '', ...rest] = (invite?.patientName ?? '').trim().split(/\s+/)
    setFirstName(first || user?.firstName || '')
    setLastName(rest.join(' ') || user?.lastName || '')
  }, [invite?.patientName, user?.firstName, user?.lastName, firstName, lastName])

  const alreadyAccepted = !isValid && message.toLowerCase().includes('already been accepted')
  useEffect(() => {
    if (alreadyAccepted && isSignedIn) router.replace(PATIENT_HOME)
  }, [alreadyAccepted, isSignedIn, router])

  const back = encodeURIComponent(`/patient-invite/${code}`)
  const signUpHref = `/sign-up?as=patient&redirect_url=${back}`
  const signInHref = `/sign-in?redirect_url=${back}`

  const accept = async () => {
    if (!user) return
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('Add your first and last name.')
      return
    }
    if (!agreeTerms || !agreeHealth) {
      toast.error('Tick both boxes to continue.')
      return
    }
    setAccepting(true)
    try {
      const result = await completePatientOnboarding({
        invitationCode: code,
        patientData: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? '',
          phoneNumber: user.phoneNumbers[0]?.phoneNumber || undefined,
          acceptedPolicies: policyVersions(PATIENT_CONSENT_POLICIES),
        },
      })
      if (result?.success) {
        localStorage.removeItem(PENDING_INVITE_KEY)
        playSound('success')
        router.replace(PATIENT_HOME)
        return
      }
      // Wrong account or email: don't let this browser keep coming back to the invite
      localStorage.removeItem(PENDING_INVITE_KEY)
      setAcceptError(result?.message || 'We couldn’t accept this invitation.')
    } catch (error) {
      setAcceptError(error instanceof Error ? error.message : 'We couldn’t accept this invitation. Please try again.')
    } finally {
      setAccepting(false)
    }
  }

  if (!isLoaded || isLoading || (alreadyAccepted && isSignedIn)) {
    return (
      <Screen>
        <Card className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-pt-muted" />
        </Card>
      </Screen>
    )
  }

  if (!isValid || !invite) {
    return (
      <Screen>
        <Card className="space-y-4 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-pt-sunken">
            <Lock className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">{alreadyAccepted ? 'You’re already set up' : 'This link doesn’t work any more'}</h1>
            <p className="text-sm text-pt-muted">
              {alreadyAccepted
                ? 'Sign in to open your patient portal.'
                : message.toLowerCase().includes('expired')
                  ? 'It has expired. Ask your clinic or physiotherapist to send a new one.'
                  : 'Check you opened the latest email, or ask your clinic or physiotherapist to send a new link.'}
            </p>
          </div>
          <Button asChild className={cn(primaryButtonClass, 'h-11 w-full')}>
            <Link href={alreadyAccepted ? `/sign-in?redirect_url=${encodeURIComponent(PATIENT_HOME)}` : '/'}>
              {alreadyAccepted ? 'Sign in' : 'Go to Rehabify'}
            </Link>
          </Button>
        </Card>
      </Screen>
    )
  }

  if (acceptError) {
    return (
      <Screen>
        <Card className="space-y-4">
          <InviterHeader clinic={theClinic} physio={physio} />
          <div className="rounded-2xl bg-pt-rose-bg p-4 text-sm text-pt-rose-fg">{acceptError}</div>
          <div className="grid gap-2">
            <Button onClick={() => signOut({ redirectUrl: `/patient-invite/${code}` })} className={cn(primaryButtonClass, 'h-11')}>
              Sign out and use another account
            </Button>
            <Button asChild variant="outline" className={cn(secondaryButtonClass, 'h-11')}>
              <Link href="/dashboard">Go to my dashboard</Link>
            </Button>
          </div>
        </Card>
        <PoweredBy />
      </Screen>
    )
  }

  return (
    <Screen>
      <Card className="space-y-6">
        <InviterHeader clinic={theClinic} physio={physio} />

        <p className="text-sm leading-relaxed text-pt-muted">
          {theClinic ? `${theClinic.name} uses Rehabify for your physiotherapy.` : `${inviterName} uses Rehabify for your physiotherapy.`}{' '}
          Your appointments, home exercises and messages{theClinic ? ' with the clinic' : ''} are all in one place.
        </p>

        {!isSignedIn ? (
          <div className="space-y-3">
            <Button asChild className={cn(accentButtonClass, 'h-12 w-full text-base')}>
              <Link href={signUpHref}>Create your account</Link>
            </Button>
            <Button asChild variant="outline" className={cn(secondaryButtonClass, 'h-11 w-full')}>
              <Link href={signInHref}>I already have an account</Link>
            </Button>
            {invite.maskedEmail && (
              <p className="text-center text-xs text-pt-faint">
                Use the email this invitation was sent to ({invite.maskedEmail}).
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Your name</p>
              <p className="-mt-1 text-xs text-pt-muted">This is how {theClinic ? 'the clinic' : 'your physiotherapist'} will see you.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-first" className="text-xs text-pt-muted">First name</Label>
                  <Input id="invite-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" className="h-11 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-last" className="text-xs text-pt-muted">Last name</Label>
                  <Input id="invite-last" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" className="h-11 rounded-xl" />
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-pt-sunken p-4 text-sm leading-relaxed">
                <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#00cd0f]" />
                <span>
                  I agree to the{' '}
                  <a href={POLICIES.terms.href} target="_blank" rel="noopener noreferrer" className={link}>Terms of Service</a>{' '}
                  and the{' '}
                  <a href={POLICIES.privacy.href} target="_blank" rel="noopener noreferrer" className={link}>Privacy Policy</a>.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-pt-sunken p-4 text-sm leading-relaxed">
                <input type="checkbox" checked={agreeHealth} onChange={(e) => setAgreeHealth(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#00cd0f]" />
                <span>
                  {HEALTH_DATA_CONSENT_TEXT}{' '}
                  <a href={POLICIES.health_data.href} target="_blank" rel="noopener noreferrer" className={link}>How we use it</a>
                  {' · '}
                  <a href={HEALTH_DATA_TRANSFER_HREF} target="_blank" rel="noopener noreferrer" className={link}>Transfers outside Nigeria</a>
                </span>
              </label>
            </div>

            <Button onClick={() => void accept()} disabled={accepting || !agreeTerms || !agreeHealth} className={cn(accentButtonClass, 'h-12 w-full text-base')}>
              {accepting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Accept and open my portal
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-pt-faint">
              <ShieldCheck className="h-3.5 w-3.5" />
              Your health information is only shared with your care team.
            </p>
          </div>
        )}
      </Card>
      <PoweredBy />
    </Screen>
  )
}
