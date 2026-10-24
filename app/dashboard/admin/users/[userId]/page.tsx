'use client'

import { useState, type ComponentType, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Award,
  BadgeCheck,
  BookOpen,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Languages,
  Mail,
  MapPin,
  Phone,
  Shield,
  GraduationCap,
  Star,
  Stethoscope,
  Trash2,
  User,
  UserCog,
  Users,
  Video,
  Wallet,
  XCircle,
} from '@/components/icons'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  IconChip,
  PageHeader,
  Panel,
  StatTile,
  Stagger,
  StaggerItem,
  StatusBadge,
  cardClass,
  dangerButtonClass,
  primaryButtonClass,
  softButtonClass,
  tabsListClass,
} from '@/components/admin/ui'
import {
  RoleBadge,
  RoleChangeDialog,
  UserAvatar,
  displayName,
  roleMeta,
} from '@/components/dashboard/admin/UserManagement'
import { publicAppUrl } from '@/lib/public-app-url'
import { NETWORK_TERMS_VERSION } from '@/lib/rehabify-network-terms'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

/** Row shapes returned by api.admin.getAdminUserDetails. */
type PatientLink = { _id: string; patientId: string; status: string; name: string; email?: string; imageUrl?: string }
type RecentAppointment = { _id: string; startTime: number; serviceType: string; status: string; isOnline?: boolean; patientName: string }

/** Marketplace rates and earnings are stored in kobo. */
function formatKobo(kobo?: number | null) {
  if (kobo === undefined || kobo === null) return '—'
  return `₦${(kobo / 100).toLocaleString('en-NG')}`
}

function Field({
  icon: Icon,
  label,
  children,
  mono,
}: {
  icon?: ComponentType<{ className?: string }>
  label: string
  children: ReactNode
  mono?: boolean
}) {
  return (
    <div className="rounded-xl bg-rh-canvas p-3.5 dark:bg-white/[0.04]">
      <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
        {Icon && <Icon className="h-3.5 w-3.5 text-rh-ink dark:text-rh-lime" />}
        {label}
      </p>
      <div className={cn('mt-1 text-sm font-semibold text-rh-ink dark:text-white', mono && 'font-mono')}>{children}</div>
    </div>
  )
}

function CopyRow({
  icon: Icon,
  label,
  value,
  copied,
  onCopy,
  mono,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  copied: boolean
  onCopy: () => void
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2 text-neutral-600 dark:text-neutral-300">
        <Icon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        <span className={cn('truncate', mono && 'font-mono')} title={value}>
          {value}
        </span>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-rh-canvas hover:text-rh-ink dark:hover:bg-white/[0.06] dark:hover:text-white"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

function InfoRow({ icon: Icon, label, children }: { icon: ComponentType<{ className?: string }>; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
      <Icon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
      <span className="shrink-0 text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="min-w-0 truncate font-medium text-rh-ink dark:text-white">{children}</span>
    </div>
  )
}

function approvalTone(status?: string) {
  if (status === 'approved') return 'green' as const
  if (status === 'declined') return 'red' as const
  return 'amber' as const
}

function appointmentTone(status: string) {
  if (status === 'completed') return 'green' as const
  if (status === 'scheduled' || status === 'confirmed') return 'teal' as const
  if (status.startsWith('cancelled')) return 'red' as const
  return 'neutral' as const
}

export default function AdminUserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params?.userId as string

  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [roleOpen, setRoleOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const details = useQuery(api.admin.getAdminUserDetails, userId ? { userId: userId as Id<'users'> } : 'skip')
  const me = useQuery(api.users.getMyUser)
  const deleteUser = useMutation(api.users.adminDeleteUser)

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      toast.success(`${fieldName} copied`)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      playSound('error')
      toast.error('Could not copy to the clipboard')
    }
  }

  if (details === undefined) return <DetailSkeleton />

  if (details === null) {
    return (
      <AdminPage className="max-w-xl">
        <Panel>
          <EmptyState
            icon={<User />}
            title="Account not found"
            description="This user does not exist or has been removed from the platform."
            action={
              <Button asChild className={primaryButtonClass}>
                <Link href="/dashboard/admin/users">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to users
                </Link>
              </Button>
            }
          />
        </Panel>
      </AdminPage>
    )
  }

  const { user, physioProfile, patientProfile, clinic, stats, recentAppointments, activePatientsList, approvalStatus } = details

  const isPhysio = user.role === 'physiotherapist'
  const isMe = me?._id === user._id
  const meta = roleMeta(user.role)
  const listHref = user.role === 'physiotherapist' || user.role === 'patient' ? `/dashboard/admin/users?role=${user.role}` : '/dashboard/admin/users'

  const bookingPath = physioProfile?.bookingSlug ? `/book/${physioProfile.bookingSlug}` : `/book/${user._id}`
  const bookingUrl = `${publicAppUrl()}${bookingPath}`
  const defaultTab = isPhysio ? 'credentials' : patientProfile ? 'patient-info' : 'account'

  const confirmDelete = async () => {
    try {
      await deleteUser({ userId: user._id })
      playSound('reject')
      toast.success(`${displayName(user)} was deleted`)
      router.push(listHref)
    } catch (error) {
      toast.error('Could not delete this user', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
      throw error
    }
  }

  return (
    <AdminPage className="pb-12">
      <PageHeader
        eyebrow={
          <Link href={listHref} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3 w-3" />
            {meta.plural}
          </Link>
        }
        title={displayName(user)}
        description={[
          user.patientNumber,
          user.staffNumber,
          user.email,
          `Joined ${format(new Date(user._creationTime), 'd MMM yyyy')}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {isPhysio && (
              <Button asChild className={softButtonClass}>
                <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Booking page
                </a>
              </Button>
            )}
            <Button onClick={() => setRoleOpen(true)} className={primaryButtonClass}>
              <UserCog className="mr-2 h-4 w-4" />
              Change role
            </Button>
            {!isMe && (
              <Button onClick={() => setDeleteOpen(true)} className={dangerButtonClass} aria-label="Delete user">
                <Trash2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* ── Left: identity ── */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:col-span-4">
          <section className={cn(cardClass, 'overflow-hidden')}>
            <div className="relative h-16 bg-rh-ink dark:bg-rh-ink-3">
              {physioProfile?.verificationBadge && physioProfile.verificationBadge.status !== 'none' && (
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-rh-ink shadow-sm dark:bg-rh-ink-2 dark:text-rh-lime">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  {physioProfile.verificationBadge.status === 'pro_verified' ? 'Pro verified' : 'Verified'}
                </span>
              )}
            </div>
            <div className="px-5 pb-5">
              <div className="-mt-9 mb-3 flex items-end justify-between">
                <div className="relative">
                  <UserAvatar user={user} className="h-[72px] w-[72px] border-4 border-white text-lg dark:border-rh-ink-2" />
                  <span
                    className={cn(
                      'absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-rh-ink-2',
                      user.onboarded ? 'bg-emerald-500' : 'bg-amber-500'
                    )}
                    title={user.onboarded ? 'Onboarded' : 'Onboarding not finished'}
                  />
                </div>
                {isPhysio && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-rh-peach px-2 py-1 text-xs font-semibold text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {stats.reviewStats.averageRating > 0 ? stats.reviewStats.averageRating.toFixed(1) : 'New'}
                    <span className="font-normal opacity-70">({stats.reviewStats.count})</span>
                  </span>
                )}
              </div>

              <h2 className="text-lg font-semibold tracking-tight text-rh-ink dark:text-white">{displayName(user)}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <RoleBadge role={user.role} />
                <StatusBadge tone={user.onboarded ? 'teal' : 'neutral'}>{user.onboarded ? 'Onboarded' : 'Onboarding'}</StatusBadge>
                {approvalStatus && (
                  <StatusBadge tone={approvalTone(approvalStatus.status)} className="gap-1 capitalize">
                    {approvalStatus.status === 'approved' ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : approvalStatus.status === 'declined' ? (
                      <XCircle className="h-3 w-3" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                    {approvalStatus.status.replace('_', ' ')}
                  </StatusBadge>
                )}
                {physioProfile?.isAvailableOnMarketplace !== undefined && (
                  <StatusBadge tone={physioProfile.isAvailableOnMarketplace ? 'green' : 'neutral'}>
                    {physioProfile.isAvailableOnMarketplace ? 'Marketplace live' : 'Marketplace hidden'}
                  </StatusBadge>
                )}
              </div>

              <div className="my-4 h-px bg-black/[0.05] dark:bg-white/[0.06]" />

              <div className="space-y-2.5 text-xs">
                {user.email && (
                  <CopyRow icon={Mail} label="email" value={user.email} copied={copiedField === 'Email'} onCopy={() => copyToClipboard(user.email!, 'Email')} />
                )}
                {user.phoneNumber && (
                  <CopyRow
                    icon={Phone}
                    label="phone"
                    value={user.phoneNumber}
                    copied={copiedField === 'Phone'}
                    onCopy={() => copyToClipboard(user.phoneNumber!, 'Phone')}
                  />
                )}
                {physioProfile?.licenseNumber && (
                  <CopyRow
                    icon={Award}
                    label="licence number"
                    value={physioProfile.licenseNumber}
                    mono
                    copied={copiedField === 'Licence number'}
                    onCopy={() => copyToClipboard(physioProfile.licenseNumber!, 'Licence number')}
                  />
                )}
                {clinic && (
                  <InfoRow icon={Building2} label="Clinic">
                    {clinic.name}
                  </InfoRow>
                )}
                {physioProfile?.location && (
                  <InfoRow icon={MapPin} label="Location">
                    {physioProfile.location}
                  </InfoRow>
                )}
                <InfoRow icon={Calendar} label="Joined">
                  {format(new Date(user._creationTime), 'd MMM yyyy')}
                </InfoRow>
                {user.lastLoginAt && (
                  <InfoRow icon={Clock} label="Last login">
                    {format(new Date(user.lastLoginAt), 'd MMM yyyy, HH:mm')}
                  </InfoRow>
                )}
              </div>

              {isPhysio && (
                <div className="mt-4 space-y-2 rounded-xl bg-rh-canvas p-3 dark:bg-white/[0.04]">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Session modes</p>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge tone={physioProfile?.offersOnlineSessions ? 'teal' : 'neutral'} className="gap-1">
                      <Video className="h-3 w-3" />
                      Video
                    </StatusBadge>
                    <StatusBadge tone={physioProfile?.offersInPersonSessions ? 'teal' : 'neutral'} className="gap-1">
                      <Building2 className="h-3 w-3" />
                      In person
                    </StatusBadge>
                  </div>
                </div>
              )}

              {user.email && (
                <Button asChild className={cn(softButtonClass, 'mt-4 w-full')} size="sm">
                  <a href={`mailto:${user.email}`}>
                    <Mail className="mr-2 h-3.5 w-3.5" />
                    Email {user.firstName || 'user'}
                  </a>
                </Button>
              )}
            </div>
          </section>

          {approvalStatus?.status === 'declined' && approvalStatus.declineReason && (
            <section className="rounded-2xl bg-rh-blush p-4 text-xs text-[#be123c] dark:bg-rose-400/10 dark:text-rose-300">
              <p className="mb-1 flex items-center gap-1.5 font-semibold uppercase tracking-wider">
                <XCircle className="h-4 w-4" />
                Declined: reason given
              </p>
              <p className="whitespace-pre-wrap leading-relaxed">{approvalStatus.declineReason}</p>
              {approvalStatus.reviewedAt && (
                <p className="mt-2 opacity-80">Recorded {format(new Date(approvalStatus.reviewedAt), 'd MMM yyyy, HH:mm')}</p>
              )}
            </section>
          )}

          <Panel title="System references" bodyClassName="space-y-2.5 px-5 pb-4 pt-2 text-xs">
            {user.patientNumber && (
              <CopyRow
                icon={User}
                label="patient ID"
                value={user.patientNumber}
                mono
                copied={copiedField === 'Patient ID'}
                onCopy={() => copyToClipboard(user.patientNumber!, 'Patient ID')}
              />
            )}
            {user.staffNumber && (
              <CopyRow
                icon={Stethoscope}
                label="clinician ID"
                value={user.staffNumber}
                mono
                copied={copiedField === 'Clinician ID'}
                onCopy={() => copyToClipboard(user.staffNumber!, 'Clinician ID')}
              />
            )}
            <CopyRow
              icon={Shield}
              label="user ID"
              value={user._id}
              mono
              copied={copiedField === 'User ID'}
              onCopy={() => copyToClipboard(user._id, 'User ID')}
            />
            {physioProfile && (
              <CopyRow
                icon={Stethoscope}
                label="physio profile ID"
                value={physioProfile._id}
                mono
                copied={copiedField === 'Profile ID'}
                onCopy={() => copyToClipboard(physioProfile._id, 'Profile ID')}
              />
            )}
            <CopyRow
              icon={User}
              label="Clerk ID"
              value={user.clerkId}
              mono
              copied={copiedField === 'Clerk ID'}
              onCopy={() => copyToClipboard(user.clerkId, 'Clerk ID')}
            />
          </Panel>
        </div>

        {/* ── Right: details ── */}
        <div className="space-y-6 lg:col-span-8">
          {isPhysio && (
            <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StaggerItem>
                <StatTile label="Active patients" value={stats.patientCount} icon={Users} hint="Under active care" />
              </StaggerItem>
              <StaggerItem>
                <StatTile label="Total sessions" value={stats.appointmentCount} icon={Calendar} tone="mint" hint="Booked and completed" />
              </StaggerItem>
              <StaggerItem>
                <StatTile label="Upcoming" value={stats.upcomingAppointments} icon={Clock} tone="peach" hint="Scheduled ahead" />
              </StaggerItem>
              <StaggerItem>
                <StatTile
                  label="Earnings"
                  value={formatKobo(physioProfile?.totalMarketplaceEarnings || 0)}
                  icon={Wallet}
                  tone="rose"
                  hint="Marketplace total"
                />
              </StaggerItem>
            </Stagger>
          )}

          <Tabs defaultValue={defaultTab} className="space-y-4">
            <TabsList className={tabsListClass}>
              {isPhysio && (
                <>
                  <TabsTrigger value="credentials" className="gap-1.5 text-xs font-semibold">
                    <Award className="h-3.5 w-3.5" />
                    Credentials
                  </TabsTrigger>
                  <TabsTrigger value="marketplace" className="gap-1.5 text-xs font-semibold">
                    <Globe className="h-3.5 w-3.5" />
                    Marketplace
                  </TabsTrigger>
                  <TabsTrigger value="activity" className="gap-1.5 text-xs font-semibold">
                    <Activity className="h-3.5 w-3.5" />
                    Patients & sessions
                  </TabsTrigger>
                </>
              )}
              {patientProfile && (
                <TabsTrigger value="patient-info" className="gap-1.5 text-xs font-semibold">
                  <User className="h-3.5 w-3.5" />
                  Patient record
                </TabsTrigger>
              )}
              <TabsTrigger value="account" className="gap-1.5 text-xs font-semibold">
                <Shield className="h-3.5 w-3.5" />
                Account
              </TabsTrigger>
            </TabsList>

            {isPhysio && (
              <>
                {/* ── Credentials ── */}
                <TabsContent value="credentials" className="mt-0 space-y-6">
                  <Panel title="Licensing & qualifications" description="Registration, board and licence details" bodyClassName="p-5 pt-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field icon={Award} label="Licence / registration number" mono>
                        {physioProfile?.licenseNumber || 'Not recorded'}
                      </Field>
                      <Field icon={BookOpen} label="Certification board">
                        {physioProfile?.certificationBoard || 'Medical Rehabilitation Therapists Board (MRTB)'}
                      </Field>
                      <Field icon={Calendar} label="Certification year">
                        {physioProfile?.certificationYear || '—'}
                      </Field>
                      <Field icon={Clock} label="Practice experience">
                        {physioProfile?.yearsOfExperience !== undefined ? `${physioProfile.yearsOfExperience} years` : '—'}
                      </Field>
                      <Field icon={Calendar} label="Licence expiry">
                        {physioProfile?.licenseExpiryDate || 'Not set'}
                      </Field>
                      <Field icon={GraduationCap} label="CPD points">
                        {physioProfile?.cpdPoints !== undefined ? `${physioProfile.cpdPoints} points` : '—'}
                      </Field>
                    </div>
                  </Panel>

                  <Panel title="Specialisations & languages" description="Focus areas shown to prospective patients" bodyClassName="space-y-4 p-5 pt-3">
                    {physioProfile?.specializations && physioProfile.specializations.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {physioProfile.specializations.map((spec: string, idx: number) => (
                          <StatusBadge key={`${spec}-${idx}`} tone="teal" className="gap-1 px-2.5 py-1 text-xs">
                            <Stethoscope className="h-3 w-3" />
                            {spec}
                          </StatusBadge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs italic text-neutral-500 dark:text-neutral-400">No specialisations tagged yet.</p>
                    )}
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                        <Languages className="h-3.5 w-3.5" />
                        Consultation languages
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(physioProfile?.languagesSpoken && physioProfile.languagesSpoken.length > 0 ? physioProfile.languagesSpoken : ['English']).map(
                          (lang: string) => (
                            <StatusBadge key={lang}>{lang}</StatusBadge>
                          )
                        )}
                      </div>
                    </div>
                  </Panel>

                  {physioProfile?.bio && (
                    <Panel title="Biography" bodyClassName="p-5 pt-3">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{physioProfile.bio}</p>
                    </Panel>
                  )}
                </TabsContent>

                {/* ── Marketplace ── */}
                <TabsContent value="marketplace" className="mt-0 space-y-6">
                  <Panel
                    title="Rehabify network"
                    description="Standard Rehabify prices apply; the physio earns the payout schedule in Admin › Pricing & payouts"
                    bodyClassName="space-y-5 p-5 pt-3"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Field label="Network terms">
                        {physioProfile?.clinicId
                          ? 'Clinic member: works under the clinic’s terms'
                          : physioProfile?.networkTerms?.version === NETWORK_TERMS_VERSION
                            ? `Accepted ${format(physioProfile.networkTerms.acceptedAt, 'd MMM yyyy')}`
                            : 'Not accepted yet'}
                      </Field>
                      <Field label="Sees patients">
                        {[
                          physioProfile?.offersOnlineSessions !== false ? 'Video' : null,
                          physioProfile?.offersInPersonSessions
                            ? `Home visits (${physioProfile?.coveredZoneIds?.length ?? 0} zone${physioProfile?.coveredZoneIds?.length === 1 ? '' : 's'})`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Not set'}
                      </Field>
                      <Field label="Rehabify Access">
                        {physioProfile?.networkTerms?.accessOptIn ? 'Open to reduced-fee cases' : 'Not opted in'}
                      </Field>
                      <Field icon={Video} label="Video provider">
                        <span className="capitalize">{physioProfile?.videoPlatformPreference || 'GetStream Video'}</span>
                      </Field>
                    </div>
                  </Panel>

                  <section className={cn(cardClass, 'p-5')}>
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 items-start gap-3">
                        <IconChip icon={Globe} />
                        <div className="min-w-0">
                          <h3 className="text-[15px] font-semibold text-rh-ink dark:text-white">Public booking link</h3>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">Patients can book this physiotherapist directly from this link.</p>
                          <p className="mt-2 inline-block max-w-full truncate rounded-lg bg-rh-canvas px-3 py-1.5 font-mono text-xs text-rh-ink dark:bg-white/[0.04] dark:text-rh-lime">
                            {bookingUrl}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button onClick={() => copyToClipboard(bookingUrl, 'Booking link')} className={primaryButtonClass} size="sm">
                          {copiedField === 'Booking link' ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                          Copy
                        </Button>
                        <Button asChild className={softButtonClass} size="sm">
                          <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                            Open
                          </a>
                        </Button>
                      </div>
                    </div>
                  </section>
                </TabsContent>

                {/* ── Patients & sessions ── */}
                <TabsContent value="activity" className="mt-0 space-y-6">
                  <Panel
                    title="Patients"
                    description="Patient relationships connected to this physiotherapist"
                    actions={<StatusBadge tone="teal">{stats.patientCount} active</StatusBadge>}
                    bodyClassName="p-5 pt-3"
                  >
                    {activePatientsList && activePatientsList.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {activePatientsList.map((patient: PatientLink) => (
                          <Link
                            key={patient._id}
                            href={`/dashboard/admin/users/${patient.patientId}`}
                            className="flex items-center justify-between gap-3 rounded-xl bg-rh-canvas p-3 transition-colors hover:bg-rh-honeydew dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <UserAvatar user={{ firstName: patient.name, imageUrl: patient.imageUrl }} />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{patient.name}</p>
                                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{patient.email || 'No email'}</p>
                              </div>
                            </div>
                            <StatusBadge className="capitalize">{patient.status}</StatusBadge>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon={<Users />} title="No patients yet" description="Patient relationships will appear here." />
                    )}
                  </Panel>

                  <Panel
                    title="Recent sessions"
                    description="Latest booked and completed appointments"
                    actions={<StatusBadge>{stats.appointmentCount} total</StatusBadge>}
                    bodyClassName="p-5 pt-3"
                  >
                    {recentAppointments && recentAppointments.length > 0 ? (
                      <div className="space-y-2">
                        {recentAppointments.map((appt: RecentAppointment) => (
                          <div
                            key={appt._id}
                            className="flex flex-col justify-between gap-2 rounded-xl bg-rh-canvas p-3 dark:bg-white/[0.04] sm:flex-row sm:items-center"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <IconChip icon={appt.isOnline ? Video : Building2} />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">
                                  {appt.serviceType || 'Physiotherapy session'}
                                </p>
                                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                                  {appt.patientName} · {format(new Date(appt.startTime), 'd MMM yyyy, HH:mm')}
                                </p>
                              </div>
                            </div>
                            <StatusBadge tone={appointmentTone(appt.status)} className="self-start capitalize sm:self-center">
                              {appt.status.replace(/_/g, ' ')}
                            </StatusBadge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon={<Calendar />} title="No sessions yet" description="Appointments with this physiotherapist will appear here." />
                    )}
                  </Panel>
                </TabsContent>
              </>
            )}

            {/* ── Patient record ── */}
            {patientProfile && (
              <TabsContent value="patient-info" className="mt-0 space-y-6">
                <Panel title="Patient profile" bodyClassName="space-y-4 p-5 pt-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Date of birth">{patientProfile.dateOfBirth || '—'}</Field>
                    <Field label="Gender">
                      <span className="capitalize">{patientProfile.gender || '—'}</span>
                    </Field>
                    <Field icon={MapPin} label="City & country">
                      {[patientProfile.city, patientProfile.country].filter(Boolean).join(', ') || '—'}
                    </Field>
                    <Field label="Address">{patientProfile.address || '—'}</Field>
                  </div>
                  {patientProfile.medicalHistorySummary && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        Medical history summary
                      </p>
                      <p className="whitespace-pre-wrap rounded-xl bg-rh-canvas p-3.5 text-sm leading-relaxed text-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200">
                        {patientProfile.medicalHistorySummary}
                      </p>
                    </div>
                  )}
                </Panel>
              </TabsContent>
            )}

            {/* ── Account ── */}
            <TabsContent value="account" className="mt-0 space-y-6">
              <Panel title="Account" description="Role, onboarding and approval state" bodyClassName="p-5 pt-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field icon={meta.icon} label="Role">
                    {meta.label}
                  </Field>
                  <Field icon={CheckCircle2} label="Onboarding">
                    {user.onboarded ? 'Completed' : 'Not finished'}
                  </Field>
                  <Field icon={FileText} label="Approval">
                    <span className="capitalize">{approvalStatus ? approvalStatus.status.replace('_', ' ') : 'Not required'}</span>
                  </Field>
                  <Field icon={Clock} label="Reviewed">
                    {approvalStatus?.reviewedAt ? format(new Date(approvalStatus.reviewedAt), 'd MMM yyyy, HH:mm') : '—'}
                  </Field>
                  <Field icon={Building2} label="Clinic">
                    {clinic?.name || '—'}
                  </Field>
                  <Field icon={Calendar} label="Last login">
                    {user.lastLoginAt ? format(new Date(user.lastLoginAt), 'd MMM yyyy, HH:mm') : '—'}
                  </Field>
                </div>
                {approvalStatus?.status === 'pending_review' && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rh-peach p-3 text-xs text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300">
                    <span>This account is waiting for review.</span>
                    <Link href="/dashboard/admin/approvals" className="font-semibold underline-offset-2 hover:underline">
                      Open approvals queue
                    </Link>
                  </div>
                )}
              </Panel>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <RoleChangeDialog user={user} open={roleOpen} onOpenChange={setRoleOpen} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${displayName(user)}?`}
        description="This permanently removes the account, its patient/physio/clinic profile and any approval record. It cannot be undone."
        confirmLabel="Delete user"
        destructive
        onConfirm={confirmDelete}
      />
    </AdminPage>
  )
}

function DetailSkeleton() {
  return (
    <AdminPage>
      <div className="space-y-2">
        <Skeleton className="h-3 w-32 dark:bg-white/[0.06]" />
        <Skeleton className="h-8 w-64 dark:bg-white/[0.06]" />
        <Skeleton className="h-4 w-80 dark:bg-white/[0.06]" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-4">
          <Skeleton className="h-[420px] w-full rounded-2xl dark:bg-white/[0.06]" />
        </div>
        <div className="space-y-6 lg:col-span-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl dark:bg-white/[0.06]" />
            ))}
          </div>
          <Skeleton className="h-10 w-full rounded-xl dark:bg-white/[0.06]" />
          <Skeleton className="h-64 w-full rounded-2xl dark:bg-white/[0.06]" />
        </div>
      </div>
    </AdminPage>
  )
}
