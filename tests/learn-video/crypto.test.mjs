// Unit tests for protected video crypto: AWS SigV4 presigning (R2) and playback tokens / keys.
// Run: npm run test:video   (Node 24, no extra packages)
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { presignRaw, uriEncode, encodeKeyPath } from '../../convex/helpers/r2.ts'
import {
  deriveVideoKey,
  signPlaybackToken,
  verifyPlaybackToken,
  workerSecretOk,
} from '../../convex/helpers/videoCrypto.ts'

test('SigV4 presign matches the AWS documented example', async () => {
  // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html (example)
  const url = await presignRaw({
    method: 'GET',
    origin: 'https://examplebucket.s3.amazonaws.com',
    path: '/test.txt',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    expiresSec: 86400,
    now: new Date('2013-05-24T00:00:00Z'),
  })
  assert.match(url, /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/)
})

test('object keys are RFC 3986 encoded, slashes kept', () => {
  assert.equal(uriEncode("a b!'()*"), 'a%20b%21%27%28%29%2A')
  assert.equal(encodeKeyPath('videos/abc/720p/seg_0001.ts'), 'videos/abc/720p/seg_0001.ts')
})

const master = new Uint8Array(randomBytes(32))
const claims = () => ({ u: 'user1', a: 'asset1', l: 'lesson1', exp: Date.now() + 60_000 })

test('a valid token verifies', async () => {
  const token = await signPlaybackToken(claims(), master)
  const check = await verifyPlaybackToken(token, Date.now(), master)
  assert.equal(check.ok, true)
  assert.equal(check.claims.u, 'user1')
})

test('missing, malformed, tampered, expired and foreign tokens are refused', async () => {
  const token = await signPlaybackToken(claims(), master)
  const [body, sig] = token.split('.')
  assert.deepEqual(await verifyPlaybackToken(null, Date.now(), master), { ok: false, reason: 'missing' })
  assert.equal((await verifyPlaybackToken('garbage', Date.now(), master)).reason, 'malformed')
  // Someone edits the claims (another user / lesson / a later expiry) but keeps the signature
  const forgedBody = Buffer.from(JSON.stringify({ ...claims(), u: 'someone-else' })).toString('base64url')
  assert.equal((await verifyPlaybackToken(`${forgedBody}.${sig}`, Date.now(), master)).reason, 'signature')
  assert.equal((await verifyPlaybackToken(`${body}.${sig.slice(0, -2)}AA`, Date.now(), master)).reason, 'signature')
  const expired = await signPlaybackToken({ ...claims(), exp: Date.now() - 1 }, master)
  assert.equal((await verifyPlaybackToken(expired, Date.now(), master)).reason, 'expired')
  const otherMaster = new Uint8Array(randomBytes(32))
  assert.equal((await verifyPlaybackToken(token, Date.now(), otherMaster)).reason, 'signature')
})

test('video keys are 16 bytes, stable per key id and different between videos', async () => {
  const a1 = await deriveVideoKey('aaaa', master)
  const a2 = await deriveVideoKey('aaaa', master)
  const b = await deriveVideoKey('bbbb', master)
  assert.equal(a1.length, 16)
  assert.deepEqual(a1, a2)
  assert.notDeepEqual(a1, b)
  assert.notDeepEqual(a1, await deriveVideoKey('aaaa', new Uint8Array(randomBytes(32))))
})

test('the worker secret must match exactly', async () => {
  process.env.LEARN_VIDEO_WORKER_SECRET = 'x'.repeat(40)
  assert.equal(await workerSecretOk(`Bearer ${'x'.repeat(40)}`), true)
  assert.equal(await workerSecretOk(`Bearer ${'x'.repeat(39)}y`), false)
  assert.equal(await workerSecretOk(null), false)
  assert.equal(await workerSecretOk('x'.repeat(40)), false)
  process.env.LEARN_VIDEO_WORKER_SECRET = 'short'
  assert.equal(await workerSecretOk('Bearer short'), false, 'secrets under 32 characters are never accepted')
})
