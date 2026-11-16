// Stills for the 2D simulation scenes: every scene with "art2d" in content/sim-cases/*.json is drawn
// from components/learn/sims/art2d/clinicScene.ts and saved as its "src" (.webp) plus a .jpg twin
// (link previews can't read WebP). The live stage draws the same art in the browser; these stills
// are the poster, the share card and the replay video's fallback.
//
//   node scripts/sims/render2d.mjs                 all cases
//   node scripts/sims/render2d.mjs --case <slug>   one case
//
// Needs Microsoft Edge (Playwright drives it) and ffmpeg on the PATH.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
const only = args.includes('--case') ? args[args.indexOf('--case') + 1] : null

// The scene module is TypeScript: compile it on the fly (no build step needed)
const ts = require('typescript')
const source = readFileSync(path.join(root, 'components/learn/sims/art2d/clinicScene.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const mod = { exports: {} }
new Function('module', 'exports', 'require', compiled)(mod, mod.exports, require)
const { clinicSceneSvg } = mod.exports

const { chromium } = require('@playwright/test')
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

let made = 0
for (const file of readdirSync(path.join(root, 'content/sim-cases')).filter((f) => f.endsWith('.json'))) {
  const def = JSON.parse(readFileSync(path.join(root, 'content/sim-cases', file), 'utf8'))
  if (only && def.slug !== only) continue
  for (const [id, scene] of Object.entries(def.scenes ?? {})) {
    if (!scene.art2d) continue
    const webp = path.join(root, 'public', scene.src.replace(/^\//, ''))
    const jpg = webp.replace(/\.webp$/i, '.jpg')
    const png = webp.replace(/\.webp$/i, '.tmp.png')
    mkdirSync(path.dirname(webp), { recursive: true })
    await page.setContent(`<html><body style="margin:0">${clinicSceneSvg({ pose: scene.art2d.pose })}</body></html>`)
    await page.waitForTimeout(200)
    await page.screenshot({ path: png })
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-c:v', 'libwebp', '-quality', '86', webp])
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-q:v', '3', jpg])
    rmSync(png)
    console.log(`${def.slug} · ${id}: ${path.relative(root, webp)} (+ .jpg)`)
    made++
  }
}
await browser.close()
console.log(made ? `${made} still${made === 1 ? '' : 's'} made` : 'No 2D scenes found')
