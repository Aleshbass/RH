/**
 * The simulation cases in this repo. Git is the source of truth: Admin › Learn › Simulations loads
 * them into Convex as drafts, a physio signs off each version, and an admin publishes it.
 * To change a published case, edit its JSON and raise "version".
 */
import type { SimCase } from '../../lib/learn/simulation/engine'
import ankle from './ankle-sprain-after-football.json'
import backPain from './back-pain-saddle-numbness.json'
import knee from './knee-replacement-calf-pain.json'

export const SIM_CASES = [knee, backPain, ankle] as unknown as SimCase[]
