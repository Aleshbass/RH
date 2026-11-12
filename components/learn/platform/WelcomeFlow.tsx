'use client'

/**
 * /welcome on Learn: where a new account lands after sign-up, and "Edit learner details" later.
 * Rehabify physios, clinic owners and teams are recognised from their account and skip it.
 * Anyone else says once who they are (self-declared, owner 2026-11-12), which sets their tag.
 */

import { useState, type ComponentType, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, ArrowUpRight, Building2, Check, GraduationCap, Loader2, Stethoscope, User } from '@/components/icons'
import { PHYSIO_SCHOOLS, STUDENT_LEVELS, type LearnerKind } from '@/lib/learn/catalog'
import { cn } from '@/lib/utils'
import { displayFont, fieldClass, pillInk, pillOutline } from '../shared'
import { TagBadge, useLearnerIdentity } from './identity'
import { learnPath, learnPlatformApi, learnSignInHref, learnSignUpHref, mainSiteUrl, WELCOME_PATH, type SignedInLearner } from './learnApi'

type Choice = LearnerKind | 'clinic'

const CHOICES: { id: Choice; icon: ComponentType<{ className?: string }>; title: string; body: string }[] = [
  { id: 'student', icon: GraduationCap, title: "I'm a physiotherapy student", body: 'Courses for where you are now, and a path into Rehabify when you qualify.' },
  { id: 'physio', icon: Stethoscope, title: "I'm a physiotherapist", body: 'Grow your clinical skills and earn certificates.' },
  { id: 'clinic', icon: Building2, title: 'I own or manage a clinic', body: 'Set up your clinic on Rehabify, then learn with your team.' },
  { id: 'other', icon: User, title: 'Something else', body: 'Another health or fitness professional.' },
]

function errorText(error: unknown) {
  const data = (error as { data?: unknown })?.data
  return typeof data === 'string' ? data : 'Something went wrong. Please try again.'
}

function Frame({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">{children}</main>
}

function Done({ identity }: { identity: SignedInLearner }) {
  const student = identity.profile?.kind === 'student'
  return (
    <Frame>
      <div className="rounded-[2rem] bg-rh-cream p-7 text-center sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rh-ink text-rh-lime">
          <Check className="h-6 w-6" />
        </span>
        <h1 className={cn('mt-6 text-[30px] leading-tight tracking-tight text-rh-ink sm:text-[36px]', displayFont)}>
          {identity.firstName ? `You're all set, ${identity.firstName}` : "You're all set"}
        </h1>
        <div className="mt-3 flex flex-col items-center gap-1.5">
          <TagBadge tag={identity.tag} />
          {identity.tag.detail && <p className="text-sm text-rh-ink/55">{identity.tag.detail}</p>}
        </div>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-6 text-rh-ink/65">
          {identity.tag.kind === 'rehabify_physio'
            ? 'Your Rehabify physio account is linked. Member prices apply automatically.'
            : identity.tag.kind === 'clinic_owner' || identity.tag.kind === 'clinic_team'
              ? 'Your Rehabify clinic account is linked.'
              : student
                ? 'Your account now shows you as a physio student.'
                : 'Your account is ready.'}
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={student ? `${learnPath('/courses')}?category=students` : learnPath('/courses')} className={cn(pillInk, 'h-12 px-7')}>
            {student ? 'Courses for students' : 'Browse courses'} <ArrowRight className="h-4 w-4" />
          </Link>
          {identity.profile && (
            <Link href={`${WELCOME_PATH}?edit=1`} className={cn(pillOutline, 'h-12 px-7')}>
              Edit my details
            </Link>
          )}
        </div>
      </div>
      {identity.canJoinAsClinician && identity.profile?.kind === 'physio' && (
        <a
          href={mainSiteUrl('/role-selection?as=physiotherapist')}
          className="mt-4 flex items-center justify-between gap-4 rounded-[1.5rem] bg-rh-ink p-5 text-white transition hover:bg-black sm:p-6"
        >
          <span>
            <span className="block font-semibold">Practise with Rehabify</span>
            <span className="mt-0.5 block text-sm text-white/65">Join as a physio to see patients, and get member prices on Learn.</span>
          </span>
          <ArrowUpRight className="h-5 w-5 shrink-0 text-rh-lime" />
        </a>
      )}
    </Frame>
  )
}

function StudentFields({
  school,
  setSchool,
  level,
  setLevel,
  year,
  setYear,
}: {
  school: string
  setSchool: (v: string) => void
  level: string
  setLevel: (v: string) => void
  year: string
  setYear: (v: string) => void
}) {
  const thisYear = new Date().getFullYear()
  const years = Array.from({ length: 8 }, (_, i) => thisYear + i - 1)
  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="learn-school" className="text-sm font-semibold text-rh-ink">
          School
        </label>
        <input
          id="learn-school"
          list="learn-schools"
          value={school}
          onChange={(e) => setSchool(e.target.value)}
          placeholder="Start typing your university"
          className={cn(fieldClass, 'mt-2')}
          autoComplete="organization"
          required
        />
        <datalist id="learn-schools">
          {PHYSIO_SCHOOLS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold text-rh-ink">Level</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {STUDENT_LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              aria-pressed={level === l}
              className={cn(
                'h-10 rounded-full px-4 text-sm font-semibold transition',
                level === l ? 'bg-rh-ink text-white' : 'border border-rh-ink/10 bg-white text-rh-ink hover:border-rh-ink/30'
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="learn-grad" className="text-sm font-semibold text-rh-ink">
          Expected graduation <span className="font-normal text-rh-ink/45">(optional)</span>
        </label>
        <select id="learn-grad" value={year} onChange={(e) => setYear(e.target.value)} className={cn(fieldClass, 'mt-2')}>
          <option value="">Choose a year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function Chooser({ identity, editing, onSaved }: { identity: SignedInLearner; editing: boolean; onSaved: () => void }) {
  const save = useMutation(learnPlatformApi.saveProfile)
  const profile = identity.profile
  const [choice, setChoice] = useState<Choice | null>(editing && profile ? profile.kind : null)
  const [school, setSchool] = useState(profile?.school ?? '')
  const [level, setLevel] = useState(profile?.studentLevel ?? '')
  const [year, setYear] = useState(profile?.graduationYear ? String(profile.graduationYear) : '')
  const [profession, setProfession] = useState(profile?.profession ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!choice || choice === 'clinic') return
    setError(null)
    setBusy(true)
    try {
      await save(
        choice === 'student'
          ? { kind: 'student', school, studentLevel: level, graduationYear: year ? Number(year) : undefined }
          : choice === 'other'
            ? { kind: 'other', profession }
            : { kind: 'physio' }
      )
      toast.success('Saved')
      // The identity query updates and this page shows the Done screen
      onSaved()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  if (!choice) {
    return (
      <Frame>
        <h1 className={cn('text-[32px] leading-tight tracking-tight text-rh-ink sm:text-[40px]', displayFont)}>
          {identity.firstName ? `Welcome, ${identity.firstName}` : 'Welcome to Rehabify Learn'}
        </h1>
        <p className="mt-3 text-[16px] text-rh-ink/60">Which best describes you? It sets the tag on your account and the prices you see.</p>
        <div className="mt-8 grid gap-3">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChoice(c.id)}
              className="group flex items-center gap-4 rounded-[1.5rem] border border-rh-ink/10 bg-white p-4 text-left transition hover:border-rh-ink/30 hover:bg-rh-cream/50 sm:p-5"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rh-cream text-rh-ink transition group-hover:bg-rh-ink group-hover:text-rh-lime">
                <c.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-rh-ink">{c.title}</span>
                <span className="mt-0.5 block text-sm text-rh-ink/60">{c.body}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-rh-ink/40 transition group-hover:translate-x-0.5 group-hover:text-rh-ink" />
            </button>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-rh-ink/50">
          <Link href={learnPath('/courses')} className="font-semibold text-rh-ink/70 hover:text-rh-ink hover:underline">
            Skip for now
          </Link>
        </p>
      </Frame>
    )
  }

  const back = (
    <button type="button" onClick={() => setChoice(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-rh-ink/60 hover:text-rh-ink">
      <ArrowLeft className="h-4 w-4" /> Back
    </button>
  )

  if (choice === 'clinic') {
    return (
      <Frame>
        {back}
        <h1 className={cn('mt-6 text-[30px] leading-tight tracking-tight text-rh-ink sm:text-[36px]', displayFont)}>Set up your clinic on Rehabify</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-rh-ink/60">
          {identity.canJoinAsClinician
            ? "Clinic accounts are created on Rehabify. You stay signed in, and when you come back to Learn your clinic shows on your account."
            : 'This account is already set up for something else on Rehabify. To learn as a clinic, sign in with your clinic account, or email support@physioaroundme.com.'}
        </p>
        {identity.canJoinAsClinician && (
          <a href={mainSiteUrl('/role-selection?as=clinic_owner')} className={cn(pillInk, 'mt-8 h-12 px-7')}>
            Set up my clinic <ArrowUpRight className="h-4 w-4" />
          </a>
        )}
      </Frame>
    )
  }

  const ready =
    choice === 'student' ? Boolean(school.trim() && level) : choice === 'other' ? Boolean(profession.trim()) : true

  return (
    <Frame>
      {back}
      <form onSubmit={submit} className="mt-6">
        <h1 className={cn('text-[30px] leading-tight tracking-tight text-rh-ink sm:text-[36px]', displayFont)}>
          {choice === 'student' ? 'Tell us about your studies' : choice === 'physio' ? 'Great, a physiotherapist' : 'What do you do?'}
        </h1>
        <div className="mt-8">
          {choice === 'student' && (
            <StudentFields school={school} setSchool={setSchool} level={level} setLevel={setLevel} year={year} setYear={setYear} />
          )}
          {choice === 'other' && (
            <div>
              <label htmlFor="learn-profession" className="text-sm font-semibold text-rh-ink">
                Your profession
              </label>
              <input
                id="learn-profession"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="e.g. Fitness coach, nurse, sports scientist"
                className={cn(fieldClass, 'mt-2')}
                required
              />
            </div>
          )}
          {choice === 'physio' && (
            <p className="text-[16px] leading-relaxed text-rh-ink/65">
              Your account will show you as a physiotherapist.{' '}
              {identity.canJoinAsClinician
                ? 'If you also want to see patients through Rehabify, you can join as a physio next. Approved Rehabify physios get member prices on Learn.'
                : ''}
            </p>
          )}
        </div>
        {error && <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
        <button type="submit" disabled={!ready || busy} className={cn(pillInk, 'mt-8 h-12 w-full sm:w-auto sm:px-10')}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
      </form>
    </Frame>
  )
}

export function WelcomeFlow() {
  const identity = useLearnerIdentity()
  const router = useRouter()
  const editing = useSearchParams().get('edit') === '1'

  if (identity === undefined) {
    return (
      <Frame>
        <div className="h-10 w-2/3 animate-pulse rounded-full bg-rh-ink/[0.07]" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-[1.5rem] bg-rh-ink/[0.05]" />
          ))}
        </div>
      </Frame>
    )
  }

  if (!identity.signedIn) {
    return (
      <Frame>
        <div className="rounded-[2rem] bg-rh-cream p-7 text-center sm:p-10">
          <h1 className={cn('text-[30px] leading-tight tracking-tight text-rh-ink', displayFont)}>Join Rehabify Learn</h1>
          <p className="mx-auto mt-3 max-w-sm text-[15px] text-rh-ink/60">Create a free account, or sign in with your Rehabify account.</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={learnSignUpHref(WELCOME_PATH)} className={cn(pillInk, 'h-12 px-7')}>
              Join for free
            </Link>
            <Link href={learnSignInHref(WELCOME_PATH)} className={cn(pillOutline, 'h-12 px-7')}>
              Sign in
            </Link>
          </div>
        </div>
      </Frame>
    )
  }

  // Recognised from their Rehabify account, or already told us (and not editing)
  if (!identity.needsWelcome && !(editing && identity.profile)) return <Done identity={identity} />
  return <Chooser key={editing ? 'edit' : 'new'} identity={identity} editing={editing} onSaved={() => editing && router.replace(WELCOME_PATH)} />
}
