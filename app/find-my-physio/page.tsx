import { redirect } from 'next/navigation'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Replaced by the service-first booking flow; old links land there, keeping any service or area. */
export default async function FindMyPhysioPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const query = new URLSearchParams()
  for (const key of ['service', 'zone', 'area']) {
    const value = params[key]
    if (typeof value === 'string' && value) query.set(key, value)
  }
  const qs = query.toString()
  redirect(qs ? `/get-care?${qs}` : '/get-care')
}
