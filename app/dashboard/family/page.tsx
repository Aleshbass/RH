'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { ArrowRight, Link2, Plus, UserPlus } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingBlocks, PageContainer, fieldClass, initials, primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui'
import { CaredForView } from '@/components/family/CaredForView'
import { AddPersonDrawer } from '@/components/family/FamilyDrawers'
import { careRefs } from '@/components/family/refs'
import { cn } from '@/lib/utils'

export default function FamilyHomePage() {
  // useSearchParams needs a Suspense boundary for the static build
  return (
    <Suspense fallback={<LoadingBlocks rows={3} />}>
      <FamilyHome />
    </Suspense>
  )
}

/** "/care-invite/<code>", a full link or just the code, as pasted. */
function inviteCodeFrom(text: string) {
  const trimmed = text.trim()
  const match = trimmed.match(/care-invite\/([A-Za-z0-9]+)/)
  if (match) return match[1]
  return /^[A-Za-z0-9]{10,40}$/.test(trimmed) ? trimmed : null
}

function FamilyHome() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const data = useQuery(careRefs.myCaredFor, {})
  const linkJoy = useMutation(careRefs.linkJoy)
  const [adding, setAdding] = useState(false)
  const linked = useRef(false)

  // Access Joy gave this phone number on WhatsApp moves to this account, once per visit
  useEffect(() => {
    if (linked.current || data === undefined || data === null) return
    linked.current = true
    linkJoy({}).catch(() => undefined)
  }, [data, linkJoy])

  if (data === undefined) {
    return (
      <PageContainer>
        <LoadingBlocks rows={3} />
      </PageContainer>
    )
  }

  const people = data?.people ?? []
  const wanted = searchParams.get('person')
  const selected = people.find((p) => p.patientId === wanted) ?? people[0] ?? null

  const choose = (patientId: Id<'users'>) => {
    const url = new URL(window.location.href)
    url.searchParams.set('person', patientId)
    router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false })
  }

  return (
    <PageContainer>
      {people.length === 0 ? (
        <Welcome firstName={data?.me.firstName ?? null} onAdd={() => setAdding(true)} />
      ) : (
        <>
          {/* Everyone they look after, one tap apart, and "Add someone" */}
            <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
              <div className="flex items-center gap-2" role="tablist" aria-label="People you care for">
                {people.map((person) => {
                  const active = person.patientId === selected?.patientId
                  return (
                    <button
                      key={person.patientId}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => choose(person.patientId)}
                      className={cn(
                        'flex shrink-0 items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition',
                        active ? 'border-pt-primary bg-pt-primary text-pt-on-primary' : 'border-pt-line bg-pt-surface text-pt-ink hover:border-pt-line-strong'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
                          active ? 'bg-pt-accent text-[#06210a]' : 'bg-pt-green-bg text-pt-green-fg'
                        )}
                      >
                        {initials(`${person.firstName} ${person.lastName}`)}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold leading-tight">{person.firstName}</span>
                        <span className={cn('block text-[11px] leading-tight', active ? 'opacity-75' : 'text-pt-muted')}>
                          {person.nextVisitAt ? `Visit ${format(person.nextVisitAt, 'EEE d MMM')}` : person.relationship}
                        </span>
                      </span>
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl border border-dashed border-pt-line-strong px-3.5 text-sm font-medium text-pt-muted transition hover:border-pt-ink/40 hover:text-pt-ink"
                >
                  <Plus className="h-4 w-4" />
                  Add someone
                </button>
              </div>
            </div>
          {selected && <CaredForView key={selected.patientId} patientId={selected.patientId} />}
        </>
      )}

      <AddPersonDrawer open={adding} onOpenChange={setAdding} onAdded={choose} />
    </PageContainer>
  )
}

/** First visit: add the person you arrange care for, or open the invite you were sent. */
function Welcome({ firstName, onAdd }: { firstName: string | null; onAdd: () => void }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const parsed = inviteCodeFrom(code)

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4 sm:py-8">
      <div className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">Family and caregivers</p>
        <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-pt-ink sm:text-[32px]">
          {firstName ? `Welcome, ${firstName}.` : 'Welcome.'} Who are you caring for?
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-pt-muted sm:text-[15px]">
          Follow their visits and progress, check in for them, book and pay, all in one place.
        </p>
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="group flex w-full items-center gap-4 rounded-3xl border border-pt-line bg-pt-surface p-5 text-left shadow-pt transition hover:-translate-y-0.5 hover:shadow-pt-lift dark:shadow-none"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pt-primary text-pt-on-primary">
          <UserPlus className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-pt-ink">Add someone I care for</span>
          <span className="block text-sm text-pt-muted">A parent, child or relative whose care you arrange, even if they don’t use a phone</span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-pt-faint transition-transform group-hover:translate-x-0.5" />
      </button>

      <div className="rounded-3xl border border-pt-line bg-pt-surface p-5 shadow-pt dark:shadow-none">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pt-sunken text-pt-ink">
            <Link2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-[15px] font-semibold text-pt-ink">I was invited</p>
              <p className="text-sm text-pt-muted">Open the link in your message or email, or paste it here.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste your invite link" className={cn(fieldClass, 'h-11')} aria-label="Invite link" />
              <Button className={cn(parsed ? primaryButtonClass : secondaryButtonClass, 'h-11 shrink-0')} disabled={!parsed} onClick={() => parsed && router.push(`/care-invite/${parsed}`)}>
                Open invite
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
