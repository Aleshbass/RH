/**
 * Preview cards (1200 × 630) for things shared from Rehabify Learn (owner 2026-11-15): a badge, a
 * certificate, a community post or a Space. Private things (group posts, group Spaces, revoked
 * certificates) get a plain Rehabify Learn card.
 */

import { ImageResponse } from 'next/og'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { badgeSvg } from '@/lib/learn/badgeSvg'
import { publicAppUrl } from '@/lib/public-app-url'

export const runtime = 'nodejs'

const INK = '#0b1312'
const LIME = '#00cd0f'

type Badge = { badge: string; name: string; how: string; detail: string | null; firstName: string } | null
type Cert = { state: 'valid'; name: string; programTitle: string; cohortLabel: string; issuedAt: number; code: string } | { state: string }
type Post = { title: string; kind: string; room: string; firstName: string; replies: number } | null
type Space = { title: string; host: string; status: string; at: number | null } | null

const refs = {
  badge: makeFunctionReference<'query', { id: string }, Badge>('learnPoints:badgeShare'),
  cert: makeFunctionReference<'query', { code: string }, Cert>('learn:verifyCertificate'),
  post: makeFunctionReference<'query', { id: string }, Post>('learnCommunity:postPreview'),
  space: makeFunctionReference<'query', { id: string }, Space>('learnSpaces:spacePreview'),
}

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

const svgData = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
const when = (at: number) => new Date(at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' })

type Card = { kicker: string; title: string; sub: string | null; footer: string; art: string | null; live?: boolean }

async function cardFor(kind: string, id: string): Promise<Card> {
  const fallback: Card = { kicker: 'REHABIFY LEARN', title: 'Learn physiotherapy with Rehabify', sub: 'Courses, clinical simulations, community and live Spaces.', footer: 'Join free', art: null }
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url || !/^[A-Za-z0-9_-]{3,64}$/.test(id)) return fallback
  const client = new ConvexHttpClient(url)
  try {
    if (kind === 'badge') {
      const b = await client.query(refs.badge, { id })
      if (!b) return fallback
      return { kicker: 'BADGE EARNED', title: b.name, sub: `${b.firstName} earned it on Rehabify Learn${b.detail ? ` · ${b.detail}` : ''}. ${b.how}.`, footer: 'Learn with them · join free', art: svgData(badgeSvg(b.badge, 360)) }
    }
    if (kind === 'cert') {
      const c = await client.query(refs.cert, { code: id.toUpperCase() })
      if (c.state !== 'valid' || !('name' in c)) return fallback
      const issued = new Date(c.issuedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      return { kicker: 'VERIFIED CERTIFICATE', title: c.name, sub: `${c.programTitle} · ${c.cohortLabel} · ${issued}`, footer: `Check it: ${c.code}`, art: svgData(badgeSvg('certified', 360)) }
    }
    if (kind === 'post') {
      const p = await client.query(refs.post, { id })
      if (!p) return fallback
      return {
        kicker: p.kind === 'question' ? 'A QUESTION IN THE COMMUNITY' : 'A DISCUSSION IN THE COMMUNITY',
        title: p.title,
        sub: `${p.firstName} in ${p.room}${p.replies ? ` · ${p.replies} ${p.replies === 1 ? 'reply' : 'replies'}` : ''}`,
        footer: 'Join the conversation',
        art: null,
      }
    }
    if (kind === 'space') {
      const s = await client.query(refs.space, { id })
      if (!s) return fallback
      const live = s.status === 'live'
      return {
        kicker: live ? 'LIVE NOW · AUDIO SPACE' : s.status === 'ended' ? 'AUDIO SPACE' : 'UPCOMING AUDIO SPACE',
        title: s.title,
        sub: `With ${s.host}${!live && s.at && s.status !== 'ended' ? ` · ${when(s.at)}` : ''}`,
        footer: live ? 'Listen live' : s.status === 'ended' ? 'More Spaces on Rehabify Learn' : 'Set a reminder',
        art: null,
        live,
      }
    }
  } catch {
    return fallback
  }
  return fallback
}

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params
  const [card, mark] = await Promise.all([cardFor(kind, id), logo(publicAppUrl())])
  const titleSize = card.title.length > 70 ? 46 : card.title.length > 40 ? 56 : 66

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: INK, padding: '56px 64px', position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, height: '100%', paddingRight: card.art ? 40 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {mark && <img src={mark} alt="" width={176} height={48} />}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                border: `2px solid ${card.live ? '#f43f5e' : LIME}`,
                color: card.live ? '#fda4af' : LIME,
                borderRadius: 999,
                padding: '6px 16px',
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: 2,
              }}
            >
              {card.live && <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 999, background: '#f43f5e' }} />}
              {card.kicker}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', color: 'white', fontSize: titleSize, fontWeight: 700, lineHeight: 1.1, maxWidth: card.art ? 640 : 1000 }}>{card.title}</div>
            {card.sub && <div style={{ display: 'flex', marginTop: 22, color: 'rgba(255,255,255,0.72)', fontSize: 28, lineHeight: 1.35, maxWidth: card.art ? 640 : 1000 }}>{card.sub}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', background: LIME, color: INK, borderRadius: 999, padding: '12px 26px', fontSize: 26, fontWeight: 700 }}>{card.footer}</div>
            <div style={{ display: 'flex', color: 'rgba(255,255,255,0.55)', fontSize: 24 }}>learn.physioaroundme.com</div>
          </div>
        </div>
        {card.art && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 380 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.art} alt="" width={360} height={379} />
          </div>
        )}
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' } }
  )
}
