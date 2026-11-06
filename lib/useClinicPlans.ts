'use client'

import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { mergeClinicPlans, type ClinicPlanCatalogue } from '@/lib/clinicPlans'

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const catalogueRef = makeFunctionReference<'query', Record<string, never>, ClinicPlanCatalogue>('clinicPlans:publicCatalogue')
const DEFAULTS = mergeClinicPlans(null)

/** Clinic plans as an admin last set them (Admin › Clinic plans); the defaults while loading. */
export function useClinicPlans(): ClinicPlanCatalogue {
  return useQuery(catalogueRef, {}) ?? DEFAULTS
}
