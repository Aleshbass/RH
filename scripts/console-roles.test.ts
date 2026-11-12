/**
 * Who sees what in the admin console (no network):
 *   npx tsx scripts/console-roles.test.ts
 */
import assert from 'node:assert/strict'
import { consoleAllows, consoleHome, toConsoleRole, visibleAdminNav } from '../components/admin/shell/adminNav'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`ok - ${name}`)
}

const titles = (role: Parameters<typeof visibleAdminNav>[0]) => visibleAdminNav(role).flatMap((s) => s.items.map((i) => `${s.label} › ${i.title}`))

test('blog writers see only the blog section', () => {
  const t = titles('blog_editor')
  assert.ok(t.length > 0)
  assert.ok(t.every((x) => x.startsWith('Blog ›')), t.join(', '))
})

test('Learn instructors see only Learn › Video courses', () => {
  assert.deepEqual(titles('learn_instructor'), ['Rehabify Learn › Video courses'])
})

test('admins see everything, including the access page', () => {
  const t = titles('admin')
  assert.ok(t.includes('Rehabify Learn › MSK Specialist Program'))
  assert.ok(t.includes('Platform › Blog & Learn access'))
  assert.ok(t.includes('Blog › Posts'))
})

test('limited roles may only open their own area', () => {
  assert.ok(consoleAllows('learn_instructor', '/dashboard/admin/learn/courses'))
  assert.ok(!consoleAllows('learn_instructor', '/dashboard/admin/learn'))
  assert.ok(!consoleAllows('learn_instructor', '/dashboard/admin/learn/coursesX'))
  assert.ok(!consoleAllows('learn_instructor', '/dashboard/admin/blog'))
  assert.ok(consoleAllows('blog_editor', '/dashboard/admin/blog/abc'))
  assert.ok(!consoleAllows('blog_editor', '/dashboard/admin/team-access'))
  assert.ok(!consoleAllows('blog_editor', '/dashboard/admin'))
  assert.ok(consoleAllows('admin', '/dashboard/admin/team-access'))
  assert.equal(consoleHome('learn_instructor'), '/dashboard/admin/learn/courses')
})

test('only console roles get the console', () => {
  assert.equal(toConsoleRole('physiotherapist'), null)
  assert.equal(toConsoleRole(undefined), null)
  assert.equal(toConsoleRole('learn_instructor'), 'learn_instructor')
})

console.log(`\n${passed} passed`)
