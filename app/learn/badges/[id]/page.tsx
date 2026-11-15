import type { Metadata } from 'next'
import Link from 'next/link'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { BadgeArt } from '@/components/learn/points/BadgeArt'
import { learnPath, learnSignUpHref } from '@/components/learn/platform/learnApi'
import { displayFont, pillInk, pillOutline } from '@/components/learn/shared'
import { publicAppUrl } from '@/lib/public-app-url'
import { cn } from '@/lib/utils'

type BadgeShare = { badge: string; name: string; how: string; detail: string | null; firstName: string; earnedAt: number } | null
const badgeShare = makeFunctionReference<'query', { id: string }, BadgeShare>('learnPoints:badgeShare')

async function load(id: string): Promise<BadgeShare> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null
  try {
    return await new ConvexHttpClient(url).query(badgeShare, { id })
  } catch {
    return null
  }
}

/** The preview card a shared badge shows on WhatsApp, LinkedIn and X (owner 2026-11-15). */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const b = await load(id)
  if (!b) return { title: 'Badge — Rehabify Learn', robots: { index: false } }
  const title = `${b.firstName} earned the “${b.name}” badge`
  const description = `${b.how}. Learn physiotherapy with courses, clinical simulations and live Spaces on Rehabify Learn.`
  const image = `${publicAppUrl()}/api/og/learn/badge/${id}`
  return {
    title: `${title} — Rehabify Learn`,
    description,
    robots: { index: false, follow: true },
    openGraph: { title, description, siteName: 'Rehabify Learn', type: 'website', images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default async function LearnBadgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = await load(id)
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-20 pt-10 text-center sm:px-6 sm:pt-16">
      {b ? (
        <>
          <div className="flex justify-center">
            <BadgeArt id={b.badge} earned size={180} />
          </div>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-rh-ink/50">Badge earned</p>
          <h1 className={cn('mt-2 text-[40px] leading-tight tracking-tight text-rh-ink sm:text-[52px]', displayFont)}>{b.name}</h1>
          <p className="mt-3 text-[17px] leading-7 text-rh-ink/75">
            {b.firstName} earned this badge on Rehabify Learn
            {` on ${new Date(b.earnedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' })}`}.
          </p>
          <p className="mt-1 text-[15px] leading-6 text-rh-ink/55">{b.detail ?? `${b.how}.`}</p>
        </>
      ) : (
        <>
          <h1 className={cn('text-[36px] leading-tight tracking-tight text-rh-ink', displayFont)}>Rehabify Learn</h1>
          <p className="mt-3 text-[15px] text-rh-ink/60">This badge isn’t available.</p>
        </>
      )}
      <div className="mx-auto mt-10 max-w-md rounded-3xl bg-rh-cream p-6">
        <p className="text-[16px] font-semibold text-rh-ink">Learn with them</p>
        <p className="mt-1.5 text-sm leading-6 text-rh-ink/65">Courses, clinical simulations, a community and live Spaces for physiotherapists and physio students. Points and badges as you go.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href={learnSignUpHref()} className={cn(pillInk, 'h-11 px-5')}>
            Join free
          </Link>
          <Link href={learnPath('/courses')} className={cn(pillOutline, 'h-11 px-5')}>
            See the courses
          </Link>
        </div>
      </div>
    </main>
  )
}
