'use client'

import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Shield,
  Stethoscope,
  Building2,
  User,
  Star,
  Users,
  Clock,
  Globe,
  Award,
  BookOpen,
  DollarSign,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Briefcase,
  Languages,
  BadgeCheck,
  Eye,
  ExternalLink,
  Copy,
  Check,
  Video,
  Activity,
  FileText,
  UserCog,
  Crown,
  Sparkles,
  ChevronRight,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

type UserRole = 'patient' | 'physiotherapist' | 'clinic_owner' | 'admin' | 'family_member'

export default function AdminUserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params?.userId as string

  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [selectedRole, setSelectedRole] = useState<UserRole>('physiotherapist')
  const [isUpdatingRole, setIsUpdatingRole] = useState(false)

  const details = useQuery(
    api.admin.getAdminUserDetails,
    userId ? { userId: userId as Id<'users'> } : 'skip'
  )

  const setUserRole = useMutation(api.users.setUserRole)

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(fieldName)
    toast.success(`${fieldName} copied to clipboard`)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleRoleChange = async () => {
    if (!details?.user) return
    setIsUpdatingRole(true)
    try {
      await setUserRole({ userId: details.user._id, role: selectedRole })
      toast.success(`Role updated to ${selectedRole.replace('_', ' ')}`)
      setShowRoleDialog(false)
    } catch {
      toast.error('Failed to update user role')
    } finally {
      setIsUpdatingRole(false)
    }
  }

  if (details === undefined) {
    return <HealthcareDetailSkeleton />
  }

  if (details === null) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center max-w-md p-8 bg-card border rounded-2xl shadow-sm">
          <div className="w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
            <User className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Practitioner Not Found</h2>
          <p className="text-muted-foreground text-sm mb-6">
            The user or physiotherapist profile does not exist or has been removed from the platform.
          </p>
          <Button onClick={() => router.push('/dashboard/admin/users?role=physiotherapist')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Physiotherapists
          </Button>
        </div>
      </div>
    )
  }

  const {
    user,
    physioProfile,
    patientProfile,
    clinic,
    stats,
    recentAppointments,
    activePatientsList,
    approvalStatus,
  } = details

  const isPhysio = user.role === 'physiotherapist'
  const isDoctor = user.role === 'doctor'
  const isClinician = isPhysio || isDoctor

  const bookingUrl = physioProfile?.bookingSlug
    ? `/book/${physioProfile.bookingSlug}`
    : `/book/${user._id}`

  const formatNaira = (kobo?: number) => {
    if (kobo === undefined || kobo === null) return '—'
    return `₦${(kobo / 100).toLocaleString('en-NG')}`
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ── Top Header & Breadcrumbs ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button
              onClick={() => router.push('/dashboard/admin/users?role=physiotherapist')}
              className="hover:text-foreground transition-colors"
            >
              User Management
            </button>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {isPhysio ? 'Physiotherapist Profile' : 'User Details'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => router.push('/dashboard/admin/users?role=physiotherapist')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {isPhysio ? 'PT ' : ''}{user.firstName} {user.lastName}
            </h1>
          </div>
        </div>

        {/* Top Action Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {isPhysio && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-9 border-emerald-200 hover:bg-emerald-50 text-emerald-700 dark:text-emerald-300 dark:border-emerald-800"
              onClick={() => window.open(bookingUrl, '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Public Booking Page
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-9"
            onClick={() => {
              setSelectedRole(user.role || 'physiotherapist')
              setShowRoleDialog(true)
            }}
          >
            <UserCog className="h-3.5 w-3.5" />
            Edit Role
          </Button>
        </div>
      </div>

      {/* ── Main Layout: Profile By The Side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ════ LEFT COLUMN: PRACTITIONER PROFILE CARD (SIDEBAR) ════ */}
        <div className="lg:col-span-4 xl:col-span-4 space-y-6 lg:sticky lg:top-6">
          {/* Main Identity Card */}
          <Card className="border-emerald-100 dark:border-emerald-900/40 shadow-sm overflow-hidden bg-gradient-to-b from-card via-card to-emerald-50/20 dark:to-emerald-950/10">
            <div className="h-20 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 relative">
              {/* Verification Tag on Header */}
              {physioProfile?.verificationBadge && physioProfile.verificationBadge.status !== 'none' && (
                <div className="absolute top-3 right-3 bg-white/95 dark:bg-zinc-900/90 backdrop-blur-sm px-2 py-0.5 rounded-full text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 shadow-sm">
                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                  {physioProfile.verificationBadge.status === 'pro_verified' ? 'Pro Verified' : 'Verified'}
                </div>
              )}
            </div>

            <CardContent className="pt-0 relative px-6 pb-6">
              {/* Avatar with Status Ring */}
              <div className="-mt-10 mb-4 flex justify-between items-end">
                <div className="relative">
                  <Avatar className="h-20 w-20 border-4 border-background shadow-md">
                    <AvatarImage src={user.imageUrl} className="object-cover" />
                    <AvatarFallback className="text-xl font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                      {user.firstName?.charAt(0) || user.email?.charAt(0) || 'P'}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-background ${
                      user.onboarded ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                    title={user.onboarded ? 'Profile Active' : 'Onboarding Pending'}
                  />
                </div>

                {/* Rating Badge */}
                {isPhysio && (
                  <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 px-2.5 py-1 rounded-lg text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span>
                      {stats.reviewStats.averageRating > 0
                        ? stats.reviewStats.averageRating.toFixed(1)
                        : 'New'}
                    </span>
                    <span className="text-muted-foreground font-normal">
                      ({stats.reviewStats.count})
                    </span>
                  </div>
                )}
              </div>

              {/* Practitioner Titles */}
              <div className="space-y-1 mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-foreground">
                    {user.firstName} {user.lastName}
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                  <Stethoscope className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {isPhysio
                      ? 'Licensed Physical Therapist'
                      : user.role
                        ? user.role.replace('_', ' ').toUpperCase()
                        : 'Patient'}
                  </span>
                </div>
              </div>

              {/* Badges Row */}
              <div className="flex flex-wrap gap-1.5 mb-5">
                <Badge
                  variant={user.onboarded ? 'default' : 'secondary'}
                  className="text-[11px] h-5 bg-emerald-600 hover:bg-emerald-700"
                >
                  {user.onboarded ? 'Active Account' : 'Pending Onboarding'}
                </Badge>

                {approvalStatus && (
                  <Badge
                    variant="outline"
                    className={`text-[11px] h-5 gap-1 ${
                      approvalStatus.status === 'approved'
                        ? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400'
                        : approvalStatus.status === 'declined'
                          ? 'border-red-300 text-red-700 bg-red-50 dark:bg-red-950/40 dark:border-red-800 dark:text-red-400'
                          : 'border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-400'
                    }`}
                  >
                    {approvalStatus.status === 'approved' ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : approvalStatus.status === 'declined' ? (
                      <XCircle className="h-3 w-3" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                    {approvalStatus.status.replace('_', ' ')}
                  </Badge>
                )}

                {physioProfile?.isAvailableOnMarketplace !== undefined && (
                  <Badge
                    variant="secondary"
                    className={`text-[11px] h-5 ${
                      physioProfile.isAvailableOnMarketplace
                        ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    {physioProfile.isAvailableOnMarketplace ? 'Marketplace Live' : 'Marketplace Hidden'}
                  </Badge>
                )}
              </div>

              <Separator className="my-4" />

              {/* Quick Contact & Practice Details */}
              <div className="space-y-3 text-xs">
                {/* Email */}
                {user.email && (
                  <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate max-w-[190px]">{user.email}</span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(user.email!, 'Email')}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      title="Copy Email"
                    >
                      {copiedField === 'Email' ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                )}

                {/* Phone */}
                {user.phoneNumber && (
                  <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{user.phoneNumber}</span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(user.phoneNumber!, 'Phone')}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      title="Copy Phone"
                    >
                      {copiedField === 'Phone' ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                )}

                {/* Clinic */}
                {clinic && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Affiliated Clinic:</span>
                    <span className="font-semibold text-foreground truncate">{clinic.name}</span>
                  </div>
                )}

                {/* Location */}
                {physioProfile?.location && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Practice Location:</span>
                    <span className="font-semibold text-foreground">{physioProfile.location}</span>
                  </div>
                )}

                {/* License Number */}
                {physioProfile?.licenseNumber && (
                  <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Award className="h-3.5 w-3.5 text-emerald-600" />
                      <span>License:</span>
                      <span className="font-mono font-medium text-foreground">
                        {physioProfile.licenseNumber}
                      </span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(physioProfile.licenseNumber!, 'License Number')}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      title="Copy License Number"
                    >
                      {copiedField === 'License Number' ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                )}

                {/* Joined Date */}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Joined Platform:</span>
                  <span className="font-medium text-foreground">
                    {format(new Date(user._creationTime), 'MMM dd, yyyy')}
                  </span>
                </div>

                {/* Last Login */}
                {user.lastLoginAt && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Last Login:</span>
                    <span className="font-medium text-foreground">
                      {format(new Date(user.lastLoginAt), 'MMM dd, yyyy HH:mm')}
                    </span>
                  </div>
                )}
              </div>

              {/* Consultation Delivery Modes */}
              {isPhysio && (
                <div className="mt-5 p-3 rounded-lg bg-muted/40 border space-y-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Session Modes Supported
                  </span>
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md font-medium ${
                        physioProfile?.offersOnlineSessions
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'
                      }`}
                    >
                      <Video className="h-3 w-3" />
                      Telehealth Video
                    </div>
                    <div
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md font-medium ${
                        physioProfile?.offersInPersonSessions
                          ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                          : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'
                      }`}
                    >
                      <Building2 className="h-3 w-3" />
                      In-Person
                    </div>
                  </div>
                </div>
              )}

              {/* Side CTA Actions */}
              <div className="mt-5 space-y-2">
                {isPhysio && (
                  <Button
                    variant="default"
                    size="sm"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm"
                    onClick={() => window.open(bookingUrl, '_blank')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Live Marketplace Page
                  </Button>
                )}
                {user.email && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 text-xs"
                    onClick={() => (window.location.href = `mailto:${user.email}`)}
                  >
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    Send Direct Email
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Declined Notice if applicable */}
          {approvalStatus?.status === 'declined' && approvalStatus.declineReason && (
            <Card className="border-red-200 bg-red-50/80 dark:bg-red-950/20 dark:border-red-900/60 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400 flex items-center gap-1.5">
                  <XCircle className="h-4 w-4" />
                  Application Declined Note
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-red-800 dark:text-red-300 space-y-1.5">
                <p className="leading-relaxed">{approvalStatus.declineReason}</p>
                {approvalStatus.reviewedAt && (
                  <p className="text-[11px] text-red-600 dark:text-red-400/80 pt-1">
                    Recorded on {format(new Date(approvalStatus.reviewedAt), 'MMM dd, yyyy HH:mm')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Technical System IDs Card */}
          <Card className="border shadow-sm">
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                System & Database References
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2 text-[11px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-sans">User ID:</span>
                <button
                  onClick={() => copyToClipboard(user._id, 'User ID')}
                  className="hover:underline flex items-center gap-1 text-foreground"
                >
                  <span className="truncate max-w-[140px]">{user._id}</span>
                  <Copy className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
              {physioProfile && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-sans">Physio Profile:</span>
                  <button
                    onClick={() => copyToClipboard(physioProfile._id, 'Profile ID')}
                    className="hover:underline flex items-center gap-1 text-foreground"
                  >
                    <span className="truncate max-w-[140px]">{physioProfile._id}</span>
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-sans">Clerk Auth ID:</span>
                <span className="truncate max-w-[140px] text-muted-foreground">{user.clerkId}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ════ RIGHT COLUMN: CLINICAL DETAILS & METRICS ════ */}
        <div className="lg:col-span-8 xl:col-span-8 space-y-6">
          {/* Healthcare KPI Metrics Banner (Physiotherapist stats) */}
          {isPhysio && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              {/* Active Patients */}
              <Card className="border-emerald-100 dark:border-emerald-950 shadow-sm bg-gradient-to-br from-emerald-50/40 to-transparent dark:from-emerald-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Active Patients</span>
                    <div className="h-7 w-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <Users className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{stats.patientCount}</div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                    Under active care
                  </p>
                </CardContent>
              </Card>

              {/* Total Appointments */}
              <Card className="border-blue-100 dark:border-blue-950 shadow-sm bg-gradient-to-br from-blue-50/40 to-transparent dark:from-blue-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Total Sessions</span>
                    <div className="h-7 w-7 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <Calendar className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{stats.appointmentCount}</div>
                  <p className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5">
                    Completed & booked
                  </p>
                </CardContent>
              </Card>

              {/* Upcoming Appointments */}
              <Card className="border-purple-100 dark:border-purple-950 shadow-sm bg-gradient-to-br from-purple-50/40 to-transparent dark:from-purple-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Upcoming</span>
                    <div className="h-7 w-7 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                      <Clock className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{stats.upcomingAppointments}</div>
                  <p className="text-[11px] text-purple-700 dark:text-purple-400 mt-0.5">
                    Scheduled ahead
                  </p>
                </CardContent>
              </Card>

              {/* Marketplace Earnings */}
              <Card className="border-amber-100 dark:border-amber-950 shadow-sm bg-gradient-to-br from-amber-50/40 to-transparent dark:from-amber-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Total Earnings</span>
                    <div className="h-7 w-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      <DollarSign className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="text-xl font-bold text-foreground truncate">
                    {formatNaira(physioProfile?.totalMarketplaceEarnings || 0)}
                  </div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                    Platform revenue
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Healthcare Clinical Information Tabs */}
          <Tabs defaultValue="credentials" className="space-y-4">
            <TabsList className="bg-muted/60 p-1 rounded-xl w-full justify-start overflow-x-auto flex flex-nowrap h-11 border">
              <TabsTrigger value="credentials" className="gap-2 text-xs py-2 px-3.5 rounded-lg data-[state=active]:bg-background data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm font-semibold">
                <Award className="h-3.5 w-3.5" />
                Clinical Credentials
              </TabsTrigger>
              <TabsTrigger value="marketplace" className="gap-2 text-xs py-2 px-3.5 rounded-lg data-[state=active]:bg-background data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm font-semibold">
                <Globe className="h-3.5 w-3.5" />
                Marketplace & Rates
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-2 text-xs py-2 px-3.5 rounded-lg data-[state=active]:bg-background data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm font-semibold">
                <Activity className="h-3.5 w-3.5" />
                Patients & Sessions
              </TabsTrigger>
              {patientProfile && (
                <TabsTrigger value="patient-info" className="gap-2 text-xs py-2 px-3.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm font-semibold">
                  <User className="h-3.5 w-3.5" />
                  Patient Record
                </TabsTrigger>
              )}
            </TabsList>

            {/* ── TAB 1: CLINICAL CREDENTIALS ── */}
            <TabsContent value="credentials" className="space-y-6 mt-0">
              {/* Qualifications & Medical Board */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                    <Award className="h-4 w-4 text-emerald-600" />
                    Medical Licensing & Board Qualifications
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Official registry, board examinations, and license credentials
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-xl bg-muted/40 border space-y-1">
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                        <Award className="h-3.5 w-3.5 text-emerald-600" />
                        License / Registration Number
                      </span>
                      <div className="text-sm font-mono font-bold text-foreground">
                        {physioProfile?.licenseNumber || 'Not recorded'}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-muted/40 border space-y-1">
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                        <BookOpen className="h-3.5 w-3.5 text-blue-600" />
                        Certification Board
                      </span>
                      <div className="text-sm font-semibold text-foreground">
                        {physioProfile?.certificationBoard || 'Medical Rehabilitation Therapists Board (MRTB)'}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-muted/40 border space-y-1">
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-purple-600" />
                        Certification Year
                      </span>
                      <div className="text-sm font-semibold text-foreground">
                        {physioProfile?.certificationYear || '—'}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-muted/40 border space-y-1">
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                        Clinical Practice Experience
                      </span>
                      <div className="text-sm font-semibold text-foreground">
                        {physioProfile?.yearsOfExperience !== undefined
                          ? `${physioProfile.yearsOfExperience} years active practice`
                          : '—'}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-muted/40 border space-y-1">
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-rose-600" />
                        License Expiration Date
                      </span>
                      <div className="text-sm font-semibold text-foreground">
                        {physioProfile?.licenseExpiryDate || 'Active / Not set'}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-muted/40 border space-y-1">
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                        Continuing Professional Dev (CPD)
                      </span>
                      <div className="text-sm font-semibold text-foreground">
                        {physioProfile?.cpdPoints !== undefined ? `${physioProfile.cpdPoints} Points` : '—'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Clinical Specializations */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                    <Stethoscope className="h-4 w-4 text-emerald-600" />
                    Clinical Specializations & Areas of Care
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Therapeutic focus areas advertised to prospective patients
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {physioProfile?.specializations && physioProfile.specializations.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {physioProfile.specializations.map((spec: string, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 text-xs font-semibold"
                        >
                          <Stethoscope className="h-3.5 w-3.5 text-emerald-600" />
                          <span>{spec}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No specific clinical specializations tagged yet.
                    </p>
                  )}

                  {/* Languages */}
                  <div className="pt-2">
                    <span className="text-xs font-semibold text-muted-foreground block mb-2 flex items-center gap-1.5">
                      <Languages className="h-3.5 w-3.5" />
                      Languages for Consultation
                    </span>
                    {physioProfile?.languagesSpoken && physioProfile.languagesSpoken.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {physioProfile.languagesSpoken.map((lang: string) => (
                          <Badge key={lang} variant="outline" className="text-xs">
                            {lang}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs">English</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Clinical Bio & Philosophy */}
              {physioProfile?.bio && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                      <FileText className="h-4 w-4 text-emerald-600" />
                      Professional Biography & Clinical Philosophy
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {physioProfile.bio}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── TAB 2: MARKETPLACE & RATES ── */}
            <TabsContent value="marketplace" className="space-y-6 mt-0">
              {/* Rates Breakdown */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                    Consultation Fees & Platform Pricing
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Published marketplace session rates and packages
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Hourly Base Rate */}
                    <div className="p-4 rounded-xl border bg-gradient-to-br from-card to-emerald-50/20 dark:to-emerald-950/10 space-y-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        Standard Session (Hourly)
                      </span>
                      <div className="text-2xl font-bold text-foreground">
                        {formatNaira(physioProfile?.hourlyRate)}
                      </div>
                      <span className="text-[11px] text-muted-foreground">Standard 60-min fee</span>
                    </div>

                    {/* Initial Consult Rate */}
                    <div className="p-4 rounded-xl border bg-gradient-to-br from-card to-blue-50/20 dark:to-blue-950/10 space-y-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        Initial Evaluation Rate
                      </span>
                      <div className="text-2xl font-bold text-foreground">
                        {formatNaira(physioProfile?.initialConsultRate || physioProfile?.hourlyRate)}
                      </div>
                      <span className="text-[11px] text-muted-foreground">First assessment fee</span>
                    </div>

                    {/* Telehealth Platform */}
                    <div className="p-4 rounded-xl border bg-gradient-to-br from-card to-purple-50/20 dark:to-purple-950/10 space-y-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        Telehealth Provider
                      </span>
                      <div className="text-lg font-bold text-foreground capitalize flex items-center gap-1.5 pt-1">
                        <Video className="h-4 w-4 text-purple-600" />
                        {physioProfile?.videoPlatformPreference || 'GetStream Video'}
                      </div>
                      <span className="text-[11px] text-muted-foreground">Integrated consult engine</span>
                    </div>
                  </div>

                  {/* Multi-Session Packages */}
                  {physioProfile?.packageRates && physioProfile.packageRates.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                          Multi-Session Care Packages
                        </span>
                        {physioProfile.packageDiscountPercent && (
                          <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-800">
                            {physioProfile.packageDiscountPercent}% Package Discount applied
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {physioProfile.packageRates.map((pkg: any, idx: number) => (
                          <div key={idx} className="p-3.5 rounded-xl border bg-muted/30 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-sm text-foreground">
                                {pkg.sessions} Sessions
                              </span>
                              <Badge variant="outline" className="text-[11px]">
                                {formatNaira(pkg.price)}
                              </Badge>
                            </div>
                            {pkg.description && (
                              <p className="text-xs text-muted-foreground pt-1 leading-snug">
                                {pkg.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Public Booking Link Card */}
              <Card className="border shadow-sm bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-emerald-400" />
                        <h3 className="font-bold text-base">Public Direct Booking URL</h3>
                      </div>
                      <p className="text-xs text-emerald-200/80">
                        Patients can directly book appointments with this physiotherapist via this link.
                      </p>
                      <div className="pt-2 font-mono text-xs text-emerald-300 bg-black/40 px-3 py-1.5 rounded-lg inline-block border border-emerald-800/60">
                        physioaroundme.com{bookingUrl}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs gap-1.5"
                        onClick={() => copyToClipboard(`https://physioaroundme.com${bookingUrl}`, 'Booking URL')}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy Link
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-emerald-400/40 text-white hover:bg-white/10 text-xs gap-1.5"
                        onClick={() => window.open(bookingUrl, '_blank')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── TAB 3: PATIENTS & SESSIONS ── */}
            <TabsContent value="activity" className="space-y-6 mt-0">
              {/* Active Patients */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                        <Users className="h-4 w-4 text-emerald-600" />
                        Assigned Patient Relationships
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Active patient caseload connected to this practitioner
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {stats.patientCount} Active Patients
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {activePatientsList && activePatientsList.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {activePatientsList.map((patient: any) => (
                        <div
                          key={patient._id}
                          className="flex items-center justify-between p-3 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={patient.imageUrl} />
                              <AvatarFallback className="text-xs bg-emerald-100 text-emerald-800">
                                {patient.name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-semibold text-sm text-foreground">
                                {patient.name}
                              </div>
                              <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                                {patient.email || 'No email provided'}
                              </div>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-[11px] capitalize">
                            {patient.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground space-y-2">
                      <Users className="h-8 w-8 mx-auto text-muted-foreground/50" />
                      <p className="text-sm">No patient relationships recorded yet.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Sessions */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                        <Calendar className="h-4 w-4 text-emerald-600" />
                        Recent & Scheduled Consultations
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Historical and upcoming appointment activity
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {stats.appointmentCount} Total Sessions
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {recentAppointments && recentAppointments.length > 0 ? (
                    <div className="space-y-2.5">
                      {recentAppointments.map((appt: any) => (
                        <div
                          key={appt._id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border bg-card hover:bg-muted/40 transition-colors gap-2"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center shrink-0">
                              {appt.isOnline ? (
                                <Video className="h-4 w-4" />
                              ) : (
                                <Building2 className="h-4 w-4" />
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-sm text-foreground">
                                {appt.serviceType || 'Physical Therapy Session'}
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <span>Patient: {appt.patientName}</span>
                                <span>•</span>
                                <span>
                                  {format(new Date(appt.startTime), 'MMM dd, yyyy · HH:mm')}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <Badge
                              variant="outline"
                              className={`text-[11px] capitalize ${
                                appt.status === 'completed'
                                  ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                                  : appt.status === 'scheduled' || appt.status === 'confirmed'
                                    ? 'border-blue-200 text-blue-700 bg-blue-50'
                                    : 'border-zinc-200 text-zinc-600'
                              }`}
                            >
                              {appt.status.replace('_', ' ')}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground space-y-2">
                      <Calendar className="h-8 w-8 mx-auto text-muted-foreground/50" />
                      <p className="text-sm">No appointment history found for this practitioner.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── TAB 4: PATIENT RECORD (IF APPLICABLE) ── */}
            {patientProfile && (
              <TabsContent value="patient-info" className="space-y-6 mt-0">
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                      <User className="h-4 w-4 text-purple-600" />
                      Patient Medical Profile
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="p-3 rounded-lg bg-muted/40 border">
                        <span className="text-muted-foreground block">Date of Birth</span>
                        <span className="font-semibold text-foreground text-sm">{patientProfile.dateOfBirth || '—'}</span>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/40 border">
                        <span className="text-muted-foreground block">Gender</span>
                        <span className="font-semibold text-foreground text-sm capitalize">{patientProfile.gender || '—'}</span>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/40 border">
                        <span className="text-muted-foreground block">City & Country</span>
                        <span className="font-semibold text-foreground text-sm">
                          {[patientProfile.city, patientProfile.country].filter(Boolean).join(', ') || '—'}
                        </span>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/40 border">
                        <span className="text-muted-foreground block">Address</span>
                        <span className="font-semibold text-foreground text-sm">{patientProfile.address || '—'}</span>
                      </div>
                    </div>

                    {patientProfile.medicalHistorySummary && (
                      <div className="space-y-1.5 pt-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                          Medical History Summary
                        </span>
                        <p className="text-xs bg-muted/40 p-3.5 rounded-xl border text-foreground leading-relaxed">
                          {patientProfile.medicalHistorySummary}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      {/* ── Role Change Dialog ── */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Platform Role</DialogTitle>
            <DialogDescription>
              Assign a new operational role to {user.firstName} {user.lastName} ({user.email}).
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Select New Role:</label>
              <Select value={selectedRole} onValueChange={(val) => setSelectedRole(val as UserRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="physiotherapist">
                    <div className="flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-emerald-600" />
                      <span>Physiotherapist</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="clinic_owner">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-blue-600" />
                      <span>Clinic Owner</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="patient">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-purple-600" />
                      <span>Patient</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="family_member">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-zinc-600" />
                      <span>Family Member</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-red-600" />
                      <span>Administrator</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedRole === 'admin' && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <Crown className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  Granting administrator privileges gives this user full platform governance and clinical oversight capabilities.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleDialog(false)} disabled={isUpdatingRole}>
              Cancel
            </Button>
            <Button
              onClick={handleRoleChange}
              disabled={isUpdatingRole || selectedRole === user.role}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isUpdatingRole ? 'Updating...' : 'Save Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function HealthcareDetailSkeleton() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left skeleton */}
        <div className="lg:col-span-4 space-y-6">
          <Card>
            <Skeleton className="h-20 w-full" />
            <CardContent className="pt-0 px-6 pb-6 space-y-4">
              <Skeleton className="h-20 w-20 rounded-full -mt-10 border-4 border-background" />
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <div className="space-y-3 pt-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right skeleton */}
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="h-3 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="p-6 space-y-4">
              <Skeleton className="h-6 w-48" />
              <div className="grid grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
