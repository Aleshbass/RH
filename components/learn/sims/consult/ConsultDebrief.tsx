'use client'

/**
 * The debrief after "talk to the patient": coaching like a senior physio would give it. Your own
 * words quoted back with a better line to try, what the patient held back and why, the questions an
 * expert would have asked, how you explained the plan, your note beside a model note, a model
 * consultation, and your skills. This is the part learners pay for, so it leads with the coaching.
 */

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Eye,
  Lightbulb,
  Loader2,
  Lock,
  MessageCircle,
  Quote,
  RotateCcw,
  Stethoscope,
  X,
  XCircle,
} from '@/components/icons'
import { cn } from '@/lib/utils'
import { displayFont, pillInk, pillLime, pillOutline } from '../../shared'
import { attemptPath, DISCLAIMER, errorText, noteServerTime, simApi, SIMULATIONS_PATH, type ConsultDebriefView, type SimDebriefView } from '../simApi'
import { unlockSimAudio } from '../simAudio'
import { OUTCOME_TONE, PlayerFrame } from '../v2/parts'

const SIGNAL_CHIPS: Record<string, { label: string; good: boolean }> = {
  open: { label: 'Open question', good: true },
  empathy: { label: 'Empathy', good: true },
  plain: { label: 'Plain words', good: true },
  checks: { label: 'Checked understanding', good: true },
  jargon: { label: 'Jargon', good: false },
  dismissive: { label: 'Brushed off', good: false },
  rude: { label: 'Rude', good: false },
  stacked: { label: 'Too many questions at once', good: false },
}

function Section({ title, kicker, children, className }: { title: string; kicker?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[24px] bg-white p-4 shadow-sm sm:p-5', className)}>
      {kicker && <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-rh-ink/45">{kicker}</p>}
      <h2 className={cn('text-[20px] leading-tight tracking-tight text-rh-ink', displayFont)}>{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Fold({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-[24px] bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-5" aria-expanded={open}>
        <span className={cn('text-[18px] leading-tight tracking-tight text-rh-ink', displayFont)}>{title}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-rh-ink/50 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-5 sm:px-5">{children}</div>}
    </section>
  )
}

function ScoreRing({ pct, passed }: { pct: number; passed: boolean }) {
  const r = 42
  const len = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" role="img" aria-label={`Score ${pct}%`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="9" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={passed ? '#c6f432' : '#fbbf24'}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * len} ${len}`}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="24" fontWeight="700">
        {pct}%
      </text>
    </svg>
  )
}

function Bar({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-rh-ink">{label}</span>
        <span className="font-mono text-rh-ink/60 tabular-nums">{value}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-rh-ink/[0.07]">
        <div className={cn('h-full rounded-full', value >= 70 ? 'bg-rh-lime' : value >= 50 ? 'bg-amber-300' : 'bg-rose-400')} style={{ width: `${value}%` }} />
      </div>
      <p className="mt-1 text-xs text-rh-ink/50">{hint}</p>
    </div>
  )
}

/** Five skills as a radar (0–100 each). */
function SkillsRadar({ skills }: { skills: ConsultDebriefView['skills'] }) {
  const axes: { key: keyof ConsultDebriefView['skills']; label: string }[] = [
    { key: 'history', label: 'History' },
    { key: 'safety', label: 'Safety' },
    { key: 'reasoning', label: 'Reasoning' },
    { key: 'documentation', label: 'Notes' },
    { key: 'communication', label: 'Talking' },
  ]
  const cx = 120
  const cy = 112
  const R = 78
  const at = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
    return [cx + Math.cos(a) * R * (v / 100), cy + Math.sin(a) * R * (v / 100)] as const
  }
  const ring = (v: number) => axes.map((_, i) => at(i, v).join(',')).join(' ')
  const shape = axes.map((a, i) => at(i, Math.max(4, skills[a.key])).join(',')).join(' ')
  return (
    <svg viewBox="0 0 240 205" className="mx-auto w-full max-w-[320px]" role="img" aria-label={axes.map((a) => `${a.label} ${skills[a.key]}%`).join(', ')}>
      {[25, 50, 75, 100].map((v) => (
        <polygon key={v} points={ring(v)} fill="none" stroke="rgb(11 19 18 / 0.08)" strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = at(i, 100)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgb(11 19 18 / 0.08)" />
      })}
      <polygon points={shape} fill="rgb(198 244 50 / 0.45)" stroke="#0b1312" strokeWidth="2" strokeLinejoin="round" />
      {axes.map((a, i) => {
        const [x, y] = at(i, 128)
        return (
          <text key={a.key} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill="#0b1312">
            {a.label} <tspan fontWeight="500" fill="rgb(11 19 18 / 0.55)">{skills[a.key]}</tspan>
          </text>
        )
      })}
    </svg>
  )
}

/** Trust over the conversation, from where it started. */
function TrustLine({ start, log }: { start: number; log: number[] }) {
  const values = [start, ...log]
  if (values.length < 2) return null
  const w = 300
  const h = 70
  const x = (i: number) => (i / (values.length - 1)) * (w - 8) + 4
  const y = (v: number) => h - 6 - (v / 100) * (h - 12)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const end = values[values.length - 1]
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[70px] w-full" preserveAspectRatio="none" aria-hidden>
        <line x1="0" x2={w} y1={y(10)} y2={y(10)} stroke="rgb(244 63 94 / 0.35)" strokeDasharray="4 4" />
        <path d={d} fill="none" stroke="#0b1312" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-1 text-xs text-rh-ink/55">
        Trust {start} → {Math.round(end)} over {log.length} messages. The dashed line is where patients walk out.
      </p>
    </div>
  )
}

export function ConsultDebrief({ data }: { data: SimDebriefView }) {
  const router = useRouter()
  const start = useMutation(simApi.start)
  const [busy, setBusy] = useState<null | 'consult' | 'classic'>(null)
  const d = data.consult!
  const c = data.case
  const first = d.patientFirstName
  const he = c.patient.sex === 'F' ? 'she' : 'he'
  const scores = d.scores
  const passed = data.passed
  const decisions = data.debrief.timeline.filter((t) => t.phase !== 'subjective' && t.costSec > 0)
  // What the patient held back has its own card
  const missed = d.missedQuestions.filter((q) => !q.heldBack)

  const again = async (mode: 'consult' | 'classic') => {
    unlockSimAudio()
    setBusy(mode)
    try {
      const res = await start({ slug: c.slug, preview: data.preview || undefined, mode: mode === 'consult' ? 'consult' : undefined })
      noteServerTime(res.serverNow)
      router.replace(attemptPath(c.slug, res.attemptId))
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t start the case. Try again.'))
      setBusy(null)
    }
  }

  return (
    <PlayerFrame>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Result */}
        <div className="learn-fixed-dark bg-[rgb(8_16_15)] px-5 pb-6 pt-5 text-white">
          <div className="flex items-center justify-between">
            <Link href={SIMULATIONS_PATH} className="text-xs font-semibold text-white/60 hover:text-white">
              ← Simulations
            </Link>
            {data.preview && <span className="rounded-full bg-amber-300 px-2.5 py-1 text-[11px] font-bold text-[#3b2a00]">Preview · not counted</span>}
          </div>
          <div className="mt-4 flex items-center gap-4">
            <ScoreRing pct={scores.overall} passed={passed} />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Your consultation with {first}</p>
              <p className={cn('mt-1 text-[26px] leading-tight tracking-tight', displayFont)}>{passed ? 'Passed' : 'Not yet'}</p>
              <p className="mt-1 text-[13px] leading-5 text-white/60">
                {data.best > 0 ? `Your best: ${data.best}%` : ''}
                {data.average !== null ? `${data.best > 0 ? ' · ' : ''}Average: ${data.average}%` : ''}
              </p>
            </div>
          </div>
          <div className="mt-5 overflow-hidden rounded-[20px] bg-white text-rh-ink">
            <p className={cn('px-4 py-2 text-xs font-bold', OUTCOME_TONE[d.ending.outcome])}>{d.ending.title}</p>
            <p className="px-4 py-3 text-[14px] leading-6 text-rh-ink/75">{d.ending.summary}</p>
          </div>
          {!passed && (d.ending.outcome === 'good' || d.ending.outcome === 'fair') && (
            <p className="mt-3 text-[13px] leading-5 text-white/70">Your plan worked for {first}, but the consultation didn’t pass yet. Here’s what held it back.</p>
          )}
        </div>

        <div className="space-y-3 bg-rh-cream px-3 py-4 sm:px-4">
          {/* Coaching first */}
          {d.coach && (d.coach.moments.length > 0 || d.coach.practise) && (
            <Section kicker="Your coach" title="What to keep, what to change">
              <div className="space-y-3">
                {d.coach.moments.map((m, i) => (
                  <div key={i} className="rounded-2xl border border-rh-ink/[0.08] p-3.5">
                    <p className="flex gap-2 text-[14px] leading-6 text-rh-ink">
                      <Quote className="mt-1 h-3.5 w-3.5 shrink-0 text-rh-ink/35" />
                      <span className="italic">“{m.quote}”</span>
                    </p>
                    <p className="mt-2 text-[13.5px] leading-5 text-rh-ink/70">{m.what}</p>
                    {m.tryInstead && (
                      <p className="mt-2.5 rounded-xl bg-rh-honeydew px-3 py-2 text-[13.5px] leading-5 text-rh-ink">
                        <span className="font-bold">Try: </span>
                        {m.tryInstead}
                      </p>
                    )}
                  </div>
                ))}
                {d.coach.strengths.length > 0 && (
                  <ul className="space-y-1.5">
                    {d.coach.strengths.map((s, i) => (
                      <li key={i} className="flex gap-2 text-[13.5px] leading-5 text-rh-ink/80">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {s}
                      </li>
                    ))}
                  </ul>
                )}
                {d.coach.practise && (
                  <p className="flex gap-2 rounded-2xl bg-rh-ink px-3.5 py-3 text-[13.5px] leading-5 text-white">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-rh-lime" />
                    <span>
                      <span className="font-bold">Practise next time: </span>
                      {d.coach.practise}
                    </span>
                  </p>
                )}
              </div>
            </Section>
          )}

          {/* What the patient kept to themselves */}
          {d.heldBack.length > 0 && (
            <Section kicker="Hidden" title={`What ${first} didn’t tell you`}>
              {d.heldBack.map((h) => (
                <div key={h.id} className="rounded-2xl bg-rh-ink/[0.04] p-3.5">
                  <p className="flex gap-2 text-[14px] leading-6 text-rh-ink">
                    <Lock className="mt-1 h-3.5 w-3.5 shrink-0 text-rh-ink/45" />
                    <span className="italic">“{h.answer}”</span>
                  </p>
                  <p className="mt-2 text-[13px] leading-5 text-rh-ink/65">
                    {h.askedTooEarly
                      ? `You asked, but ${he} didn’t trust you enough yet. Acknowledging how ${he} feels, and open questions, would have got this.`
                      : `You never asked. A question like “${h.label}” brings it out once ${he} trusts you.`}
                  </p>
                </div>
              ))}
            </Section>
          )}

          <Section kicker="Score" title="How it adds up">
            <div className="space-y-4">
              <Bar label="Decisions" value={scores.case} hint="History, examination and plan: what you asked, tested and chose." />
              <Bar label="Communication" value={scores.communication} hint={`How ${first} felt, and how well you explained the plan.`} />
              <Bar label="Note" value={scores.note} hint="Your SOAP note against the case’s marking guide." />
            </div>
          </Section>

          <Section kicker="Skills" title="Your clinical skills">
            <SkillsRadar skills={d.skills} />
            <div className="mt-4">
              <TrustLine start={d.rapportStart} log={d.rapportLog} />
            </div>
            {d.jargon.length > 0 && (
              <p className="mt-3 text-[13px] leading-5 text-rh-ink/70">
                <span className="font-semibold">Words {he} didn’t understand: </span>
                {d.jargon.join(', ')}
              </p>
            )}
          </Section>

          {missed.length > 0 && (
            <Section kicker="History" title="Questions an expert would have asked">
              <ul className="space-y-2.5">
                {missed.map((q) => (
                  <li key={q.id} className="rounded-2xl border border-rh-ink/[0.08] p-3">
                    <p className="flex gap-2 text-[14px] font-semibold leading-5 text-rh-ink">
                      <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" /> “{q.label}”
                    </p>
                    <p className="mt-1.5 pl-6 text-[13px] leading-5 text-rh-ink/65">{q.feedback}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {decisions.length > 0 && (
            <Section kicker="Examination and plan" title="Your decisions">
              <ul className="space-y-2.5">
                {decisions.map((t, i) => (
                  <li key={i} className="rounded-2xl border border-rh-ink/[0.08] p-3">
                    <p className="flex gap-2 text-[14px] font-semibold leading-5 text-rh-ink">
                      {t.tag === 'harmful' || t.tag === 'wasteful' ? (
                        <XCircle className={cn('mt-0.5 h-4 w-4 shrink-0', t.tag === 'harmful' ? 'text-rose-600' : 'text-amber-600')} />
                      ) : (
                        <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                      )}
                      {t.label}
                    </p>
                    <p className="mt-1.5 pl-6 text-[13px] leading-5 text-rh-ink/65">{t.feedback}</p>
                  </li>
                ))}
              </ul>
              {data.debrief.critical.some((x) => !x.done) && (
                <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-[13px] leading-5 text-rose-900">
                  <p className="font-bold">Must-dos you missed</p>
                  <ul className="mt-1 list-disc pl-5">
                    {data.debrief.critical
                      .filter((x) => !x.done)
                      .map((x) => (
                        <li key={x.choiceId}>{x.label}</li>
                      ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          <Section kicker="Explaining the plan" title={`Did ${first} understand?`}>
            <ul className="space-y-2">
              {d.explain.map((item) => (
                <li key={item.id} className="flex gap-2.5 text-[13.5px] leading-5">
                  {item.covered ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />}
                  <span className={item.covered ? 'text-rh-ink' : 'text-rh-ink/60'}>{item.label}</span>
                </li>
              ))}
            </ul>
          </Section>

          {d.note && (
            <Section kicker="Documentation" title={d.note.skipped ? 'You skipped the note' : 'Your note, marked'}>
              {d.note.result && d.note.result.fabricated.length > 0 && (
                <div className="mb-3 rounded-2xl bg-rose-50 p-3 text-[13px] leading-5 text-rose-900">
                  <p className="font-bold">Written down but never found</p>
                  <ul className="mt-1 space-y-1">
                    {d.note.result.fabricated.map((f, i) => (
                      <li key={i}>
                        “{f.text}”{f.why ? ` (${f.why})` : ''}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-rose-900/70">Only record what you actually asked or examined.</p>
                </div>
              )}
              <div className="space-y-4">
                {(['S', 'O', 'A', 'P'] as const).map((k) => {
                  const items = d.note!.rubric.filter((r) => r.section === k)
                  return (
                    <div key={k} className="rounded-2xl border border-rh-ink/[0.08] p-3.5">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-rh-ink/50">
                        {k === 'S' ? 'Subjective' : k === 'O' ? 'Objective' : k === 'A' ? 'Assessment' : 'Plan'}
                      </p>
                      {!d.note!.skipped && (
                        <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-5 text-rh-ink">{d.note!.sections[k] || <span className="text-rh-ink/40">Blank</span>}</p>
                      )}
                      <ul className="mt-2.5 space-y-1.5">
                        {items.map((r) => (
                          <li key={r.id} className="flex gap-2 text-[12.5px] leading-5">
                            {r.met ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />}
                            <span className={r.met ? 'text-rh-ink/80' : 'text-rh-ink/55'}>{r.label}</span>
                          </li>
                        ))}
                      </ul>
                      {d.note!.result?.feedback[k] && <p className="mt-2.5 rounded-xl bg-rh-honeydew px-3 py-2 text-[13px] leading-5 text-rh-ink">{d.note!.result.feedback[k]}</p>}
                      <details className="mt-2.5 text-[13px] leading-5">
                        <summary className="cursor-pointer font-semibold text-rh-ink/60">Model note</summary>
                        <p className="mt-1.5 text-rh-ink/75">{d.note!.model[k]}</p>
                      </details>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {d.expert && (
            <Fold title="How an expert ran it">
              <p className="mb-3 text-xs text-rh-ink/50">{d.expert.label}</p>
              <div className="space-y-2.5">
                {d.expert.transcript.map((l, i) => (
                  <div key={i} className={cn('flex flex-col', l.speaker === 'physio' ? 'items-end' : 'items-start')}>
                    <span
                      className={cn(
                        'max-w-[88%] rounded-[18px] px-3.5 py-2 text-[14px] leading-6',
                        l.speaker === 'physio' ? 'rounded-tr-md bg-rh-ink text-white' : 'rounded-tl-md bg-rh-cream text-rh-ink'
                      )}
                    >
                      {l.text}
                    </span>
                    {l.note && (
                      <span className="mt-1 flex max-w-[88%] gap-1.5 text-[12px] leading-4 text-rh-ink/55">
                        <Eye className="mt-0.5 h-3 w-3 shrink-0" /> {l.note}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Fold>
          )}

          <Fold title="Your conversation, annotated">
            <div className="space-y-2.5">
              {d.transcript
                .filter((t) => t.role !== 'system')
                .map((t) => (
                  <div key={t.index} className={cn('flex flex-col', t.role === 'physio' ? 'items-end' : 'items-start')}>
                    <span
                      className={cn(
                        'max-w-[88%] whitespace-pre-wrap rounded-[18px] px-3.5 py-2 text-[14px] leading-6',
                        t.role === 'physio' ? 'rounded-tr-md bg-rh-ink text-white' : 'rounded-tl-md bg-rh-cream text-rh-ink'
                      )}
                    >
                      {t.text}
                    </span>
                    {t.role === 'physio' && (t.signals || t.asked.length > 0) && (
                      <span className="mt-1 flex max-w-[92%] flex-wrap justify-end gap-1">
                        {Object.entries((t.signals ?? {}) as Record<string, boolean>)
                          .filter(([k, v]) => v && SIGNAL_CHIPS[k])
                          .map(([k]) => (
                            <span
                              key={k}
                              className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-bold', SIGNAL_CHIPS[k].good ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800')}
                            >
                              {SIGNAL_CHIPS[k].label}
                              {k === 'jargon' && t.jargon.length ? `: ${t.jargon.join(', ')}` : ''}
                            </span>
                          ))}
                        {t.asked.map((q) => (
                          <span key={q} className="rounded-full bg-sky-100 px-2 py-0.5 text-[10.5px] font-semibold text-sky-900">
                            Asked: {q}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </Fold>

          {data.debrief.learningPoints.length > 0 && (
            <Fold title="Learning points and references">
              <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-5 text-rh-ink/80">
                {data.debrief.learningPoints.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
              <ul className="mt-3 space-y-1 text-[12px] leading-5 text-rh-ink/55">
                {data.debrief.references.map((r, i) => (
                  <li key={i}>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                        {r.label}
                      </a>
                    ) : (
                      r.label
                    )}
                  </li>
                ))}
              </ul>
            </Fold>
          )}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <button type="button" onClick={() => void again('consult')} disabled={Boolean(busy)} className={cn(pillLime, 'h-12 flex-1 px-6 text-[15px]')}>
              {busy === 'consult' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Talk to {first} again
            </button>
            <button type="button" onClick={() => void again('classic')} disabled={Boolean(busy)} className={cn(pillOutline, 'h-12 px-5 text-sm')}>
              {busy === 'classic' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Play with taps
            </button>
            <Link href={SIMULATIONS_PATH} className={cn(pillInk, 'h-12 px-5 text-sm')}>
              All cases <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="px-1 pb-6 pt-2 text-[11px] leading-4 text-rh-ink/45">{DISCLAIMER} The patient is played by AI and can make mistakes.</p>
        </div>
      </div>
    </PlayerFrame>
  )
}
