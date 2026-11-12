/**
 * Invites by WhatsApp number (no network):
 *   npx tsx scripts/team-access.test.ts
 */
import assert from 'node:assert/strict'
import { normalizePhone } from '../convex/helpers/partnerShared'
import { formatPhone, whatsappInviteUrl } from '../lib/teamAccessApi'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`ok - ${name}`)
}

test('Nigerian numbers in any common form become one E.164 number', () => {
  for (const raw of ['0803 123 4567', '08031234567', '+234 803 123 4567', '2348031234567', '803-123-4567']) {
    assert.equal(normalizePhone(raw), '+2348031234567', raw)
  }
  assert.equal(normalizePhone('12345'), null)
  assert.equal(normalizePhone('hello'), null)
})

test('the WhatsApp link goes to the number with the invite typed in', () => {
  const url = whatsappInviteUrl('+2348031234567', 'https://physioaroundme.com/team-invite/abc123', 'learn_instructor')
  assert.ok(url.startsWith('https://wa.me/2348031234567?text='))
  const text = decodeURIComponent(url.split('?text=')[1])
  assert.ok(text.includes('Rehabify Learn'))
  assert.ok(text.includes('https://physioaroundme.com/team-invite/abc123'))
  assert.ok(text.includes('14 days'))
})

test('numbers are shown readably', () => {
  assert.equal(formatPhone('+2348031234567'), '+234 803 123 4567')
  assert.equal(formatPhone('+447700900123'), '+447700900123')
})

console.log(`\n${passed} passed`)
