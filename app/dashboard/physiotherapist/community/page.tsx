'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import { ChevronRight, GraduationCap, MessageCircle, Plus, Star } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState, PageContainer, PageSkeleton, Panel, StatusBadge, primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui'
import { RegionChips } from '@/components/exercise-programs/templates'
import { TierBadge } from '@/components/rewards/TierBadge'
import { AskQuestionDrawer, PublishCaseDrawer } from '@/components/community/drawers'
import { LearnRoomsTab } from '@/components/community/LearnRoomsTab'
import { closesLabel, communityRefs, type PostRow } from '@/components/community/refs'
import { cpdHours } from '@/lib/rewards/rules'
import { cn } from '@/lib/utils'

type Tab = 'case' | 'questions' | 'learn' | 'mine'

const BASE = '/dashboard/physiotherapist/community'

function QuestionCard({ p }: { p: PostRow }) {
  return (
    <Link href={`${BASE}/${p._id}`} className="block rounded-3xl border border-pt-line bg-pt-surface p-4 transition hover:bg-pt-hover sm:p-5">
      <p className="text-[15px] font-semibold leading-snug text-pt-ink">{p.title}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-pt-muted">
        <span>
          {p.answerCount} {p.answerCount === 1 ? 'answer' : 'answers'}
        </span>
        {p.helpfulCount > 0 && <span>· {p.helpfulCount} marked helpful</span>}
        {p.bodyRegion && <span>· {p.bodyRegion}</span>}
        {p.needsSenior && <span>· needs a senior view</span>}
        {p.status === 'closed' && <StatusBadge tone="neutral">Answered</StatusBadge>}
      </p>
    </Link>
  )
}

/** Community: Case of the Week, open questions, and your own activity. */
export default function CommunityPage() {
  const home = useQuery(communityRefs.home, {})
  const [tab, setTab] = useState<Tab>('case')
  const [region, setRegion] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const questions = useMemo(() => (home?.questions ?? []).filter((q) => !region || q.bodyRegion === region), [home, region])

  if (home === undefined) return <PageSkeleton />
  if (home === null) {
    return (
      <PageContainer>
        <EmptyState title="Community opens once your account is approved" />
      </PageContainer>
    )
  }
  const c = home.current

  return (
    <PageContainer className="max-w-3xl">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-pt-ink">Community</h1>
        <span className="flex items-center gap-1.5 pb-1 text-sm font-semibold text-pt-green-fg">
          <GraduationCap className="h-4 w-4" />
          CPD this year: {cpdHours(home.me.cpdMinutes)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-full bg-pt-sunken p-1" role="tablist">
        {(
          [
            ['case', 'Case of the Week'],
            ['questions', 'Questions'],
            ['learn', 'Learn'],
            ['mine', 'My activity'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'rounded-full px-2 py-2 text-[13px] font-semibold leading-tight transition sm:text-sm',
              tab === key ? 'bg-pt-surface text-pt-ink shadow-sm' : 'text-pt-muted'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'case' && (
        <div className="space-y-6">
          {c ? (
            <Link href={`${BASE}/${c._id}`} className="block rounded-3xl bg-pt-primary p-6 text-pt-on-primary transition active:scale-[0.99] sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-pt-accent">Case of the Week · #{c.caseNumber}</p>
                <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">{closesLabel(c.closesAt, c.status)}</span>
              </div>
              <p className="mt-4 text-[22px] font-semibold leading-snug sm:text-2xl">{c.title}</p>
              <p className="mt-3 text-[13px] opacity-75">Led by {c.author.name} · anonymised with consent</p>
              <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
                <span>
                  {c.answerCount} {c.answerCount === 1 ? 'answer' : 'answers'}
                </span>
                {c.cpdMinutes ? <span>{cpdHours(c.cpdMinutes)} CPD</span> : null}
                <span>+5 pts</span>
                {c.revealed && <span className="text-pt-accent">Answer revealed</span>}
              </p>
            </Link>
          ) : (
            <Panel>
              <EmptyState icon={<GraduationCap />} title="The first Case of the Week is coming" description="A senior clinician posts an anonymised case each week. Vote, answer and log 1 CPD hour." />
            </Panel>
          )}
          {home.me.canLead && (
            <Button variant="outline" className={cn(secondaryButtonClass, 'h-11 w-full')} onClick={() => setPublishing(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Publish a new case
            </Button>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-pt-ink">Open questions</h2>
              <button type="button" onClick={() => setTab('questions')} className="text-sm font-medium text-pt-muted hover:text-pt-ink">
                See all
              </button>
            </div>
            {home.questions.filter((q) => q.status === 'open').slice(0, 3).map((q) => (
              <QuestionCard key={q._id} p={q} />
            ))}
            {home.questions.length === 0 && <p className="text-sm text-pt-muted">No questions yet. Ask the first one.</p>}
          </section>

          {home.pastCases.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-pt-ink">Past cases</h2>
              <Panel>
                <ul className="divide-y divide-pt-line">
                  {home.pastCases.map((p) => (
                    <li key={p._id}>
                      <Link href={`${BASE}/${p._id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-pt-hover">
                        <span className="w-10 shrink-0 text-sm font-semibold tabular-nums text-pt-faint">#{p.caseNumber}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-pt-ink">{p.title}</span>
                        {p.revealed && <StatusBadge tone="green">Revealed</StatusBadge>}
                        <ChevronRight className="h-4 w-4 text-pt-faint" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            </section>
          )}
        </div>
      )}

      {tab === 'questions' && (
        <div className="space-y-4">
          <Button className={cn(primaryButtonClass, 'h-11 w-full sm:w-auto')} onClick={() => setAsking(true)}>
            <MessageCircle className="mr-1.5 h-4 w-4" />
            Ask a question
          </Button>
          <RegionChips value={region} onChange={setRegion} />
          {questions.length ? (
            <div className="space-y-3">
              {questions.map((q) => (
                <QuestionCard key={q._id} p={q} />
              ))}
            </div>
          ) : (
            <Panel>
              <EmptyState icon={<MessageCircle />} title="No questions here yet" description="Stuck on a case? Ask. Other Rehabify physios answer, and helpful answers earn them points." />
            </Panel>
          )}
        </div>
      )}

      {tab === 'learn' && <LearnRoomsTab />}

      {tab === 'mine' && <MyActivity />}

      <AskQuestionDrawer open={asking} onOpenChange={setAsking} />
      {home.me.canLead && <PublishCaseDrawer open={publishing} onOpenChange={setPublishing} />}
    </PageContainer>
  )
}

function MyActivity() {
  const mine = useQuery(communityRefs.mine, {})
  const tier = useQuery(communityRefs.home, {})
  if (mine === undefined) return <div className="h-40 animate-pulse rounded-3xl bg-pt-sunken" />
  if (!mine) return null
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Answers', mine.answers.length],
          ['Found useful', mine.usefulTotal],
          ['Marked helpful', mine.helpfulTotal],
        ].map(([label, value]) => (
          <div key={label} className="rounded-3xl border border-pt-line bg-pt-surface p-4">
            <p className="text-xs font-medium text-pt-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-pt-ink">{value}</p>
          </div>
        ))}
      </div>
      {tier?.me && (
        <p className="flex items-center gap-2 text-sm text-pt-muted">
          Your badge in Community: <TierBadge tier={tier.me.tierKey} name={tier.me.tierName} />
          <Link href="/dashboard/physiotherapist/me" className="font-medium text-pt-ink underline-offset-4 hover:underline">
            Points
          </Link>
        </p>
      )}
      <Panel title="Your answers">
        {mine.answers.length ? (
          <ul className="divide-y divide-pt-line">
            {mine.answers.map((a) => (
              <li key={a.answerId}>
                <Link href={`${BASE}/${a.postId}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-pt-hover">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-pt-ink">{a.title}</span>
                    <span className="text-xs text-pt-muted">
                      {formatDistanceToNow(a.at, { addSuffix: true })} · {a.usefulCount} found useful
                    </span>
                  </span>
                  {a.helpful && (
                    <StatusBadge tone="green">
                      <Star className="h-3 w-3" /> Helpful
                    </StatusBadge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 pb-6 pt-2 text-sm text-pt-muted">You haven’t answered anything yet.</p>
        )}
      </Panel>
      <Panel title="Your questions">
        {mine.posts.filter((p) => p.kind === 'question').length ? (
          <div className="space-y-3 p-4">
            {mine.posts
              .filter((p) => p.kind === 'question')
              .map((p) => (
                <QuestionCard key={p._id} p={p} />
              ))}
          </div>
        ) : (
          <p className="px-6 pb-6 pt-2 text-sm text-pt-muted">No questions yet.</p>
        )}
      </Panel>
    </div>
  )
}
