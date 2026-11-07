// Camera-coach end-to-end check in headless Chromium: the 3D coach's own clip is rendered side-on
// and run through the real tracking pipeline (MediaPipe from the CDN, smoothing, rep counting).
//
//   node tests/motion/camera-e2e/run.mjs [--assets <dir>] [clipId:exerciseKey[:loops] ...]
//
// Needs the unencrypted Blender outputs (gitignored): scripts/exercise-3d/out/character.glb and
// out/clips/<clip>.glb, built with scripts/exercise-3d/blender/build_all.py. Pass --assets to point
// at another checkout's out/ folder. The first run downloads about 11 MB.

import fs from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..', '..')
// esbuild comes with tsx (pnpm keeps it next to tsx's real folder, not in node_modules)
const require = createRequire(fs.realpathSync(path.join(ROOT, 'node_modules', 'tsx', 'package.json')))
const esbuild = require('esbuild')
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('@playwright/test')

const args = process.argv.slice(2)
const assetsAt = args.indexOf('--assets')
const ASSETS = assetsAt >= 0 ? path.resolve(args.splice(assetsAt, 2)[1]) : path.join(ROOT, 'scripts', 'exercise-3d', 'out')
const runs = (args.length ? args : ['sit-to-stand:sit-to-stand', 'seated-knee-extension-left:seated-knee-extension', 'shoulder-flexion:shoulder-flexion']).map((a) => {
  const [clip, exercise, loops = '4'] = a.split(':')
  return { clip, exercise, loops }
})

const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-camera-e2e-'))
await esbuild.build({
  entryPoints: [path.join(HERE, 'page.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile: path.join(dist, 'page.js'),
  tsconfig: path.join(ROOT, 'tsconfig.json'),
  logLevel: 'warning',
})
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0"><script type="module" src="/page.js"></script>')

const types = { '.js': 'text/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  let file
  if (url.pathname.startsWith('/assets/')) file = path.join(ASSETS, url.pathname.slice('/assets/'.length))
  else if (url.pathname.startsWith('/vendor/')) file = path.join(ROOT, 'public', url.pathname)
  else file = path.join(dist, url.pathname === '/' ? 'index.html' : url.pathname)
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(data)
  })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] })
// One browser profile for all runs, so MediaPipe downloads once (Cache Storage)
const context = await browser.newContext({ viewport: { width: 700, height: 520 } })
let failed = 0
for (const run of runs) {
  const page = await context.newPage()
  page.on('console', (m) => m.text().startsWith('[e2e]') && console.log('  ', m.text()))
  page.on('pageerror', (e) => console.log('   page error:', e.message))
  console.log(`\n${run.clip} (${run.exercise}), ${run.loops} loops`)
  // 127.0.0.1 (not localhost, which can resolve to IPv6) is still a secure context for Web Crypto
  await page.goto(`http://127.0.0.1:${port}/?clip=${run.clip}&exercise=${run.exercise}&loops=${run.loops}`, {
    waitUntil: 'commit',
    timeout: 120_000,
  })
  await page.waitForFunction(() => window.__done === true, null, { timeout: 20 * 60_000, polling: 1000 })
  const result = await page.evaluate(() => window.__result)
  console.log(JSON.stringify(result, null, 2))
  if (!result || result.error || result.reps !== result.expectedReps) failed++
  await page.close()
}
await browser.close()
server.close()
fs.rmSync(dist, { recursive: true, force: true })
console.log(failed ? `\n${failed} of ${runs.length} runs did not count every rep` : `\nall ${runs.length} runs counted every rep`)
process.exit(failed ? 1 : 0)
