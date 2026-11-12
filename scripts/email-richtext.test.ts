/**
 * Checks for rich text in campaign emails (no network):
 *   npx tsx scripts/email-richtext.test.ts
 */
import assert from 'node:assert/strict'
import { escapeEmailText, paragraph } from '../lib/email/layout'
import { renderMarketingEmail } from '../lib/email/marketing'
import { bodyHasText, bodyPlainText, isRichBody, plainTextToDoc, renderEmailBody, type RichNode } from '../lib/email/richText'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`ok - ${name}`)
}

const t = (text: string, marks?: RichNode['marks']): RichNode => ({ type: 'text', text, ...(marks ? { marks } : {}) })
const p = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content })
const doc = (...content: RichNode[]) => JSON.stringify({ type: 'doc', content })

test('plain-text messages render exactly as before', () => {
  const body = 'First line\nsecond line\n\n<b>Tags</b> & "quotes"\n\n\n'
  const old = body
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => paragraph(escapeEmailText(x).replace(/\n/g, '<br />')))
    .join('')
  assert.equal(renderEmailBody(body), old)
  assert.ok(!isRichBody(body))
})

test('marks, headings, lists, quote and divider', () => {
  const html = renderEmailBody(
    doc(
      p(t('Hi '), t('bold', [{ type: 'bold' }]), t(' and '), t('italic', [{ type: 'italic' }]), t(' and '), t('under', [{ type: 'underline' }])),
      { type: 'heading', attrs: { level: 2 }, content: [t('Big')] },
      { type: 'heading', attrs: { level: 3 }, content: [t('Small')] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('one'))] }, { type: 'listItem', content: [p(t('two'))] }] },
      { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('three'))] }] },
      { type: 'blockquote', content: [p(t('A quote'))] },
      { type: 'horizontalRule' }
    )
  )
  assert.match(html, /<strong style="[^"]+">bold<\/strong>/)
  assert.match(html, /<em>italic<\/em>/)
  assert.match(html, /<u>under<\/u>/)
  assert.match(html, /<h2 style="[^"]+">Big<\/h2>/)
  assert.match(html, /<h3 style="[^"]+">Small<\/h3>/)
  assert.match(html, /<ul style="[^"]+"><li style="[^"]+">one<\/li><li style="[^"]+">two<\/li><\/ul>/)
  assert.match(html, /<ol start="3" style="[^"]+">/)
  assert.match(html, /border-left:4px solid #00cd0f[^>]*>A quote<\/td>/)
  assert.match(html, /border-top:1px solid/)
  assert.ok(!/class=/.test(html), 'no CSS classes: email apps drop <style>')
})

test('text is escaped and only safe links are kept', () => {
  const html = renderEmailBody(
    doc(
      p(t('<script>alert(1)</script> & "x"')),
      p(t('good', [{ type: 'link', attrs: { href: 'https://physioaroundme.com/pricing?a=1&b=2' } }])),
      p(t('mail', [{ type: 'link', attrs: { href: 'mailto:hello@physioaroundme.com' } }])),
      p(t('bad', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
      p(t('quote', [{ type: 'link', attrs: { href: 'https://x.com/"onmouseover="alert(1)' } }]))
    )
  )
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(html.includes('href="https://physioaroundme.com/pricing?a=1&amp;b=2"'))
  assert.ok(html.includes('href="mailto:hello@physioaroundme.com"'))
  assert.ok(!html.includes('javascript:'))
  assert.ok(!html.includes('onmouseover'))
  assert.ok(html.includes('>bad<') && html.includes('>quote<'), 'unsafe links keep their words')
})

test('empty editor counts as no message; empty paragraphs are dropped', () => {
  assert.equal(bodyHasText(doc(p())), false)
  assert.equal(bodyHasText(doc(p(t('   ')))), false)
  assert.equal(bodyHasText(doc(p(t('Hi')))), true)
  assert.equal(bodyHasText(''), false)
  assert.equal(bodyHasText('plain'), true)
  assert.equal(renderEmailBody(doc(p(), p(t('Hi')), p())).match(/<p /g)?.length, 1)
})

test('plain text converts for the editor, and back to text', () => {
  const converted = JSON.stringify(plainTextToDoc('One\ntwo\n\nThree'))
  assert.ok(isRichBody(converted))
  assert.equal(bodyPlainText(converted), 'One\ntwo\nThree')
})

test('the full email keeps the greeting, button and unsubscribe around rich text', () => {
  const html = renderMarketingEmail(
    {
      subject: 's',
      heading: 'News from Rehabify',
      body: doc(p(t('Hello world', [{ type: 'bold' }]))),
      ctaLabel: 'Book',
      ctaUrl: 'https://physioaroundme.com',
    },
    { greetingName: 'Ada', unsubscribeUrl: '#' }
  )
  assert.ok(html.includes('Ada'))
  assert.match(html, /<strong style="[^"]+">Hello world<\/strong>/)
  assert.ok(html.includes('>Book<'))
  assert.ok(html.includes('Unsubscribe'))
})

console.log(`\n${passed} passed`)
