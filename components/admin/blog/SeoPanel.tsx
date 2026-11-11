'use client'

import { useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, Info } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { inputClass } from '@/components/admin/ui'
import type { BlogImage, BlogSeo } from '@/lib/blog/api'
import { imagekitTransform } from '@/lib/blog/content'
import { SEO_LIMITS, documentTitle, type SeoCheck, type SeoGroup, type SeoReport } from '@/lib/blog/seo'
import { cn } from '@/lib/utils'

const GROUPS: { id: SeoGroup; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'keyword', label: 'Focus keyword' },
  { id: 'content', label: 'Content' },
  { id: 'links', label: 'Links' },
  { id: 'readability', label: 'Readability' },
]

export function scoreTone(report: SeoReport) {
  if (report.errors.length > 0) return { label: 'Needs work', ring: '#e11d48', text: 'text-rose-600' }
  if (report.score >= 85) return { label: 'Great', ring: '#00cd0f', text: 'text-[#00930b]' }
  return { label: 'Good to go', ring: '#e8a54f', text: 'text-[#b4690e]' }
}

export function ScoreRing({ report, size = 56 }: { report: SeoReport; size?: number }) {
  const tone = scoreTone(report)
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`SEO score ${report.score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={6} className="text-black/[0.06] dark:text-white/10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone.ring} strokeWidth={6} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - report.score / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-rh-ink dark:text-white">{report.score}</span>
    </div>
  )
}

function CheckRow({ check }: { check: SeoCheck }) {
  const Icon = check.level === 'good' ? CheckCircle2 : check.level === 'error' ? AlertCircle : Info
  return (
    <li className="flex gap-2.5 py-1.5">
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          check.level === 'good' ? 'text-rh-lime-deep' : check.level === 'error' ? 'text-rose-600' : 'text-amber-500'
        )}
      />
      <span className="min-w-0 text-[13px] leading-snug">
        <span className={cn('font-medium', check.level === 'good' ? 'text-neutral-600 dark:text-neutral-300' : 'text-rh-ink dark:text-white')}>{check.label}</span>
        {check.detail && check.level !== 'good' ? <span className="block text-neutral-500 dark:text-neutral-400">{check.detail}</span> : null}
      </span>
    </li>
  )
}

function Counter({ value, min, max }: { value: number; min: number; max: number }) {
  const ok = value >= min && value <= max
  return <span className={cn('text-[11px] font-semibold tabular-nums', ok ? 'text-rh-lime-deep' : 'text-amber-600')}>{value}/{max}</span>
}

export function SeoPanel({
  report,
  seo,
  onSeo,
  slug,
  cover,
  canNoindex,
  disabled,
}: {
  report: SeoReport
  seo: BlogSeo
  onSeo: (patch: Partial<BlogSeo>) => void
  slug: string
  cover: BlogImage | null
  canNoindex: boolean
  disabled: boolean
}) {
  const [showGood, setShowGood] = useState(false)
  const tone = scoreTone(report)
  const { metaTitle, metaDescription } = report.effective
  const url = `physioaroundme.com › blog › ${slug || 'your-post'}`

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <ScoreRing report={report} />
        <div>
          <p className={cn('text-sm font-bold', tone.text)}>{tone.label}</p>
          <p className="text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">
            {report.errors.length > 0
              ? `${report.errors.length} thing${report.errors.length === 1 ? '' : 's'} to fix before it can go live.`
              : report.warnings.length > 0
                ? `Ready. ${report.warnings.length} suggestion${report.warnings.length === 1 ? '' : 's'} could help it rank.`
                : 'Everything checks out.'}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="seo-keyword" className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
              Focus keyword
            </label>
          </div>
          <Input
            id="seo-keyword"
            value={seo.focusKeyword ?? ''}
            onChange={(e) => onSeo({ focusKeyword: e.target.value })}
            placeholder="e.g. lower back pain exercises"
            className={inputClass}
            maxLength={80}
            disabled={disabled}
          />
          <p className="mt-1 text-[11px] text-neutral-500">What a patient would type into Google to find this post.</p>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="seo-title" className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
              SEO title
            </label>
            <Counter value={metaTitle.length} min={SEO_LIMITS.metaTitleMin} max={SEO_LIMITS.metaTitleMax} />
          </div>
          <Input
            id="seo-title"
            value={seo.metaTitle ?? ''}
            onChange={(e) => onSeo({ metaTitle: e.target.value })}
            placeholder="Uses the post title when empty"
            className={inputClass}
            maxLength={120}
            disabled={disabled}
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="seo-description" className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
              Meta description
            </label>
            <Counter value={metaDescription.length} min={SEO_LIMITS.metaDescriptionMin} max={SEO_LIMITS.metaDescriptionMax} />
          </div>
          <Textarea
            id="seo-description"
            value={seo.metaDescription ?? ''}
            onChange={(e) => onSeo({ metaDescription: e.target.value })}
            placeholder="Uses the summary when empty"
            rows={3}
            className={cn(inputClass, 'resize-none')}
            maxLength={320}
            disabled={disabled}
          />
        </div>
        {canNoindex ? (
          <label className="flex items-center justify-between gap-3 rounded-xl bg-rh-canvas px-3 py-2.5 dark:bg-white/[0.04]">
            <span className="text-[13px]">
              <span className="block font-medium text-rh-ink dark:text-white">Hide from search engines</span>
              <span className="block text-[11px] text-neutral-500">For posts only meant for people you send the link to.</span>
            </span>
            <Switch checked={seo.noindex === true} onCheckedChange={(v) => onSeo({ noindex: v })} disabled={disabled} />
          </label>
        ) : null}
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">In Google</p>
        <div className="rounded-xl bg-white p-3.5 ring-1 ring-black/[0.06] dark:bg-white/[0.04] dark:ring-white/10">
          <p className="truncate text-[12px] text-[#202124] dark:text-neutral-300">{url}</p>
          <p className="mt-0.5 line-clamp-2 text-[17px] leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">{documentTitle(metaTitle || 'Your post title')}</p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[#4d5156] dark:text-neutral-400">{metaDescription || 'Your meta description shows here.'}</p>
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">Shared on WhatsApp, X or LinkedIn</p>
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.06] dark:bg-white/[0.04] dark:ring-white/10">
          <div className="aspect-[1.91/1] bg-rh-canvas dark:bg-white/5">
            {cover?.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview of the 1200x630 share card
              <img src={imagekitTransform(cover.url, { w: 600, h: 314 })} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-neutral-500">Add a cover image</div>
            )}
          </div>
          <div className="p-3">
            <p className="text-[11px] uppercase text-neutral-500">physioaroundme.com</p>
            <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-rh-ink dark:text-white">{metaTitle || 'Your post title'}</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {GROUPS.map((group) => {
          const checks = report.checks.filter((c) => c.group === group.id)
          const open = checks.filter((c) => c.level !== 'good')
          const shown = showGood ? checks : open
          if (checks.length === 0) return null
          return (
            <div key={group.id}>
              <p className="flex items-center justify-between text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                {group.label}
                <span className="font-medium text-neutral-400">{checks.length - open.length}/{checks.length}</span>
              </p>
              {shown.length > 0 ? (
                <ul className="mt-1">
                  {shown.map((c) => (
                    <CheckRow key={c.id} check={c} />
                  ))}
                </ul>
              ) : (
                <p className="mt-1 flex items-center gap-2 text-[13px] text-neutral-500">
                  <CheckCircle2 className="h-4 w-4 text-rh-lime-deep" /> All good
                </p>
              )}
            </div>
          )
        })}
        <button
          type="button"
          onClick={() => setShowGood((v) => !v)}
          className="flex items-center gap-1 text-[12px] font-semibold text-neutral-500 hover:text-rh-ink dark:hover:text-white"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showGood && 'rotate-180')} />
          {showGood ? 'Hide passed checks' : 'Show passed checks too'}
        </button>
      </section>

      <p className="rounded-xl bg-rh-canvas p-3 text-[12px] leading-relaxed text-neutral-600 dark:bg-white/[0.04] dark:text-neutral-400">
        The site adds the rest for you: the page address, share cards, Google article and FAQ data, breadcrumbs, the sitemap and the feed.
      </p>
    </div>
  )
}
