/**
 * Checks for the blog's content readers and SEO checklist (no Convex, no network):
 *   npx tsx scripts/blog-content.test.ts
 */
import assert from 'node:assert/strict'
import {
  bodyImages,
  bodyLinks,
  bodyStats,
  faqItems,
  isSafeHref,
  isSafeImageSrc,
  outline,
  parseBody,
  plainText,
  slugify,
  youtubeId,
  imagekitTransform,
  type BlogNode,
} from '../lib/blog/content'
import { analyzeSeo, documentTitle } from '../lib/blog/seo'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`ok - ${name}`)
}

const text = (t: string, marks?: BlogNode['marks']): BlogNode => ({ type: 'text', text: t, ...(marks ? { marks } : {}) })
const p = (...content: BlogNode[]): BlogNode => ({ type: 'paragraph', content })
const h = (level: number, t: string): BlogNode => ({ type: 'heading', attrs: { level }, content: [text(t)] })
const link = (t: string, href: string) => text(t, [{ type: 'link', attrs: { href } }])

const longPara = (n: number, word = 'exercise') =>
  p(text(Array.from({ length: n }, (_, i) => (i % 12 === 11 ? `${word}.` : word)).join(' ')))

const doc: BlogNode = {
  type: 'doc',
  content: [
    p(text('Lower back pain exercises help most people feel better within weeks.')),
    h(2, 'Why your back hurts'),
    longPara(300, 'muscles'),
    { type: 'image', attrs: { src: 'https://ik.imagekit.io/x/blog/a.webp', alt: 'A woman doing a bridge exercise on a mat', caption: 'The bridge' } },
    h(3, 'Lower back pain exercises to try'),
    p(text('Start with '), link('our pricing', '/pricing'), text(' and '), link('find a physio', 'https://physioaroundme.com/find-a-physio'), text(' or read '), link('the NHS page', 'https://www.nhs.uk/conditions/back-pain/'), text('.')),
    longPara(300, 'gently'),
    {
      type: 'faq',
      attrs: {
        title: '',
        items: [
          { question: 'How long until it helps?', answer: 'Most people notice a change within two to four weeks.' },
          { question: '', answer: 'ignored, no question' },
        ],
      },
    },
    { type: 'gallery', attrs: { images: [{ src: 'https://ik.imagekit.io/x/b.webp', alt: '' }] } },
  ],
}

test('parseBody falls back to an empty doc', () => {
  assert.equal(parseBody('not json').type, 'doc')
  assert.equal(parseBody('{"type":"paragraph"}').content?.[0]?.type, 'paragraph')
  assert.equal(parseBody(JSON.stringify(doc)).content?.length, doc.content!.length)
})

test('outline gives ids in order, FAQ included, duplicates numbered', () => {
  const items = outline({ type: 'doc', content: [h(2, 'Pain'), h(2, 'Pain'), h(3, 'Café & you'), { type: 'faq', attrs: { items: [{ question: 'q', answer: 'a' }] } }] })
  assert.deepEqual(
    items.map((i) => i.id),
    ['pain', 'pain-2', 'cafe-you', 'frequently-asked-questions']
  )
})

test('faqItems keeps only complete pairs', () => {
  assert.deepEqual(faqItems(doc), [{ question: 'How long until it helps?', answer: 'Most people notice a change within two to four weeks.' }])
})

test('bodyImages reads pictures and galleries', () => {
  const images = bodyImages(doc)
  assert.equal(images.length, 2)
  assert.equal(images[1].alt, '')
})

test('bodyLinks splits internal and external', () => {
  const links = bodyLinks(doc)
  assert.deepEqual(
    links.map((l) => l.internal),
    [true, true, false]
  )
})

test('word count and reading time', () => {
  const stats = bodyStats(doc)
  assert.ok(stats.wordCount > 600, `words ${stats.wordCount}`)
  assert.equal(stats.readingMinutes, Math.round(stats.wordCount / 220))
  assert.ok(plainText(doc).includes('How long until it helps?'))
})

test('safe links and images', () => {
  assert.ok(isSafeHref('/pricing'))
  assert.ok(isSafeHref('https://x.com'))
  assert.ok(isSafeHref('mailto:a@b.co'))
  assert.ok(!isSafeHref('javascript:alert(1)'))
  assert.ok(!isSafeHref('//evil.com'))
  assert.ok(!isSafeHref(' '))
  assert.ok(isSafeImageSrc('https://ik.imagekit.io/a.png'))
  assert.ok(!isSafeImageSrc('http://ik.imagekit.io/a.png'))
  assert.ok(!isSafeImageSrc('data:image/png;base64,xx'))
})

test('youtube ids from common links', () => {
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=3'), 'dQw4w9WgXcQ')
  assert.equal(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(youtubeId('https://vimeo.com/123'), null)
})

test('slugify', () => {
  assert.equal(slugify("  Knee Pain: What's Normal After ACL Surgery? "), 'knee-pain-whats-normal-after-acl-surgery')
  assert.equal(slugify('Ọ̀ṣun — café'), 'osun-cafe')
})

test('imagekit transform only touches ImageKit links', () => {
  assert.equal(imagekitTransform('https://ik.imagekit.io/x/a.jpg', { w: 1200, h: 630 }), 'https://ik.imagekit.io/x/a.jpg?tr=w-1200,h-630,fo-auto,q-80')
  assert.equal(imagekitTransform('https://example.com/a.jpg', { w: 10 }), 'https://example.com/a.jpg')
})

const base = {
  title: 'Lower back pain exercises that actually help',
  slug: 'lower-back-pain-exercises',
  excerpt: 'Simple lower back pain exercises you can do at home, and when to see a physiotherapist instead of waiting.',
  metaDescription:
    'Lower back pain exercises you can do at home today: five gentle moves, how often to do them, and the signs that mean you should see a physio.',
  focusKeyword: 'lower back pain exercises',
  cover: { url: 'https://ik.imagekit.io/x/c.webp', alt: 'A man stretching his lower back on a mat' },
  doc,
}

test('a complete post has no blockers', () => {
  const report = analyzeSeo(base)
  assert.deepEqual(
    report.errors.map((e) => e.id),
    ['imageAlt'],
    'only the gallery picture without alt text should block'
  )
  assert.ok(report.checks.find((c) => c.id === 'kwTitle')?.level === 'good')
  assert.ok(report.checks.find((c) => c.id === 'kwIntro')?.level === 'good')
  assert.ok(report.checks.find((c) => c.id === 'kwHeading')?.level === 'good')
  assert.ok(report.checks.find((c) => c.id === 'internal')?.level === 'good')
})

test('missing basics are errors', () => {
  const report = analyzeSeo({ title: 'Hi', slug: 'Bad Slug', excerpt: '', doc: { type: 'doc', content: [p(text('short'))] } })
  const ids = report.errors.map((e) => e.id)
  for (const id of ['title', 'slug', 'metaTitle', 'metaDescription', 'excerpt', 'cover', 'length']) assert.ok(ids.includes(id), `expected ${id}`)
  assert.ok(report.score < 30)
})

test('heading order: H4 straight after H2 is an error', () => {
  const report = analyzeSeo({ ...base, doc: { type: 'doc', content: [h(2, 'A'), h(4, 'B'), longPara(200)] } })
  assert.ok(report.errors.some((e) => e.id === 'headings'))
})

test('keyword stuffing warns', () => {
  const stuffed = { type: 'doc', content: [p(text(Array.from({ length: 80 }, () => 'back pain').join(' ')))] }
  const report = analyzeSeo({ ...base, focusKeyword: 'back pain', doc: stuffed })
  assert.equal(report.checks.find((c) => c.id === 'kwBody')?.level, 'warning')
})

test('document title adds the brand only when it fits', () => {
  assert.equal(documentTitle('Short title'), 'Short title | Physio Around Me')
  const long = 'A very long SEO title that already uses all sixty characters'
  assert.equal(documentTitle(long), long)
})

console.log(`\n${passed} passed`)
