'use client'

import { Suspense, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ArrowUpRight, Briefcase, Inbox, Plus, Search, Users } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatTile,
  StatusBadge,
  Stagger,
  StaggerItem,
  inputClass,
  listRowClass,
  primaryButtonClass,
  softButtonClass,
  tabsListClass,
} from '@/components/admin/ui'
import { ApplicationSheet, APPLICATION_TONE } from '@/components/admin/careers/ApplicationSheet'
import { JobEditorSheet } from '@/components/admin/careers/JobEditorSheet'
import {
  APPLICATION_STATUS_LABEL,
  careersApi,
  jobMeta,
  type AdminApplication,
  type AdminJob,
  type ApplicationStatus,
  type JobStatus,
} from '@/lib/careers'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const JOB_TONE: Record<JobStatus, 'green' | 'neutral' | 'amber'> = { open: 'green', draft: 'amber', closed: 'neutral' }
const JOB_LABEL: Record<JobStatus, string> = { open: 'Open', draft: 'Draft', closed: 'Closed' }

type Tab = 'roles' | 'applications'
type StatusFilter = 'all' | ApplicationStatus

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message.replace(/^.*ConvexError: /, '').split('\n')[0] : fallback

function CareersAdmin() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab: Tab = searchParams?.get('tab') === 'applications' ? 'applications' : 'roles'
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams?.toString())
    params.set('tab', next)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const jobs = useQuery(careersApi.adminListJobs, {})
  const applications = useQuery(careersApi.adminListApplications, {})
  const setJobStatus = useMutation(careersApi.adminSetJobStatus)
  const deleteJob = useMutation(careersApi.adminDeleteJob)

  const [editing, setEditing] = useState<{ open: boolean; job: AdminJob | null }>({ open: false, job: null })
  const [deleting, setDeleting] = useState<AdminJob | null>(null)
  const [viewing, setViewing] = useState<AdminApplication | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [jobFilter, setJobFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const teams = useMemo(() => Array.from(new Set((jobs ?? []).map((j) => j.team))).sort(), [jobs])
  const openCount = (jobs ?? []).filter((j) => j.status === 'open').length
  const newCount = (applications ?? []).filter((a) => a.status === 'new').length

  const counts = useMemo(() => {
    const rows = (applications ?? []).filter((a) => jobFilter === 'all' || a.jobId === jobFilter)
    const by = (s: ApplicationStatus) => rows.filter((a) => a.status === s).length
    return { all: rows.length, new: by('new'), reviewing: by('reviewing'), interview: by('interview'), accepted: by('accepted'), rejected: by('rejected') }
  }, [applications, jobFilter])

  const shownApplications = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (applications ?? []).filter((a) => {
      if (jobFilter !== 'all' && a.jobId !== jobFilter) return false
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      if (!q) return true
      return a.fullName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.jobTitle.toLowerCase().includes(q)
    })
  }, [applications, jobFilter, statusFilter, search])

  const changeStatus = async (job: AdminJob, status: JobStatus) => {
    try {
      await setJobStatus({ id: job._id, status })
      playSound('success')
      toast.success(status === 'open' ? `${job.title} is live on /careers` : `${job.title} is ${JOB_LABEL[status].toLowerCase()}`)
    } catch (error) {
      playSound('error')
      toast.error(errorText(error, 'Could not update the role'))
    }
  }

  const copyLink = async (job: AdminJob) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/careers/${job.slug}`)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy the link')
    }
  }

  const viewApplicationsFor = (job: AdminJob) => {
    setJobFilter(job._id)
    setStatusFilter('all')
    setTab('applications')
  }

  return (
    <AdminPage>
      <PageHeader
        title="Careers"
        description="Post roles on /careers and review the people who apply."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="ghost" className={softButtonClass}>
              <a href="/careers" target="_blank" rel="noopener noreferrer">
                View page <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
            <Button onClick={() => setEditing({ open: true, job: null })} className={primaryButtonClass}>
              <Plus className="mr-1.5 h-4 w-4" /> New role
            </Button>
          </div>
        }
      />

      <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StaggerItem>
          <StatTile label="Open roles" icon={Briefcase} value={jobs === undefined ? '–' : openCount} hint={jobs ? `${jobs.length} in total` : undefined} />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="New applications"
            icon={Inbox}
            value={applications === undefined ? '–' : newCount}
            tone={newCount > 0 ? 'attention' : 'default'}
            href="/dashboard/admin/careers?tab=applications"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="All applications" icon={Users} value={applications === undefined ? '–' : applications.length} />
        </StaggerItem>
      </Stagger>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="space-y-4">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="applications">
            Applications
            {newCount > 0 && <span className="ml-1.5 rounded-full bg-rh-amber px-1.5 text-[10px] font-semibold tabular-nums text-rh-ink">{newCount}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-0">
          <Panel>
            {jobs === undefined ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <EmptyState
                icon={<Briefcase />}
                title="No roles yet"
                description="Create your first role. It stays a draft until you publish it."
                action={
                  <Button onClick={() => setEditing({ open: true, job: null })} className={primaryButtonClass}>
                    <Plus className="mr-1.5 h-4 w-4" /> New role
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {jobs.map((job) => (
                  <li key={job._id} className={cn(listRowClass, 'flex-col items-stretch gap-3 py-4 sm:flex-row sm:items-center')}>
                    <button type="button" onClick={() => setEditing({ open: true, job })} className="min-w-0 flex-1 text-left">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-rh-ink dark:text-white">{job.title}</span>
                        <StatusBadge tone={JOB_TONE[job.status]}>{JOB_LABEL[job.status]}</StatusBadge>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-neutral-500 dark:text-neutral-400">{jobMeta(job).join(' · ')}</span>
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => viewApplicationsFor(job)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-rh-ink hover:bg-black/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
                      >
                        {job.applicationCount} {job.applicationCount === 1 ? 'application' : 'applications'}
                        {job.newCount > 0 && <span className="ml-1 font-semibold">· {job.newCount} new</span>}
                      </button>
                      {job.status === 'open' ? (
                        <>
                          <Button size="sm" variant="ghost" className={softButtonClass} onClick={() => copyLink(job)}>Copy link</Button>
                          <Button size="sm" variant="ghost" className={softButtonClass} onClick={() => changeStatus(job, 'closed')}>Close</Button>
                        </>
                      ) : (
                        <Button size="sm" className={primaryButtonClass} onClick={() => changeStatus(job, 'open')}>
                          {job.status === 'closed' ? 'Reopen' : 'Publish'}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className={softButtonClass} onClick={() => setEditing({ open: true, job })}>Edit</Button>
                      {job.applicationCount === 0 && (
                        <Button size="sm" variant="ghost" className="rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setDeleting(job)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="applications" className="mt-0">
          <Panel>
            <div className="flex flex-col gap-3 border-b border-black/[0.05] p-4 dark:border-white/[0.06] sm:px-5 lg:flex-row lg:items-center lg:justify-between">
              <FilterChips
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: 'All', count: counts.all },
                  { value: 'new', label: 'New', count: counts.new },
                  { value: 'reviewing', label: 'Reviewing', count: counts.reviewing },
                  { value: 'interview', label: 'Interview', count: counts.interview },
                  { value: 'accepted', label: 'Accepted', count: counts.accepted },
                  { value: 'rejected', label: 'Not progressing', count: counts.rejected },
                ]}
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={jobFilter} onValueChange={setJobFilter}>
                  <SelectTrigger className={cn(inputClass, 'sm:w-[220px]')} aria-label="Filter by role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    {(jobs ?? []).map((job) => (
                      <SelectItem key={job._id} value={job._id}>{job.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <Input
                    placeholder="Search name or email"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={cn(inputClass, 'pl-9 sm:w-[220px]')}
                  />
                </div>
              </div>
            </div>

            {applications === undefined ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]" />
                ))}
              </div>
            ) : shownApplications.length === 0 ? (
              <EmptyState
                icon={<Inbox />}
                title="No applications here"
                description={search || statusFilter !== 'all' || jobFilter !== 'all' ? 'Try another filter.' : 'Applications from /careers appear here.'}
              />
            ) : (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {shownApplications.map((application) => (
                  <li key={application._id}>
                    <button type="button" onClick={() => setViewing(application)} className={cn(listRowClass, 'w-full text-left')}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rh-canvas text-xs font-semibold text-rh-ink dark:bg-white/[0.06] dark:text-white">
                        {application.fullName.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-rh-ink dark:text-white">{application.fullName}</span>
                        <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {application.jobTitle} · {format(application.createdAt, 'd MMM yyyy')}
                        </span>
                      </span>
                      <StatusBadge tone={APPLICATION_TONE[application.status]}>{APPLICATION_STATUS_LABEL[application.status]}</StatusBadge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <JobEditorSheet open={editing.open} onOpenChange={(open) => setEditing((e) => ({ ...e, open }))} job={editing.job} teams={teams} />
      <ApplicationSheet application={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this role?"
        description={deleting ? `"${deleting.title}" will be removed. Nobody has applied yet.` : undefined}
        confirmLabel="Delete role"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteJob({ id: deleting._id })
            toast.success('Role deleted')
          } catch (error) {
            toast.error(errorText(error, 'Could not delete the role'))
          } finally {
            setDeleting(null)
          }
        }}
      />
    </AdminPage>
  )
}

export default function AdminCareersPage() {
  return (
    <Suspense fallback={null}>
      <CareersAdmin />
    </Suspense>
  )
}
