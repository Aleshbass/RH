// Access tests against a running Convex backend (local or a test deployment): nobody gets the
// decryption key or the playlists without a valid playback token for a lesson they may watch.
//
//   LEARN_VIDEO_TEST_SITE=http://127.0.0.1:3211      (Convex HTTP actions)
//   LEARN_VIDEO_TEST_CLOUD=http://127.0.0.1:3210     (Convex functions)
//   LEARN_VIDEO_MASTER_KEY=…                         (same as the backend; to craft expired/valid tokens)
//   LEARN_VIDEO_TEST_IDS={"enrolledUser":…,"outsiderUser":…,"lessonId":…,"assetId":…}  (optional, seeded data)
//
// Skipped when LEARN_VIDEO_TEST_SITE isn't set.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { fromBase64, signPlaybackToken } from '../../convex/helpers/videoCrypto.ts'

const SITE = process.env.LEARN_VIDEO_TEST_SITE?.replace(/\/+$/, '')
const CLOUD = process.env.LEARN_VIDEO_TEST_CLOUD?.replace(/\/+$/, '')
const MASTER = process.env.LEARN_VIDEO_MASTER_KEY ? fromBase64(process.env.LEARN_VIDEO_MASTER_KEY) : null
const IDS = process.env.LEARN_VIDEO_TEST_IDS ? JSON.parse(process.env.LEARN_VIDEO_TEST_IDS) : null
const skip = !SITE && 'LEARN_VIDEO_TEST_SITE not set'

const get = (path, init) => fetch(`${SITE}${path}`, init)
const token = (claims, master = MASTER) => signPlaybackToken({ exp: Date.now() + 5 * 60_000, ...claims }, master)

test('logged out: no token, no key', { skip }, async () => {
  const res = await get('/learn/video/key')
  assert.equal(res.status, 401)
  const body = new Uint8Array(await res.arrayBuffer())
  assert.notEqual(body.length, 16, 'never 16 key bytes')
})

test('logged out: the lesson playback (token) call is refused', { skip: (!CLOUD || !IDS) && 'needs LEARN_VIDEO_TEST_CLOUD and IDS' }, async () => {
  // A request with no Clerk session, exactly what a logged-out browser sends
  const res = await fetch(`${CLOUD}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'learn:getLessonPlayback', args: { lessonId: IDS.lessonId }, format: 'json' }),
  })
  const out = await res.json()
  assert.equal(out.status, 'error', 'no playback for a signed-out visitor')
  assert.ok(!JSON.stringify(out).includes('"token"'))
})

test('garbage, forged and expired tokens get no key', { skip }, async () => {
  assert.equal((await get('/learn/video/key?t=not-a-token')).status, 401)
  assert.equal((await get('/learn/video/key', { headers: { Authorization: 'Bearer abc.def' } })).status, 401)
  const claims = IDS ? { u: IDS.enrolledUser, a: IDS.assetId, l: IDS.lessonId } : { u: 'u', a: 'a', l: 'l' }
  // Signed with someone else's key: a forged token
  const forged = await token(claims, new Uint8Array(randomBytes(32)))
  assert.equal((await get(`/learn/video/key?t=${encodeURIComponent(forged)}`)).status, 401)
  if (MASTER) {
    const expired = await token({ ...claims, exp: Date.now() - 1000 })
    assert.equal((await get(`/learn/video/key?t=${encodeURIComponent(expired)}`)).status, 401)
  }
})

test('playlists need a token too', { skip }, async () => {
  assert.equal((await get('/learn/video/master.m3u8')).status, 401)
  assert.equal((await get('/learn/video/media.m3u8?r=720p')).status, 401)
})

test('the encoder API needs the worker secret', { skip }, async () => {
  for (const route of ['create', 'claim', 'upload-urls', 'complete', 'fail']) {
    const none = await get(`/learn/video/worker/${route}`, { method: 'POST', body: '{}' })
    assert.equal(none.status, 401, `${route} without secret`)
    const wrong = await get(`/learn/video/worker/${route}`, { method: 'POST', body: '{}', headers: { Authorization: `Bearer ${'z'.repeat(48)}` } })
    assert.equal(wrong.status, 401, `${route} with a wrong secret`)
  }
})

test('a signed-in user without access gets no key', { skip: (!MASTER || !IDS) && 'needs master key and seeded IDS' }, async () => {
  const t = await token({ u: IDS.outsiderUser, a: IDS.assetId, l: IDS.lessonId })
  assert.equal((await get(`/learn/video/key?t=${encodeURIComponent(t)}`)).status, 403)
  assert.equal((await get(`/learn/video/master.m3u8?t=${encodeURIComponent(t)}`)).status, 403)
})

test('an enrolled learner gets the key and signed playlists', { skip: (!MASTER || !IDS) && 'needs master key and seeded IDS' }, async () => {
  const t = await token({ u: IDS.enrolledUser, a: IDS.assetId, l: IDS.lessonId })
  const key = await get('/learn/video/key', { headers: { Authorization: `Bearer ${t}` } })
  assert.equal(key.status, 200)
  assert.equal(key.headers.get('cache-control'), 'no-store')
  assert.equal(new Uint8Array(await key.arrayBuffer()).length, 16)

  const master = await get(`/learn/video/master.m3u8?t=${encodeURIComponent(t)}`)
  assert.equal(master.status, 200)
  const masterText = await master.text()
  assert.match(masterText, /#EXT-X-STREAM-INF:BANDWIDTH=\d+,RESOLUTION=\d+x720/)

  const media = await get(`/learn/video/media.m3u8?r=720p&t=${encodeURIComponent(t)}`)
  assert.equal(media.status, 200)
  const mediaText = await media.text()
  assert.match(mediaText, /#EXT-X-KEY:METHOD=AES-128,URI="[^"]+\/learn\/video\/key\?t=/)
  assert.match(mediaText, /X-Amz-Signature=/, 'segments are short-lived signed R2 links')
  assert.ok(!/R2_SECRET|secret/i.test(mediaText))

  // The same user's token for this lesson can't open another video
  const other = await token({ u: IDS.enrolledUser, a: 'jd7000000000000000000000000000000', l: IDS.lessonId })
  assert.notEqual((await get(`/learn/video/key?t=${encodeURIComponent(other)}`)).status, 200)
})
