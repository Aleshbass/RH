'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { Download, Search, SearchX, UserRound, Users } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AdminPage,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatTile,
  StatusBadge,
  downloadCsv,
  inputClass,
  softButtonClass,
  tableWrapClass,
} from '@/components/admin/ui'
import { UserManagement } from '@/components/dashboard/admin/UserManagement'
import { PhysioSheet } from '@/components/admin/physios/PhysioSheet'
import { cn } from '@/lib/utils'
import { SourceTags } from './PatientBits'
import { PatientSheet } from './PatientSheet'
import { FORMAT_LABEL, MISSING_LABEL, SOURCE_LABEL, patientApi, placeText, type DirectoryRow, type PatientSource } from './patientApi'

type Filter = 'all' | PatientSource | 'no_physio' | 'missing' | 'looking'

const SOURCE_FILTERS: PatientSource[] = ['joy', 'doctor', 'partner', 'clinic', 'physio', 'find_a_physio', 'website']

function matches(row: DirectoryRow, filter: Filter) {
  if (filter === 'all') return true
  if (filter === 'no_physio') return !row.hasPhysio
  if (filter === 'missing') return row.missing.length > 0
  if (filter === 'looking') return row.lookingForCare !== null
  return row.sources.includes(filter)
}

/** Admin › All patients goes here; every other ?role= keeps the accounts list. */
export function UsersOrPatients() {
  const searchParams = useSearchParams()
  return searchParams?.get('role') === 'patient' ? <PatientDirectory /> : <UserManagement />
}

/**
 * All patients, each with where they came from (tags rather than separate lists), what we know
 * and who they're with. Opening one shows the full record; ?patient=<id> opens it from a link.
 */
export function PatientDirectory() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const data = useQuery(patientApi.directory, {})
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [physioId, setPhysioId] = useState<string | null>(null)
  const openId = searchParams?.get('patient') ?? null
  const setOpen = (id: string | null) => {
    const params = new URLSearchParams(searchParams?.toString())
    if (id) params.set('patient', id)
    else params.delete('patient')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const rows = data?.rows
  const counts = useMemo(() => {
    const all = rows ?? []
    const count = (f: Filter) => all.filter((r) => matches(r, f)).length
    return {
      all: all.length,
      no_physio: count('no_physio'),
      missing: count('missing'),
      looking: count('looking'),
      ...Object.fromEntries(SOURCE_FILTERS.map((s) => [s, count(s)])),
    } as Record<Filter, number>
  }, [rows])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    return (rows ?? []).filter((r) => {
      if (!matches(r, filter)) return false
      if (!q) return true
      const text = [r.name, r.email, r.rehabifyId, r.complaint, r.area, r.city, r.state, ...r.physios.map((p) => p.name)].filter(Boolean).join(' ').toLowerCase()
      return text.includes(q) || (digits.length >= 4 && (r.phone ?? '').replace(/\D/g, '').includes(digits))
    })
  }, [rows, filter, search])

  const exportCsv = () =>
    downloadCsv(
      `rehabify-patients-${format(new Date(), 'yyyy-MM-dd')}`,
      shown.map((r) => ({
        'Rehabify ID': r.rehabifyId ?? '',
        Name: r.name,
        Phone: r.phone ?? '',
        Email: r.email ?? '',
        Age: r.age ?? '',
        State: r.state ?? '',
        Area: [r.area, r.city].filter(Boolean).join(', '),
        Complaint: r.complaint ?? '',
        Format: r.format ? FORMAT_LABEL[r.format] : '',
        Source: r.sources.map((s) => SOURCE_LABEL[s]).join('; '),
        Physio: r.physios.map((p) => p.name).join('; '),
        Missing: r.missing.map((m) => MISSING_LABEL[m] ?? m).join('; '),
        Joined: format(r.joinedAt, 'yyyy-MM-dd'),
      }))
    )

  const chip = (value: Filter, label: string) => ({ value, label, count: counts[value] })
  const filterOptions = [
    chip('all', 'All'),
    chip('looking', 'Looking for care'),
    chip('no_physio', 'No physio yet'),
    chip('missing', 'Missing details'),
    ...SOURCE_FILTERS.map((s) => chip(s, SOURCE_LABEL[s])),
  ].filter((o) => o.value === 'all' || o.count > 0)

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Patients & Care"
        title="All patients"
        description="Every patient with where they came from, what they need and who they're with. Open one to see everything and pair them with a physio."
        actions={
          <div className="flex gap-2">
            <Link href="/dashboard/admin/users" className={cn(softButtonClass, 'inline-flex h-10 items-center gap-1.5')}>
              <Users className="h-4 w-4" /> All accounts
            </Link>
            <button type="button" onClick={exportCsv} disabled={shown.length === 0} className={cn(softButtonClass, 'inline-flex h-10 items-center gap-1.5')}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        }
      />

      {data === undefined ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Patients" value={counts.all} hint={data.capped ? 'Newest 400 shown' : undefined} />
            <StatTile label="Looking for care now" value={counts.looking} hint="Open in Patients looking for care" tone={counts.looking ? 'attention' : 'default'} />
            <StatTile label="No physio yet" value={counts.no_physio} hint="Nobody linked to them" />
            <StatTile label="Missing details" value={counts.missing} hint="Age, state, area, complaint or format" />
          </div>

          <Panel bodyClassName="pb-2">
            <div className="space-y-3 px-5 pb-3 pt-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <FilterChips value={filter} onChange={setFilter} options={filterOptions} />
                <div className="relative w-full shrink-0 lg:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, phone, ID, area, complaint"
                    className={cn(inputClass, 'h-10 pl-9')}
                    aria-label="Search patients"
                  />
                </div>
              </div>
            </div>

            {shown.length === 0 ? (
              <EmptyState icon={rows && rows.length ? <SearchX /> : <UserRound />} title={rows && rows.length ? 'No patients match' : 'No patients yet'} />
            ) : (
              <div className={tableWrapClass}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-5 py-2.5 text-left">Patient</th>
                      <th className="px-3 py-2.5 text-left">Came from</th>
                      <th className="hidden px-3 py-2.5 text-left md:table-cell">About</th>
                      <th className="hidden px-3 py-2.5 text-left lg:table-cell">Needs</th>
                      <th className="px-3 py-2.5 text-left">Physio</th>
                      <th className="hidden px-5 py-2.5 text-right xl:table-cell">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.userId} className="cursor-pointer border-b" onClick={() => setOpen(r.userId)}>
                        <td className="px-5 py-3">
                          <p className="font-semibold text-rh-ink dark:text-white">{r.name}</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {[r.rehabifyId, r.phone].filter(Boolean).join(' · ') || r.email}
                          </p>
                          {r.lookingForCare && (
                            <StatusBadge tone="red" className="mt-1">
                              Looking for care
                            </StatusBadge>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <SourceTags sources={r.sources} />
                        </td>
                        <td className="hidden px-3 py-3 md:table-cell">
                          <p className="text-rh-ink dark:text-white">{[r.age !== null ? `${r.age} yrs` : null, placeText(r) || null].filter(Boolean).join(' · ') || '—'}</p>
                          {r.missing.length > 0 && (
                            <p className="text-xs text-[#b4690e] dark:text-amber-300">Missing: {r.missing.map((m) => MISSING_LABEL[m] ?? m).join(', ')}</p>
                          )}
                        </td>
                        <td className="hidden max-w-[240px] px-3 py-3 lg:table-cell">
                          <p className="truncate text-rh-ink dark:text-white">{r.complaint ?? '—'}</p>
                          {r.format && <p className="text-xs text-neutral-500">{FORMAT_LABEL[r.format]}</p>}
                          {r.redFlags.length > 0 && <p className="text-xs font-semibold text-rose-600">Red flag</p>}
                        </td>
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          {r.physios.length ? (
                            r.physios.map((p) => (
                              <button
                                key={p.physioId}
                                type="button"
                                onClick={() => setPhysioId(p.physioId)}
                                className="block text-left text-sm font-medium text-rh-ink underline-offset-2 hover:underline dark:text-white"
                              >
                                {p.name}
                              </button>
                            ))
                          ) : (
                            <button type="button" onClick={() => setOpen(r.userId)} className="text-xs font-semibold text-[#b4690e] underline-offset-2 hover:underline dark:text-amber-300">
                              No physio · pair
                            </button>
                          )}
                        </td>
                        <td className="hidden whitespace-nowrap px-5 py-3 text-right text-neutral-500 xl:table-cell">{format(r.joinedAt, 'd MMM yyyy')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      <PatientSheet patientId={openId} onClose={() => setOpen(null)} />
      <PhysioSheet physioId={physioId} preview={null} onClose={() => setPhysioId(null)} />
    </AdminPage>
  )
}
