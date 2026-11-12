// Runs master.py (in Blender) on voice MP3s, in place. Used by generate.mjs and
// scripts/motion/generate-cues.mjs for ElevenLabs takes, whose loudness varies from line to line.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const BLENDER = process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'

export function masterMp3(files) {
  if (!files.length) return
  const list = path.join(os.tmpdir(), `rh-master-${process.pid}.json`)
  fs.writeFileSync(list, JSON.stringify(files))
  try {
    execFileSync(BLENDER, ['-b', '--factory-startup', '--python', path.join(HERE, 'master.py'), '--', list], { stdio: ['ignore', 'ignore', 'inherit'] })
  } finally {
    fs.rmSync(list, { force: true })
  }
}
