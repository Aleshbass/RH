import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import { PricingPage } from '@/components/pricing/PricingPage'
import type { Catalogue } from '@/components/pricing/shared'

export const revalidate = 60

/** Server-rendered so the prices are in the HTML; the client query keeps them live. */
async function loadCatalogue(): Promise<Catalogue | null> {
  try {
    return await fetchQuery(api.serviceTariffs.getCatalogue, {})
  } catch {
    // Convex unreachable (or not deployed yet): the page starts from the code defaults
    return null
  }
}

export default async function Page() {
  const catalogue = await loadCatalogue()
  return <PricingPage initialCatalogue={catalogue} />
}
