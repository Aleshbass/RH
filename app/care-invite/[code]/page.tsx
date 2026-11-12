'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth, useClerk } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Building2, CheckCircle2, HeartPulse, Loader2, Lock, ShieldCheck, Users } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { initials, primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui'
import { careRefs } from '@/components/family/refs'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { RehabifyLoader } from '@/components/brand/RehabifyLoader'

const FAMILY_HOME = '/dashboard/family'

function errorText(err: unknown, fallback: string) {
  const data = (err as { data?: unknown })?.data
  if (typeof data === 'string' && data.trim()) return data
  const message = (err as Error)?.message ?? ''
  return message && !message.includes('Server Error') && !message.includes('[CONVEX') ? message : fallback
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

function PoweredBy() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-xs text-pt-faint">
      Care circle by
      <Image src="/logos/Black%20MainRehabify.svg" alt="Rehabify" width={64} height={16} className="h-3.5 w-auto dark:hidden" unoptimized />
      <Image src="/logos/White%20MainRehabify.svg" alt="Rehabify" width={64} height={16} className="hidden h-3.5 w-auto dark:block" unoptimized />
    </p>
  )
}

function Notice({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <Screen>
      <Card className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-pt-sunken text-pt-muted [&_svg]:h-6 [&_svg]:w-6">{icon}</div>
        <h1 className="text-xl font-semibold tracking-tight text-pt-ink">{title}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-pt-muted">{body}</p>
        {action && <div className="mt-5">{action}</div>}
      </Card>
      <PoweredBy />
    </Screen>
  )
}

/**
 * An invite to someone's care circle: who it's from, who it's for and what they'll be able to
 * do. New people create an account (as a family member, no other choices in the way) and come
 * straight back here; signed-in people accept with one tap.
 */
export default function CareInvitePage() {
  const params = useParams()
  const router = useRouter()
  const code = String(params.code ?? '')
  const { isLoaded, isSignedIn } = useAuth()
  const { signOut } = useClerk()
  const invite = useQuery(careRefs.getInvite, code ? { code } : 'skip')
  const accept = useMutation(careRefs.acceptInvite)
  const [accepting, setAccepting] = useState(false)
  const back = `/care-invite/${code}`

  // Already accepted (e.g. coming back after signing up): straight to their view
  useEffect(() => {
    if (invite?.alreadyIn && invite.status === 'accepted') router.replace(FAMILY_HOME)
  }, [invite, router])

  if (!isLoaded || invite === undefined) {
    return (
      <Screen>
        <Card className="flex items-center justify-center py-16">
          <RehabifyLoader size={56} />
        </Card>
      </Screen>
    )
  }

  if (invite === null) {
    return <Notice icon={<Lock />} title="This link isn't valid" body="Check you opened the whole link from your message or email, or ask for a new invite." />
  }
  if (invite.status === 'cancelled') {
    return <Notice icon={<Lock />} title="This invite was cancelled" body={`Ask ${invite.inviterName} to send you a new one.`} />
  }
  if (invite.status === 'expired') {
    return <Notice icon={<Lock />} title="This invite has expired" body={`Invites work for 14 days. Ask ${invite.inviterName} to send you a new one.`} />
  }
  if (invite.isThePatient) {
    return (
      <Notice
        icon={<Users />}
        title="This invite is for someone else"
        body={`It's for ${invite.name}, to help with your care. Send them the link, or sign out if you're opening it for them on this phone.`}
        action={
          <Button className={cn(secondaryButtonClass, 'w-full')} onClick={() => void signOut({ redirectUrl: back })}>
            Sign out
          </Button>
        }
      />
    )
  }
  if (invite.alreadyIn) {
    return (
      <Notice
        icon={<CheckCircle2 />}
        title={`You're already in ${invite.patientFirstName}'s care circle`}
        body="Everything is waiting for you."
        action={
          <Button asChild className={cn(primaryButtonClass, 'h-11 w-full')}>
            <Link href={FAMILY_HOME}>Open {invite.patientFirstName}&apos;s care</Link>
          </Button>
        }
      />
    )
  }
  if (invite.status === 'accepted') {
    return <Notice icon={<Lock />} title="This invite has been used" body={`Ask ${invite.inviterName} to send you a new one.`} />
  }

  const signUpHref = `/sign-up?as=family&redirect_url=${encodeURIComponent(back)}`
  const signInHref = `/sign-in?as=family&redirect_url=${encodeURIComponent(back)}`

  const onAccept = async () => {
    setAccepting(true)
    try {
      await accept({ code })
      playSound('approve')
      toast.success(`You're in ${invite.patientFirstName}'s care circle`)
      router.replace(FAMILY_HOME)
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Could not accept the invite. Please try again.'))
      setAccepting(false)
    }
  }

  const abilities = [
    'Their visits, care plan and progress',
    invite.access !== 'view' ? 'Ask for visits and pay their bills' : null,
    invite.access === 'full' ? 'Message their physio or clinic' : null,
  ].filter((item): item is string => Boolean(item))

  return (
    <Screen>
      <Card>
        <div className="flex items-center gap-3">
          {invite.clinic ? (
            invite.clinic.logoUrl ? (
              // A clinic's own logo, from wherever they uploaded it
              <Image src={invite.clinic.logoUrl} alt="" width={56} height={56} unoptimized className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-pt-primary text-pt-on-primary">
                <Building2 className="h-6 w-6" />
              </span>
            )
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-pt-green-bg text-lg font-semibold text-pt-green-fg">
              {initials(invite.patientName)}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-pt-faint">Care circle invite</p>
            <p className="truncate text-sm text-pt-muted">From {invite.inviterName}</p>
          </div>
        </div>

        <h1 className="mt-5 text-[22px] font-semibold leading-snug tracking-tight text-pt-ink">
          {invite.fromPatient
            ? `${invite.patientFirstName} would like your help with their care`
            : `Help with ${invite.patientFirstName}'s care`}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-pt-muted">
          {invite.name.split(' ')[0]}, you&apos;ve been added as {invite.patientFirstName}&apos;s {invite.relationship.toLowerCase()}. You&apos;ll see:
        </p>

        <ul className="mt-4 space-y-2.5">
          {abilities.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-pt-ink">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-pt-green-fg" />
              {item}
            </li>
          ))}
          <li className="flex items-start gap-2.5 text-sm text-pt-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Never their private clinical notes. They can change or end your access at any time.
          </li>
        </ul>

        <div className="mt-6 space-y-2.5">
          {isSignedIn ? (
            <Button className={cn(primaryButtonClass, 'h-12 w-full text-[15px]')} disabled={accepting} onClick={() => void onAccept()}>
              {accepting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HeartPulse className="mr-2 h-4 w-4" />}
              Accept and open {invite.patientFirstName}&apos;s care
            </Button>
          ) : (
            <>
              <Button asChild className={cn(primaryButtonClass, 'h-12 w-full text-[15px]')}>
                <Link href={signUpHref}>Create my account</Link>
              </Button>
              <Button asChild className={cn(secondaryButtonClass, 'h-11 w-full')}>
                <Link href={signInHref}>I already have an account</Link>
              </Button>
              {invite.maskedEmail && <p className="pt-1 text-center text-xs text-pt-faint">Sent to {invite.maskedEmail}</p>}
            </>
          )}
        </div>
      </Card>
      <PoweredBy />
    </Screen>
  )
}
