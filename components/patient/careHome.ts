'use client'

import { makeFunctionReference } from 'convex/server'
import { useQuery } from 'convex/react'

/** patients:getMyCareHome (written out: the generated `api` type is at TypeScript's depth limit) */
export type CareHome = {
  kind: 'clinic' | 'mixed' | 'rehabify'
  clinic: {
    _id: string
    name: string
    logoUrl: string | null
    address: string | null
    city: string | null
    phone: string | null
    email: string | null
    deskUserId: string
    services: string[]
  } | null
  clinicians: { _id: string; name: string; imageUrl: string | null }[]
} | null

const careHomeRef = makeFunctionReference<'query', Record<string, never>, CareHome>('patients:getMyCareHome')

/**
 * Where the patient's care lives. In clinic mode (`clinic` set) the portal shows the clinic's name
 * and logo, its clinicians and contact details, and leaves out the Rehabify marketplace (Find a
 * physio, Joy, Rehabify Care prices and Flex).
 */
export function useCareHome() {
  const home = useQuery(careHomeRef, {})
  const clinic = home?.kind === 'clinic' ? home.clinic : null
  return {
    loaded: home !== undefined,
    clinic,
    clinicians: home?.clinicians ?? [],
    /** Show Rehabify's own options (Find a physio, Joy): not to a clinic's patients */
    showMarketplace: home !== undefined && !clinic,
  }
}
