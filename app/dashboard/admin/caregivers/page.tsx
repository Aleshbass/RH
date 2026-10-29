'use client'

import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { format } from 'date-fns'
import { HeartPulse, Search, Users } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { AdminPage, EmptyState, FilterChips, PageHeader, Panel, StatTile, StatusBadge, inputClass, tableWrapClass } from '@/components/admin/ui'
import { LoadingBlock } from '@/components/admin/partners/shared'
import { cn } from '@/lib/utils'

type Row = {
  grantId: string
  status: 'active' | 'pending' | 'revoked'
  caregiver: { _id: string; name: string; phone: string | null; email: string | null; onWeb: boolean }
  patient: { _id: string; name: string; patientNumber: string | null }
  relationship: string
  access: 'view' | 'book_pay' | 'full'
  managed: boolean
  source: 'invite' | 'caregiver' | 'joy'
  since: number
}

const listRef = makeFunctionReference<'query', { limit?: number }, { rows: Row[]; pendingInvites: number } | null>('careCircle:adminListCareCircles')

const ACCESS: Record<Row['access'], string> = { view: 'Sees care', book_pay: 'Books & pays', full: 'Full access' }
const SOURCE: Record<Row['source'], string> = { invite: 'Invited', caregiver: 'Added by caregiver', joy: 'Joy (WhatsApp)' }

type Filter = 'active' | 'managed' | 'joy' | 'removed' | 'all'

/** Family members and caregivers: who looks after whom, what they can do and how it started. */
export default function AdminCaregiversPage() {
  const data = useQuery(listRef, { limit: 500 })
  const [filter, setFilter] = useState<Filter>('active')
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      if (filter === 'active' && row.status !== 'active') return false
      if (filter === 'managed' && !(row.managed && row.status === 'active')) return false
      if (filter === 'joy' && row.source !== 'joy') return false
      if (filter === 'removed' && row.status !== 'revoked') return false
      if (!term) return true
      return [row.caregiver.name, row.caregiver.phone, row.caregiver.email, row.patient.name, row.patient.patientNumber, row.relationship]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [data, filter, search])

  const all = data?.rows ?? []
  const active = all.filter((r) => r.status === 'active')
  const caregivers = new Set(active.map((r) => r.caregiver._id)).size
  const patients = new Set(active.map((r) => r.patient._id)).size

  return (
    <AdminPage>
      <PageHeader title="Family & caregivers" description="Who helps look after whom, what they can do, and how it started (an invite, a caregiver adding a relative, or Joy on WhatsApp)." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Caregivers" value={data ? caregivers : '…'} hint="With access right now" icon={Users} />
        <StatTile label="Patients with a circle" value={data ? patients : '…'} icon={HeartPulse} />
        <StatTile label="Profiles caregivers manage" value={data ? active.filter((r) => r.managed).length : '…'} hint="e.g. elderly parents" />
        <StatTile label="Invites waiting" value={data ? data.pendingInvites : '…'} hint="Not opened yet" />
      </div>

      <Panel
        title="Care circles"
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, patient ID" className={cn(inputClass, 'h-9 w-56 pl-9')} aria-label="Search care circles" />
          </div>
        }
      >
        <div className="space-y-4 p-4 sm:p-5">
          <FilterChips
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'active', label: 'Active', count: active.length },
              { value: 'managed', label: 'Managed profiles', count: active.filter((r) => r.managed).length },
              { value: 'joy', label: 'From Joy', count: all.filter((r) => r.source === 'joy').length },
              { value: 'removed', label: 'Removed', count: all.filter((r) => r.status === 'revoked').length },
              { value: 'all', label: 'All', count: all.length },
            ]}
          />
          {data === undefined ? (
            <LoadingBlock />
          ) : rows.length === 0 ? (
            <EmptyState icon={<Users className="h-6 w-6" />} title="No care circles here" description="Patients invite family from their Care circle page; caregivers add relatives from the family portal." />
          ) : (
            <div className={tableWrapClass}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 pr-4">Caregiver</th>
                    <th className="py-2 pr-4">Cares for</th>
                    <th className="py-2 pr-4">Access</th>
                    <th className="py-2 pr-4">How it started</th>
                    <th className="py-2">Since</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.grantId} className="border-b last:border-b-0">
                      <td className="py-3 pr-4 align-top">
                        <p className="font-medium text-rh-ink dark:text-white">{row.caregiver.name}</p>
                        <p className="text-xs text-neutral-500">{[row.caregiver.phone, row.caregiver.email].filter(Boolean).join(' · ') || 'No contact details'}</p>
                        {!row.caregiver.onWeb && <p className="text-xs text-neutral-500">WhatsApp only</p>}
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <p className="font-medium text-rh-ink dark:text-white">{row.patient.name}</p>
                        <p className="text-xs text-neutral-500">
                          {row.relationship}
                          {row.patient.patientNumber ? ` · ${row.patient.patientNumber}` : ''}
                        </p>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <div className="flex flex-wrap gap-1">
                          <StatusBadge tone={row.status === 'active' ? 'green' : 'neutral'}>{row.status === 'revoked' ? 'Removed' : ACCESS[row.access]}</StatusBadge>
                          {row.managed && <StatusBadge tone="teal">Manages profile</StatusBadge>}
                        </div>
                      </td>
                      <td className="py-3 pr-4 align-top text-neutral-600 dark:text-neutral-300">{SOURCE[row.source]}</td>
                      <td className="py-3 align-top text-neutral-600 dark:text-neutral-300">{format(row.since, 'd MMM yyyy')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>
    </AdminPage>
  )
}
