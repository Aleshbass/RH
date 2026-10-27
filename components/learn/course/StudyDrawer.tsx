'use client'

/**
 * One drawer for everything the physio opens on the course page: a week's materials, a 3D
 * exercise, or a video/leaflet from the library. Opening something from inside the drawer
 * stacks it, and "Back" returns to where they were.
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Dumbbell,
  ExternalLink,
  FileText,
  Globe,
  PlayCircle,
  Rotate3d,
  ShieldAlert,
  TriangleAlert,
  Video,
} from '@/components/icons'
import { ExerciseViewer } from '@/components/exercise3d/ExerciseViewer'
import { sideLabel } from '@/components/exercise-programs/types'
import { VideoEmbed } from '@/components/media/VideoEmbed'
import { api } from '@/convex/_generated/api'
import { useViewerGrant } from '@/lib/exercise3d/useViewerGrant'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import {
  EmptyNote,
  exerciseRegions,
  eyebrowClass,
  fileKind,
  fileSize,
  LearnDrawer,
  regionLabel,
  type CourseOk,
  type CourseWeek,
  type StudyExercise,
  type StudyLibraryData,
  type StudyResource,
} from './shared'
import { AssessmentPanel, CertificatePanel } from './Progress'
import { youtubeIdFrom } from '@/lib/youtube'

export type StudyPanel =
  | { kind: 'week'; week: CourseWeek }
  | { kind: 'exercise'; item: StudyExercise }
  | { kind: 'resource'; item: StudyResource }
  | { kind: 'assessment' }
  | { kind: 'certificate' }

const LANG_LABEL = { en: 'English', yo: 'Yorùbá', ig: 'Igbo', ha: 'Hausa' } as const

// Kept here for older imports; the helper lives in lib/youtube.ts
export { youtubeIdFrom }

export function ResourceIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = kind === 'youtube' ? PlayCircle : kind === 'guide' ? FileText : Globe
  return <Icon className={className} />
}

export function resourceKindLabel(kind: string) {
  return kind === 'youtube' ? 'Video' : kind === 'guide' ? 'Written guide' : 'Web page'
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('mt-6', className)}>
      <h3 className={eyebrowClass}>{title}</h3>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

function Chip({ children, tone = 'white' }: { children: React.ReactNode; tone?: 'white' | 'jasmine' | 'ink' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        tone === 'white' && 'bg-white text-rh-ink/75 ring-1 ring-inset ring-rh-ink/[0.07]',
        tone === 'jasmine' && 'bg-rh-jasmine text-rh-ink',
        tone === 'ink' && 'bg-rh-ink text-white'
      )}
    >
      {children}
    </span>
  )
}

/** A tappable row for an exercise or resource inside a drawer or list. */
export function StudyRow({
  icon,
  title,
  meta,
  onClick,
  tone = 'white',
}: {
  icon: React.ReactNode
  title: string
  meta?: string
  onClick: () => void
  tone?: 'white' | 'honeydew'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-2xl p-3 text-left transition active:scale-[0.99]',
        tone === 'white' ? 'bg-white hover:bg-white/70 hover:ring-1 hover:ring-inset hover:ring-rh-ink/10' : 'bg-rh-honeydew hover:brightness-[0.98]'
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rh-cream text-rh-ink">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-rh-ink">{title}</span>
        {meta && <span className="mt-0.5 block truncate text-xs text-rh-ink/55">{meta}</span>}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-rh-ink/30 transition group-hover:translate-x-0.5 group-hover:text-rh-ink/60" />
    </button>
  )
}

function RedFlags({ region }: { region: string }) {
  const flags = useQuery(api.libraryResources.redFlagsFor, { region }) as { region: string; items: string[] } | null | undefined
  if (!flags || flags.items.length === 0) return null
  return (
    <div className="mt-6 rounded-2xl bg-rh-rose/60 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-rh-ink">
        <TriangleAlert className="h-4 w-4" /> Red flags: {flags.region === 'general' ? 'any region' : regionLabel(flags.region).toLowerCase()}
      </p>
      <p className="mt-1 text-xs text-rh-ink/60">Stop and refer on if your patient reports any of these.</p>
      <ul className="mt-3 space-y-1.5 text-sm leading-6 text-rh-ink/85">
        {flags.items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-rh-ink/50" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function useStudyLibrary() {
  const library = useQuery(api.exerciseLibrary.listLibrary, {}) as StudyLibraryData | null | undefined
  const resources = useQuery(api.libraryResources.listResources, {}) as StudyResource[] | null | undefined
  return { exercises: library?.items.filter((i) => i.animation) ?? [], resources: resources ?? [] }
}

function ExercisePanel({ item, open }: { item: StudyExercise; open: (panel: StudyPanel) => void }) {
  const requestGrant = useViewerGrant({ kind: 'staff' })
  const [side, setSide] = useState<'L' | 'R' | null>(item.sided ? 'L' : null)
  useEffect(() => setSide(item.sided ? 'L' : null), [item])
  const clip = item.animation?.clips.find((c) => c.side === side) ?? item.animation?.clips[0] ?? null
  const regions = exerciseRegions(item)
  const primaryRegion = regions[0]
  const slug = item.animation?.slug
  const { resources } = useStudyLibrary()
  const related = useMemo(() => {
    const same = resources.filter((r) => slug && r.animationSlug === slug)
    const region = resources.filter((r) => r.region === primaryRegion && !same.includes(r) && r.type !== 'Self-test')
    return [...same, ...region].slice(0, 5)
  }, [resources, slug, primaryRegion])

  return (
    <>
      {clip ? (
        <ExerciseViewer key={clip.id} clipId={clip.id} requestGrant={requestGrant} accent="ink" />
      ) : (
        <div className="flex aspect-square items-center justify-center rounded-3xl bg-rh-sand text-sm text-rh-ink/50">No 3D demonstration</div>
      )}
      {item.sided && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-full bg-white p-1">
          {(['L', 'R'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={cn(
                'rounded-full px-3 py-2 text-sm font-medium transition',
                side === s ? 'bg-rh-ink text-white' : 'text-rh-ink/70 hover:text-rh-ink'
              )}
            >
              {sideLabel(item.animation?.slug, s)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Chip tone="ink">
          {item.defaults.sets} × {item.defaults.reps}
          {item.defaults.holdSeconds ? ` · hold ${item.defaults.holdSeconds}s` : ''}
        </Chip>
        <Chip>{item.defaults.frequency}</Chip>
        {item.position && <Chip>{item.position}</Chip>}
        <Chip>{item.difficulty}</Chip>
        {item.animation?.status === 'draft' && <Chip tone="jasmine">Awaiting clinical sign-off</Chip>}
      </div>

      <Section title="How to coach it">
        <ol className="space-y-2.5">
          {item.instructions.map((step, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-6 text-rh-ink/85">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rh-ink text-[11px] font-semibold text-rh-lime">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </Section>

      {item.precautions.length > 0 && (
        <div className="mt-6 flex gap-3 rounded-2xl bg-rh-peach p-4 text-sm leading-6 text-rh-ink/85">
          <ShieldAlert className="mt-1 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold text-rh-ink">Take care</p>
            <ul className="mt-1 space-y-1">
              {item.precautions.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Section title="Clinical notes">
        <dl className="grid gap-3 rounded-2xl bg-white p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-rh-ink/50">Targets</dt>
            <dd className="mt-0.5 text-rh-ink">{item.targetMuscles.join(', ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-rh-ink/50">Useful for</dt>
            <dd className="mt-0.5 text-rh-ink">{item.conditions.join(', ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-rh-ink/50">Equipment</dt>
            <dd className="mt-0.5 text-rh-ink">{item.equipment.join(', ') || 'None'}</dd>
          </div>
          <div>
            <dt className="text-xs text-rh-ink/50">Body region</dt>
            <dd className="mt-0.5 text-rh-ink">{regions.map(regionLabel).join(', ')}</dd>
          </div>
        </dl>
      </Section>

      <RedFlags region={primaryRegion} />

      {related.length > 0 && (
        <Section title="Videos and leaflets on this">
          <div className="space-y-2">
            {related.map((r) => (
              <StudyRow
                key={r.key}
                icon={<ResourceIcon kind={r.kind} className="h-4 w-4" />}
                title={r.title}
                meta={`${resourceKindLabel(r.kind)} · ${r.source}`}
                onClick={() => open({ kind: 'resource', item: r })}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

type ResourceDetail = StudyResource & {
  guides: { lang: keyof typeof LANG_LABEL; steps: string[]; stop?: string; status: 'reviewed' | 'draft' }[]
}

function ResourcePanel({ item, open }: { item: StudyResource; open: (panel: StudyPanel) => void }) {
  const detail = useQuery(api.libraryResources.getResource, { key: item.key }) as ResourceDetail | null | undefined
  const { exercises } = useStudyLibrary()
  const threeD = item.animationSlug ? exercises.find((e) => e.animation?.slug === item.animationSlug) : null
  const guides = detail?.guides ?? []
  const [lang, setLang] = useState<keyof typeof LANG_LABEL>('en')
  useEffect(() => setLang('en'), [item.key])
  const guide = guides.find((g) => g.lang === lang) ?? guides[0]

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Chip tone="ink">{resourceKindLabel(item.kind)}</Chip>
        <Chip>{regionLabel(item.region)}</Chip>
        <Chip>{item.type}</Chip>
      </div>

      {item.youtubeId && (
        <div className="mt-4 overflow-hidden rounded-3xl bg-rh-ink">
          <VideoEmbed youtubeId={item.youtubeId} />
        </div>
      )}

      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-4 transition hover:ring-1 hover:ring-inset hover:ring-rh-ink/10"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rh-cream">
            <ExternalLink className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-rh-ink">Open on {item.source}</span>
            <span className="block truncate text-xs text-rh-ink/50">{item.url.replace(/^https?:\/\//, '')}</span>
          </span>
        </a>
      )}

      {threeD && (
        <div className="mt-4">
          <StudyRow
            tone="honeydew"
            icon={<Rotate3d className="h-4 w-4" />}
            title="Watch our 3D version"
            meta={`${threeD.name} · rotate it, slow it down`}
            onClick={() => open({ kind: 'exercise', item: threeD })}
          />
        </div>
      )}

      {detail === undefined ? (
        <div className="mt-6 h-24 animate-pulse rounded-2xl bg-white" />
      ) : (
        guide && (
          <Section title="Summary for your patient">
            {guides.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {guides.map((g) => (
                  <button
                    key={g.lang}
                    type="button"
                    onClick={() => setLang(g.lang)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition',
                      g.lang === guide.lang ? 'bg-rh-ink text-white' : 'bg-white text-rh-ink/70 hover:text-rh-ink'
                    )}
                  >
                    {LANG_LABEL[g.lang]}
                    {g.status === 'draft' && ' · draft'}
                  </button>
                ))}
              </div>
            )}
            <div className="rounded-2xl bg-white p-4">
              {guide.status === 'draft' && (
                <p className="mb-3 rounded-xl bg-rh-jasmine/60 px-3 py-2 text-xs text-rh-ink/80">
                  Draft translation, not yet checked by a clinician.
                </p>
              )}
              {guide.steps.length > 1 ? (
                <ol className="space-y-2 text-[15px] leading-6 text-rh-ink/85">
                  {guide.steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-5 shrink-0 text-right font-semibold text-rh-ink/40">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[15px] leading-6 text-rh-ink/85">{guide.steps[0]}</p>
              )}
              {guide.stop && (
                <p className="mt-3 rounded-xl bg-rh-rose/50 px-3 py-2 text-sm text-rh-ink">
                  <span className="font-semibold">Stop if: </span>
                  {guide.stop}
                </p>
              )}
            </div>
          </Section>
        )
      )}

      <p className="mt-4 text-xs text-rh-ink/45">
        {item.condition} · Source: {item.source}
      </p>

      <RedFlags region={item.region} />
    </>
  )
}

function WeekDone({ weekId, done }: { weekId: CourseWeek['id']; done: boolean }) {
  const setDone = useMutation(api.learn.setWeekDone)
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await setDone({ moduleId: weekId, done: !done })
          if (!done) playSound('success')
        } finally {
          setBusy(false)
        }
      }}
      className={cn(
        'mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-60',
        done ? 'bg-rh-honeydew text-rh-ink' : 'bg-rh-ink text-white hover:bg-black'
      )}
    >
      <Check className="h-4 w-4" />
      {done ? 'Done. Tap to undo' : 'Mark this week as done'}
    </button>
  )
}

function WeekPanel({ week, done, open }: { week: CourseWeek; done: boolean; open: (panel: StudyPanel) => void }) {
  const youtubeId = youtubeIdFrom(week.recordingUrl)
  const empty = !week.recordingUrl && week.files.length === 0 && week.exercises.length === 0 && week.resources.length === 0
  return (
    <>
      {week.summary && <p className="whitespace-pre-line text-[15px] leading-7 text-rh-ink/75">{week.summary}</p>}

      {empty && (
        <div className="mt-4">
          <EmptyNote icon={Video} title="Materials are on their way">
            Slides, the recording and this week&apos;s exercises are added after the live session.
          </EmptyNote>
        </div>
      )}

      {week.recordingUrl && (
        <Section title="Recording">
          {youtubeId ? (
            <div className="overflow-hidden rounded-3xl bg-rh-ink">
              <VideoEmbed youtubeId={youtubeId} />
            </div>
          ) : (
            <a
              href={week.recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl bg-rh-ink p-4 text-white transition hover:bg-black"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rh-lime text-rh-ink">
                <PlayCircle className="h-5 w-5" />
              </span>
              <span className="flex-1 text-sm font-semibold">Watch the session recording</span>
              <ExternalLink className="h-4 w-4 text-white/60" />
            </a>
          )}
        </Section>
      )}

      {week.files.length > 0 && (
        <Section title="Slides and handouts">
          <div className="space-y-2">
            {week.files.map((f) => (
              <a
                key={f.storageId}
                href={f.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                download={f.name}
                className={cn(
                  'flex items-center gap-3 rounded-2xl bg-white p-3 transition hover:ring-1 hover:ring-inset hover:ring-rh-ink/10',
                  !f.url && 'pointer-events-none opacity-50'
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rh-jasmine text-rh-ink">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-rh-ink">{f.name}</span>
                  <span className="block text-xs text-rh-ink/50">
                    {fileKind(f.contentType)} · {fileSize(f.size)}
                  </span>
                </span>
                <Download className="h-4 w-4 shrink-0 text-rh-ink/40" />
              </a>
            ))}
          </div>
        </Section>
      )}

      {week.exercises.length > 0 && (
        <Section title="Exercises to study">
          <div className="space-y-2">
            {week.exercises.map((e) => (
              <StudyRow
                key={e._id}
                icon={e.animation ? <Rotate3d className="h-4 w-4" /> : <Dumbbell className="h-4 w-4" />}
                title={e.name}
                meta={`${exerciseRegions(e).map(regionLabel).join(', ')}${e.animation ? ' · 3D' : ''}`}
                onClick={() => open({ kind: 'exercise', item: e })}
              />
            ))}
          </div>
        </Section>
      )}

      {week.resources.length > 0 && (
        <Section title="Videos and leaflets">
          <div className="space-y-2">
            {week.resources.map((r) => (
              <StudyRow
                key={r.key}
                icon={<ResourceIcon kind={r.kind} className="h-4 w-4" />}
                title={r.title}
                meta={`${resourceKindLabel(r.kind)} · ${r.source}`}
                onClick={() => open({ kind: 'resource', item: r })}
              />
            ))}
          </div>
        </Section>
      )}

      {!empty && <WeekDone weekId={week.id} done={done} />}
    </>
  )
}

function panelTitle(panel: StudyPanel) {
  if (panel.kind === 'assessment') return { eyebrow: 'Final assessment', title: 'Check what you’ve learned' }
  if (panel.kind === 'certificate') return { eyebrow: 'Certificate', title: 'Your certificate' }
  if (panel.kind === 'week') return { eyebrow: `Week ${panel.week.week}`, title: panel.week.title }
  if (panel.kind === 'exercise') return { eyebrow: '3D exercise', title: panel.item.name, description: panel.item.description }
  return { eyebrow: panel.item.condition, title: panel.item.title }
}

function backLabel(panel: StudyPanel) {
  if (panel.kind === 'assessment') return 'Final assessment'
  if (panel.kind === 'certificate') return 'Certificate'
  if (panel.kind === 'week') return `Week ${panel.week.week}`
  if (panel.kind === 'exercise') return panel.item.name
  return panel.item.title
}

/** The drawer. `stack` is owned by the page so anything on it can open a panel. */
export function StudyDrawer({
  course,
  stack,
  setStack,
}: {
  course: CourseOk
  stack: StudyPanel[]
  setStack: (next: StudyPanel[]) => void
}) {
  // Keep the last panel on screen while the drawer animates closed
  const [last, setLast] = useState<StudyPanel[]>([])
  useEffect(() => {
    if (stack.length) setLast(stack)
  }, [stack])
  const shown = stack.length ? stack : last
  const top = shown[shown.length - 1]
  const open = (panel: StudyPanel) => setStack([...stack, panel])
  const previous = shown.length > 1 ? shown[shown.length - 2] : null
  const heading = top ? panelTitle(top) : { eyebrow: '', title: '' }

  return (
    <LearnDrawer
      open={stack.length > 0}
      onOpenChange={(o) => !o && setStack([])}
      wide={top?.kind === 'exercise' || top?.kind === 'certificate'}
      eyebrow={
        previous ? (
          <button
            type="button"
            onClick={() => setStack(stack.slice(0, -1))}
            className="-ml-1 inline-flex max-w-full items-center gap-1.5 rounded-full px-1 py-0.5 normal-case tracking-normal text-rh-ink/60 transition hover:text-rh-ink"
          >
            <ArrowLeft className="h-3 w-3 shrink-0" />
            <span className="truncate text-xs font-medium">{backLabel(previous)}</span>
          </button>
        ) : (
          heading.eyebrow
        )
      }
      title={heading.title}
      description={'description' in heading ? heading.description : undefined}
    >
      {top && (
        <div key={shown.length} className="animate-in fade-in slide-in-from-right-2 duration-300">
          {top.kind === 'week' && <WeekPanel week={top.week} done={course.progress.weeksDone.includes(top.week.id)} open={open} />}
          {top.kind === 'assessment' && (
            <AssessmentPanel cohortId={course.cohort.id} openCertificate={() => setStack([{ kind: 'certificate' }])} />
          )}
          {top.kind === 'certificate' && <CertificatePanel course={course} />}
          {top.kind === 'exercise' && <ExercisePanel item={top.item} open={open} />}
          {top.kind === 'resource' && <ResourcePanel item={top.item} open={open} />}
        </div>
      )}
    </LearnDrawer>
  )
}
