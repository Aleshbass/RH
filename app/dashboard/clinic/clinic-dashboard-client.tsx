'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
    Users,
    Calendar,
    TrendingUp,
    CheckCircle2,
    UserPlus,
    Building2,
    Loader2,
    DollarSign,
    Stethoscope,
    Settings,
    AlertCircle,
    Activity
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { useQueryUntyped } from '@/lib/convexUntyped'
import { TourGuide } from '@/components/shared/TourGuide'

// Type definitions
interface ActivityItem {
    type: string;
    title?: string;
    description: string;
    timestamp: number;
    status?: string;
    [key: string]: unknown;
}

interface StaffMember {
    _id: string;
    user?: {
        imageUrl?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
    };
}

interface ClinicDashboardClientProps {
    initialData: {
        user: any;
        approvalStatus: any;
        clinic: any;
        stats: any;
        revenue: any;
        activity: any;
        staff: any;
        invitations: any;
    }
}

export default function ClinicDashboardClient({ initialData }: ClinicDashboardClientProps) {
    const router = useRouter()
    const { isLoaded, isSignedIn } = useAuth()

    // Real-time queries with fallback to initial data
    const liveUser = useQueryUntyped(api.users.getMyUser)
    const currentUser = liveUser || initialData.user

    const liveApproval = useQueryUntyped(api.users.getUserApprovalStatus)
    const approvalStatus = liveApproval || initialData.approvalStatus

    const liveClinic = useQueryUntyped(api.clinics.getMyClinic)
    const clinic = liveClinic || initialData.clinic

    const liveStats = useQuery(api.clinics.getClinicDashboardStats)
    const clinicStats = liveStats || initialData.stats

    const liveRevenue = useQuery(api.clinics.getClinicRevenue)
    const clinicRevenue = liveRevenue || initialData.revenue

    const liveActivity = useQuery(api.clinics.getClinicActivity, { limit: 5 })
    const recentActivity = liveActivity || initialData.activity

    const liveStaff = useQuery(api.clinics.getClinicStaff)
    const clinicStaff = liveStaff || initialData.staff

    const liveInvitations = useQuery(api.clinics.getClinicInvitations)
    const pendingInvitations = liveInvitations || initialData.invitations

    const authRedirected = useRef(false)
    const roleRedirected = useRef(false)
    const nowRef = useRef(Date.now())
    const [welcomeDismissed, setWelcomeDismissed] = useState(false)

    const userId = currentUser?._id

    // Load welcome dismissal state from localStorage
    useEffect(() => {
        if (!userId) return
        try {
            const key = `clinic_welcome_dismissed_${userId}`
            const val = window.localStorage.getItem(key)
            setWelcomeDismissed(val === '1')
        } catch {
            // ignore storage errors
        }
    }, [userId])

    // Redirect if not authenticated
    useEffect(() => {
        if (isLoaded && !isSignedIn && !authRedirected.current) {
            authRedirected.current = true
            router.push('/sign-in')
        }
    }, [isLoaded, isSignedIn, router])

    // Redirect if not approved clinic owner
    useEffect(() => {
        if (currentUser && approvalStatus !== undefined) {
            if (currentUser.role !== 'clinic_owner' && !roleRedirected.current) {
                roleRedirected.current = true
                router.push('/sign-in')
                return
            }
        }
    }, [currentUser, approvalStatus, router])

    // Loading state
    if (!isLoaded || currentUser === undefined || approvalStatus === undefined) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50/50">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary/50" />
                    <p className="text-sm text-muted-foreground">Loading your clinic dashboard...</p>
                </div>
            </div>
        )
    }

    // Show error if no clinic found
    if (clinic === null) {
        return (
            <div className="container max-w-5xl mx-auto p-4 sm:p-6">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        No clinic found. Please complete your clinic setup first.
                    </AlertDescription>
                </Alert>
            </div>
        )
    }

    // Loading state for data
    const isDataLoading = clinic === undefined || clinicStats === undefined || clinicRevenue === undefined

    // Determine if we should show the Welcome card
    const isRecentlyApproved = Boolean(
        approvalStatus &&
        approvalStatus.status === 'approved' &&
        typeof approvalStatus.reviewedAt === 'number' &&
        nowRef.current - approvalStatus.reviewedAt <= 7 * 24 * 60 * 60 * 1000
    )

    const shouldShowWelcome = Boolean(isRecentlyApproved && currentUser?.onboarded && !welcomeDismissed)

    const pendingInvitesCount = Array.isArray(pendingInvitations)
        ? pendingInvitations.filter((inv: { status: string; isExpired?: boolean }) => inv.status === "pending" && !inv.isExpired).length
        : 0;

    const handleDismissWelcome = () => {
        setWelcomeDismissed(true)
        if (!userId) return
        try {
            window.localStorage.setItem(`clinic_welcome_dismissed_${userId}`, '1')
        } catch {
            // ignore storage errors
        }
    }

    return (
        <div className="min-h-screen bg-gray-50/50">
            <div className="container max-w-6xl mx-auto p-4 space-y-6">
                {/* Header */}
                <div id="clinic-dashboard-header" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
                            {clinic?.name || 'Clinic Dashboard'}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Overview of your clinic operations
                        </p>
                    </div>
                    <div className="flex items-center gap-3 self-start sm:self-auto">
                        {approvalStatus?.status === 'approved' ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 py-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Approved
                            </Badge>
                        ) : approvalStatus?.status === 'pending_review' ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1.5 py-1.5">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Pending approval
                            </Badge>
                        ) : (
                            <Badge variant="destructive" className="gap-1.5 py-1.5">
                                <AlertCircle className="h-3.5 w-3.5" />
                                Rejected
                            </Badge>
                        )}
                        <div className="h-8 w-px bg-gray-200 hidden sm:block" />
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium hidden sm:inline-block">
                                {currentUser?.firstName}
                            </span>
                            <Avatar className="h-9 w-9 border border-gray-200">
                                <AvatarImage src={currentUser?.imageUrl} />
                                <AvatarFallback className="bg-gray-100 text-gray-600">
                                    {currentUser?.firstName?.charAt(0) || currentUser?.email?.charAt(0) || 'C'}
                                </AvatarFallback>
                            </Avatar>
                        </div>
                    </div>
                </div>

                {shouldShowWelcome && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 sm:p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100"
                                onClick={handleDismissWelcome}
                            >
                                <span className="sr-only">Dismiss</span>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                </svg>
                            </Button>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center relative z-10">
                            <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-600">
                                <Building2 className="h-6 w-6" />
                            </div>
                            <div className="space-y-1 flex-1">
                                <h3 className="text-lg font-semibold text-emerald-900">Welcome to Rehabify Health!</h3>
                                <p className="text-emerald-700/90 text-sm max-w-2xl">
                                    Your clinic account has been approved and you're ready to manage your practice.
                                    Start by inviting your team of physiotherapists.
                                </p>
                            </div>
                            <Button
                                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shrink-0 w-full sm:w-auto"
                                onClick={() => router.push('/dashboard/clinic/staff?action=invite')}
                            >
                                <UserPlus className="mr-2 h-4 w-4" />
                                Invite Physiotherapists
                            </Button>
                        </div>
                    </div>
                )}

                {/* Quick Stats */}
                <div id="clinic-quick-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="shadow-none border border-gray-200">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Total Patients</CardTitle>
                            <Users className="h-4 w-4 text-gray-400" />
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            {isDataLoading ? (
                                <Skeleton className="h-7 w-16 mb-1" />
                            ) : (
                                <div className="text-2xl font-bold text-gray-900">{clinicStats?.totalPatients || 0}</div>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                                Across all physiotherapists
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-none border border-gray-200">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Active Staff</CardTitle>
                            <Stethoscope className="h-4 w-4 text-gray-400" />
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            {isDataLoading ? (
                                <Skeleton className="h-7 w-16 mb-1" />
                            ) : (
                                <div className="text-2xl font-bold text-gray-900">{clinicStats?.activeStaff || 0}</div>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                                {pendingInvitesCount > 0
                                    ? `${pendingInvitesCount} pending invites`
                                    : 'All approved and active'
                                }
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-none border border-gray-200">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Monthly Revenue</CardTitle>
                            <DollarSign className="h-4 w-4 text-gray-400" />
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            {isDataLoading ? (
                                <Skeleton className="h-7 w-20 mb-1" />
                            ) : (
                                <div className="text-2xl font-bold text-gray-900">
                                    ₦{clinicRevenue?.thisMonth?.toLocaleString() || '0'}
                                </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                                {clinicRevenue?.growth !== undefined ? (
                                    clinicRevenue.growth >= 0 ? (
                                        <span className="text-emerald-600 font-medium">+{clinicRevenue.growth}% from last month</span>
                                    ) : (
                                        <span className="text-red-600 font-medium">{clinicRevenue.growth}% from last month</span>
                                    )
                                ) : (
                                    'This month'
                                )}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-none border border-gray-200">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Completion Rate</CardTitle>
                            <TrendingUp className="h-4 w-4 text-gray-400" />
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            {isDataLoading ? (
                                <Skeleton className="h-7 w-16 mb-1" />
                            ) : (
                                <div className="text-2xl font-bold text-gray-900">{clinicStats?.completionRate || 0}%</div>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                                Appointment completion rate
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column (2/3 width on large screens) */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Clinic Overview */}
                        <Card id="clinic-overview-card" className="shadow-none border border-gray-200">
                            <CardHeader className="p-6 pb-4 border-b border-gray-100">
                                <CardTitle className="text-lg font-semibold">Clinic Overview</CardTitle>
                                <CardDescription>Daily operations and key metrics</CardDescription>
                            </CardHeader>
                            <CardContent className="p-6">
                                <div className="space-y-8">
                                    {/* Today's Stats */}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col items-center justify-center text-center">
                                            {isDataLoading ? (
                                                <Skeleton className="h-8 w-8 mb-2" />
                                            ) : (
                                                <div className="text-2xl font-bold text-gray-900">
                                                    {clinicStats?.appointmentsToday || 0}
                                                </div>
                                            )}
                                            <div className="text-xs font-medium text-gray-500 mt-1">Today's Appointments</div>
                                        </div>
                                        <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100 flex flex-col items-center justify-center text-center">
                                            {isDataLoading ? (
                                                <Skeleton className="h-8 w-8 mb-2" />
                                            ) : (
                                                <div className="text-2xl font-bold text-emerald-700">
                                                    {Math.round((clinicStats?.appointmentsToday || 0) * (clinicStats?.completionRate || 0) / 100)}
                                                </div>
                                            )}
                                            <div className="text-xs font-medium text-emerald-600 mt-1">Completed Today</div>
                                        </div>
                                        <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-100 flex flex-col items-center justify-center text-center col-span-2 sm:col-span-1">
                                            {isDataLoading ? (
                                                <Skeleton className="h-8 w-8 mb-2" />
                                            ) : (
                                                <div className="text-2xl font-bold text-amber-700">
                                                    {clinicStats?.pendingInvitations || 0}
                                                </div>
                                            )}
                                            <div className="text-xs font-medium text-amber-600 mt-1">Pending Invitations</div>
                                        </div>
                                    </div>

                                    {/* Recent Activity */}
                                    <div>
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-sm font-semibold text-gray-900">Recent Activity</h4>
                                            <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => router.push('/dashboard/clinic/reports')}>
                                                View All
                                            </Button>
                                        </div>
                                        <div className="space-y-1">
                                            {recentActivity === undefined ? (
                                                Array.from({ length: 3 }).map((_, i) => (
                                                    <div key={i} className="flex items-center gap-4 p-3 rounded-lg">
                                                        <Skeleton className="w-8 h-8 rounded-full" />
                                                        <div className="space-y-1 flex-1">
                                                            <Skeleton className="h-4 w-1/3" />
                                                            <Skeleton className="h-3 w-1/4" />
                                                        </div>
                                                    </div>
                                                ))
                                            ) : recentActivity.length === 0 ? (
                                                <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl">
                                                    <Activity className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                                    <p className="text-sm text-gray-500">No recent activity</p>
                                                </div>
                                            ) : (
                                                recentActivity.map((activity: ActivityItem, index: number) => {
                                                    const getActivityIcon = (type: string) => {
                                                        switch (type) {
                                                            case 'appointment': return <Calendar className="h-4 w-4" />
                                                            case 'invitation': return <UserPlus className="h-4 w-4" />
                                                            case 'patient_registration': return <Users className="h-4 w-4" />
                                                            case 'patient_registered': return <UserPlus className="h-4 w-4" />
                                                            case 'appointment_completed': return <CheckCircle2 className="h-4 w-4" />
                                                            case 'schedule_updated': return <Calendar className="h-4 w-4" />
                                                            case 'staff_joined': return <Stethoscope className="h-4 w-4" />
                                                            default: return <Activity className="h-4 w-4" />
                                                        }
                                                    }

                                                    const getActivityStyles = (type: string) => {
                                                        switch (type) {
                                                            case 'appointment': return 'bg-purple-50 text-purple-600'
                                                            case 'invitation': return 'bg-amber-50 text-amber-600'
                                                            case 'patient_registration': return 'bg-blue-50 text-blue-600'
                                                            case 'patient_registered': return 'bg-blue-50 text-blue-600'
                                                            case 'appointment_completed': return 'bg-emerald-50 text-emerald-600'
                                                            case 'schedule_updated': return 'bg-purple-50 text-purple-600'
                                                            case 'staff_joined': return 'bg-indigo-50 text-indigo-600'
                                                            default: return 'bg-gray-100 text-gray-600'
                                                        }
                                                    }

                                                    return (
                                                        <div key={index} className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors group">
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${getActivityStyles(activity.type)}`}>
                                                                {getActivityIcon(activity.type)}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <p className="text-sm font-medium text-gray-900 truncate">
                                                                        {activity.title || 'Activity'}
                                                                    </p>
                                                                    <span className="text-xs text-gray-400 whitespace-nowrap">
                                                                        {activity.timestamp ? formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true }) : 'Just now'}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-gray-500 truncate mt-0.5">
                                                                    {activity.description}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column (1/3 width on large screens) */}
                    <div className="space-y-6">
                        {/* Management Actions */}
                        <Card id="clinic-management-actions" className="shadow-none border border-gray-200">
                            <CardHeader className="p-4 pb-2 border-b border-gray-100">
                                <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
                            </CardHeader>
                            <CardContent className="p-2">
                                <div className="grid gap-1">
                                    <Button variant="ghost" className="w-full justify-start h-10 px-3 font-normal text-gray-600 hover:text-gray-900 hover:bg-gray-50" onClick={() => router.push('/dashboard/clinic/staff')}>
                                        <Stethoscope className="mr-3 h-4 w-4 text-gray-400" />
                                        Manage Physiotherapists
                                    </Button>
                                    <Button variant="ghost" className="w-full justify-start h-10 px-3 font-normal text-gray-600 hover:text-gray-900 hover:bg-gray-50" onClick={() => router.push('/dashboard/clinic/patients')}>
                                        <Users className="mr-3 h-4 w-4 text-gray-400" />
                                        View All Patients
                                    </Button>
                                    <Button variant="ghost" className="w-full justify-start h-10 px-3 font-normal text-gray-600 hover:text-gray-900 hover:bg-gray-50" onClick={() => router.push('/dashboard/clinic/appointments')}>
                                        <Calendar className="mr-3 h-4 w-4 text-gray-400" />
                                        Clinic Schedule
                                    </Button>
                                    <Button variant="ghost" className="w-full justify-start h-10 px-3 font-normal text-gray-600 hover:text-gray-900 hover:bg-gray-50" onClick={() => router.push('/dashboard/clinic/reports')}>
                                        <DollarSign className="mr-3 h-4 w-4 text-gray-400" />
                                        Financial Reports
                                    </Button>
                                    <Button variant="ghost" className="w-full justify-start h-10 px-3 font-normal text-gray-600 hover:text-gray-900 hover:bg-gray-50" onClick={() => router.push('/dashboard/clinic/settings')}>
                                        <Settings className="mr-3 h-4 w-4 text-gray-400" />
                                        Clinic Settings
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Team Members */}
                        <Card id="clinic-team-members" className="shadow-none border border-gray-200">
                            <CardHeader className="p-4 pb-2 border-b border-gray-100 flex flex-row items-center justify-between">
                                <CardTitle className="text-base font-semibold">Team Members</CardTitle>
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => router.push('/dashboard/clinic/staff')}>
                                    Manage
                                </Button>
                            </CardHeader>
                            <CardContent className="p-4">
                                <div className="space-y-4">
                                    {clinicStaff === undefined ? (
                                        Array.from({ length: 3 }).map((_, i) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <Skeleton className="h-8 w-8 rounded-full" />
                                                <div className="space-y-1 flex-1">
                                                    <Skeleton className="h-3 w-24" />
                                                    <Skeleton className="h-2 w-16" />
                                                </div>
                                            </div>
                                        ))
                                    ) : clinicStaff.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">No staff yet</p>
                                    ) : (
                                        clinicStaff.slice(0, 4).map((member: StaffMember) => (
                                            <div key={member._id} className="flex items-center justify-between group">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8 border border-gray-200">
                                                        <AvatarImage src={member.user?.imageUrl} />
                                                        <AvatarFallback className="text-xs bg-gray-50">
                                                            {member.user?.firstName?.[0] || member.user?.email?.[0] || 'S'}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-gray-900 truncate">
                                                            {member.user?.firstName || ''} {member.user?.lastName || ''}
                                                        </p>
                                                        <p className="text-xs text-gray-500 truncate">
                                                            {member.user?.email || ''}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Pending Invitations */}
                        {pendingInvitesCount > 0 && (
                            <Card id="clinic-pending-invites" className="shadow-none border border-gray-200">
                                <CardHeader className="p-4 pb-2 border-b border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base font-semibold">Pending Invites</CardTitle>
                                        <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-100">{pendingInvitesCount}</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4">
                                    <div className="space-y-3">
                                        {pendingInvitations
                                            .filter((inv: { status: string; isExpired?: boolean }) => inv.status === 'pending' && !inv.isExpired)
                                            .slice(0, 3)
                                            .map((inv: { _id: string; inviteeEmail: string; role: string; expiresAt: number }) => (
                                                <div key={inv._id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
                                                    <div className="min-w-0 flex-1 mr-2">
                                                        <p className="text-sm font-medium text-gray-900 truncate">{inv.inviteeEmail}</p>
                                                        <p className="text-xs text-gray-500">Expires {formatDistanceToNow(new Date(inv.expiresAt), { addSuffix: true })}</p>
                                                    </div>
                                                </div>
                                            ))
                                        }
                                        <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => router.push('/dashboard/clinic/staff?action=invite')}>
                                            <UserPlus className="mr-2 h-3.5 w-3.5" />
                                            Invite More
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>

            <TourGuide
                tourId="clinic-dashboard-tour"
                steps={[
                    {
                        target: "#clinic-dashboard-header",
                        title: "Welcome to your Dashboard",
                        content: "This is your command center. Monitor your clinic's performance and manage your team from one place.",
                        position: "bottom"
                    },
                    {
                        target: "#clinic-quick-stats",
                        title: "Key Metrics",
                        content: "Track total patients, active staff, revenue, and appointment completion rates at a glance.",
                        position: "bottom"
                    },
                    {
                        target: "#clinic-overview-card",
                        title: "Daily Operations",
                        content: "See today's appointments and recent activity across your clinic.",
                        position: "top"
                    },
                    {
                        target: "#clinic-management-actions",
                        title: "Quick Actions",
                        content: "Fast access to manage staff, patients, schedule, and settings.",
                        position: "left"
                    }
                ]}
            />
        </div>
    )
}
