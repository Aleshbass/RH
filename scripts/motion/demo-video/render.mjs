// Renders the camera-coach demo video: the Rehabify character in a living room with the coach
// overlay, encoded in Chrome (WebCodecs H.264) to a looping MP4 plus a WebP poster.
//
//   node scripts/motion/demo-video/render.mjs [--assets <out dir>] [--out <file.mp4>] [--query "w=1280&h=720&reps=3"]
//
// Needs Google Chrome installed (Chromium builds can't encode H.264) and the unencrypted Blender
// outputs: scripts/exercise-3d/out/character.glb and out/clips/<clip>.glb (gitignored).

import fs from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..', '..')
const esbuild = createRequire(fs.realpathSync(path.join(ROOT, 'node_modules', 'tsx', 'package.json')))('esbuild')
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('@playwright/test')

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const ASSETS = path.resolve(opt('--assets', path.join(ROOT, 'scripts', 'exercise-3d', 'out')))
const OUT = path.resolve(opt('--out', path.join(ROOT, 'public', 'media', 'camera-coach-demo.mp4')))
const QUERY = opt('--query', '')

const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-demo-video-'))
await esbuild.build({
  entryPoints: [path.join(HERE, 'page.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: path.join(dist, 'page.js'),
  tsconfig: path.join(ROOT, 'tsconfig.json'),
  logLevel: 'warning',
})
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><script type="module" src="/page.js"></script>')

const types = { '.js': 'text/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const file = url.pathname.startsWith('/assets/')
    ? path.join(ASSETS, url.pathname.slice('/assets/'.length))
    : url.pathname.startsWith('/vendor/')
      ? path.join(ROOT, 'public', url.pathname)
      : path.join(dist, url.pathname === '/' ? 'index.html' : url.pathname)
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end()
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(data)
  })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
page.on('console', (m) => m.text().startsWith('[demo]') && console.log(m.text()))
page.on('pageerror', (e) => console.log('page error:', e.message))
await page.goto(`http://127.0.0.1:${server.address().port}/?${QUERY}`, { waitUntil: 'commit', timeout: 120_000 })
await page.waitForFunction(() => window.__done === true, null, { timeout: 60 * 60_000, polling: 2000 })
const result = await page.evaluate(() => ({ error: window.__error, video: window.__video, poster: window.__poster, info: window.__info }))
await browser.close()
server.close()
fs.rmSync(dist, { recursive: true, force: true })
if (result.error) {
  console.error(result.error)
  process.exit(1)
}
fs.mkdirSync(path.dirname(OUT), { recursive: true })
if (!result.video && result.poster?.startsWith('data:image/png')) {
  // A still for checking the look (?still=<seconds>)
  const file = OUT.replace(/\.mp4$/, '.still.png')
  fs.writeFileSync(file, Buffer.from(result.poster.split(',')[1], 'base64'))
  console.log(`still: ${file}`, result.info)
  process.exit(0)
}
if (!result.video) {
  console.error('No video produced')
  process.exit(1)
}
fs.mkdirSync(path.dirname(OUT), { recursive: true })
// <name>.av1.webm and <name>.vp9.webm (offered first), <name>.mp4 (H.264, plays everywhere), <name>.webp poster
const files = JSON.parse(result.video)
const base = OUT.replace(/\.mp4$/, '')
for (const [name, data] of Object.entries(files)) {
  const file = name === 'mp4' ? `${base}.mp4` : `${base}.${name}.webm`
  fs.writeFileSync(file, Buffer.from(data, 'base64'))
  console.log(`${path.relative(ROOT, file)}: ${(fs.statSync(file).size / 1e6).toFixed(2)} MB`)
}
if (result.poster) fs.writeFileSync(`${base}.webp`, Buffer.from(result.poster.split(',')[1], 'base64'))
console.log(result.info)
