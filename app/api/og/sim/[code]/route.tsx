/**
 * The preview card for a shared simulation run (1200 × 630): the patient, the case, the learner's
 * first name and score, and "watch the replay · try it free". Scene stills are JPEG copies of the
 * WebP stills (the image renderer can't read WebP).
 */

import { ImageResponse } from 'next/og'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import type { SimShare } from '@/components/learn/sims/simApi'
import { publicAppUrl } from '@/lib/public-app-url'

export const runtime = 'nodejs'

const getShare = makeFunctionReference<'query', { code: string }, SimShare | null>('learnSims:getShare')
const INK = '#0b1312'
const LIME = '#00cd0f'
const OUTCOME: Record<string, { bg: string; fg: string }> = {
  good: { bg: LIME, fg: INK },
  fair: { bg: '#fcd34d', fg: '#2b1d00' },
  poor: { bg: '#fb923c', fg: '#2b1200' },
  harm: { bg: '#f43f5e', fg: '#ffffff' },
}

async function dataUrl(url: string, type: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: 'force-cache' })
    if (!r.ok) return null
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`
  } catch {
    return null
  }
}

/** The white logo with its CSS classes turned into plain fills (the renderer ignores <style>). */
async function logo(base: string): Promise<string | null> {
  try {
    const r = await fetch(`${base}/logos/White%20MainRehabify.svg`, { cache: 'force-cache' })
    if (!r.ok) return null
    let svg = await r.text()
    const fills = new Map<string, string>()
    for (const m of svg.matchAll(/\.(cls-\d+)\{fill:([^;}]+);?\}/g)) fills.set(m[1], m[2])
    svg = svg.replace(/class="(cls-\d+)"/g, (_, k: string) => `fill="${fills.get(k) ?? '#fff'}"`)
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  } catch {
    return null
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  let share: SimShare | null = null
  if (convexUrl && /^[a-z0-9]{6,16}$/.test(code)) {
    try {
      share = await new ConvexHttpClient(convexUrl).query(getShare, { code })
    } catch {
      share = null
    }
  }
  const base = publicAppUrl()
  const firstScene = share?.beats.find((b) => (b.kind === 'scene' || b.kind === 'action') && b.scene)
  const sceneId = firstScene && (firstScene.kind === 'scene' || firstScene.kind === 'action') ? firstScene.scene : null
  const sceneSrc = share && sceneId ? (share.scenes as Record<string, { src: string }>)[sceneId]?.src : null
  const [photo, mark] = await Promise.all([sceneSrc ? dataUrl(`${base}${sceneSrc.replace(/\.webp$/i, '.jpg')}`, 'image/jpeg') : Promise.resolve(null), logo(base)])
  const tone = OUTCOME[share?.result.outcome ?? 'good'] ?? OUTCOME.good

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: INK, position: 'relative' }}>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" width={620} height={630} style={{ position: 'absolute', right: 0, top: 0, width: 620, height: 630, objectFit: 'cover' }} />
        )}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: 620,
            height: 630,
            display: 'flex',
            background: `linear-gradient(90deg, ${INK} 0%, rgba(11,19,18,0.55) 30%, rgba(11,19,18,0) 60%)`,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 640, height: '100%', padding: '56px 0 52px 64px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {mark && <img src={mark} alt="" width={176} height={48} />}
            <div style={{ display: 'flex', border: `2px solid ${LIME}`, color: LIME, borderRadius: 999, padding: '6px 16px', fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>
              CLINICAL SIMULATION
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', color: 'white', fontSize: 46, fontWeight: 700, lineHeight: 1.12, maxWidth: 560 }}>{share ? share.case.title : 'A clinical simulation on Rehabify Learn'}</div>
            {share && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22, marginTop: 30 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', color: 'rgba(255,255,255,0.7)', fontSize: 28 }}>{share.firstName} scored</div>
                  <div style={{ display: 'flex', color: share.result.passed ? LIME : 'white', fontSize: 120, fontWeight: 700, lineHeight: 1 }}>{share.result.pct}%</div>
                </div>
                <div style={{ display: 'flex', background: tone.bg, color: tone.fg, borderRadius: 999, padding: '10px 22px', fontSize: 24, fontWeight: 700, marginBottom: 14 }}>
                  {share.result.title}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: 'white', fontSize: 26, fontWeight: 600 }}>
            <div style={{ display: 'flex', width: 46, height: 46, borderRadius: 999, background: LIME, alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ display: 'flex', width: 0, height: 0, borderTop: '10px solid transparent', borderBottom: '10px solid transparent', borderLeft: `16px solid ${INK}`, marginLeft: 4 }} />
            </div>
            Watch the replay · try it free
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=600, s-maxage=86400, stale-while-revalidate=604800' } }
  )
}
