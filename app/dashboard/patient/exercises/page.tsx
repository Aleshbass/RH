import { redirect } from 'next/navigation'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * Home exercises now live on My care plan, next to the treatment plan. Reminders, emails,
 * notifications and Paystack's Flex return (?reference=…) still link here, so the query string
 * is kept. Offline, app/sw.ts sends this address to the stored care plan instead.
 */
export default async function PatientExercisesRedirect({ searchParams }: Props) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v)
  }
  const search = query.toString()
  redirect(`/dashboard/patient/treatment-plans${search ? `?${search}` : ''}#today`)
}
