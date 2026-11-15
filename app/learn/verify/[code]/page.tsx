import type { Metadata } from 'next'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { VerifyCertificate } from '@/components/learn/course/VerifyCertificate'
import { publicAppUrl } from '@/lib/public-app-url'

type Verified = { state: string; name?: string; programTitle?: string; cohortLabel?: string }
const verifyCertificate = makeFunctionReference<'query', { code: string }, Verified>('learn:verifyCertificate')

/**
 * Shows a physio's name: checkable by anyone with the number, but kept out of search engines. When
 * the link is posted (LinkedIn, WhatsApp) it shows a preview card of the certificate (owner 2026-11-15).
 */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params
  const clean = decodeURIComponent(code).trim().toUpperCase()
  const base: Metadata = { title: 'Certificate check — Rehabify Learn', robots: { index: false, follow: false } }
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url || !/^RHL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(clean)) return base
  try {
    const c = await new ConvexHttpClient(url).query(verifyCertificate, { code: clean })
    if (c.state !== 'valid' || !c.name) return base
    const title = `${c.name}: ${c.programTitle ?? 'Rehabify Learn'} certificate`
    const description = `A verified Rehabify Learn certificate${c.cohortLabel ? ` (${c.cohortLabel})` : ''}. Certificate number ${clean}.`
    const image = `${publicAppUrl()}/api/og/learn/cert/${clean}`
    return {
      ...base,
      title: `${title} — Rehabify Learn`,
      description,
      openGraph: { title, description, siteName: 'Rehabify Learn', type: 'website', images: [{ url: image, width: 1200, height: 630, alt: title }] },
      twitter: { card: 'summary_large_image', title, description, images: [image] },
    }
  } catch {
    return base
  }
}

export default function LearnVerifyPage() {
  return <VerifyCertificate />
}
