'use server'

import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import { auth } from '@clerk/nextjs/server'
import { ConvexCacheAdapter, CACHE_CONFIGS, createCacheKey } from '@/lib/cache/convexCacheAdapter'

export async function getCachedClinicData() {
    const authData = await auth()
    const { userId } = authData

    if (!userId) {
        return {
            user: null,
            approvalStatus: null,
            clinic: null,
            stats: null,
            revenue: null,
            activity: [],
            staff: [],
            invitations: []
        }
    }

    let token: string | null = null
    try {
        token = await authData.getToken({ template: 'convex' })
    } catch (error) {
        console.error('Error fetching Convex token:', error)
    }
    const context = { token: token || undefined }

    // 1. Fetch User & Approval (Cache for 15 mins)
    const userCacheKey = createCacheKey(userId, 'myUser')
    const userPromise = ConvexCacheAdapter.getOrFetch(
        userCacheKey,
        () => fetchQuery(api.users.getMyUser, {}, context),
        CACHE_CONFIGS.USER_PROFILE
    )

    const approvalCacheKey = createCacheKey(userId, 'approvalStatus')
    const approvalPromise = ConvexCacheAdapter.getOrFetch(
        approvalCacheKey,
        () => fetchQuery(api.users.getUserApprovalStatus, {}, context),
        CACHE_CONFIGS.USER_PROFILE
    )

    // 2. Fetch Clinic Info (Cache for 30 mins)
    const clinicCacheKey = createCacheKey(userId, 'myClinic')
    const clinicPromise = ConvexCacheAdapter.getOrFetch(
        clinicCacheKey,
        () => fetchQuery(api.clinics.getMyClinic, {}, context),
        CACHE_CONFIGS.CLINIC_INFO
    )

    // 3. Fetch Stats & Revenue (Cache for 5 mins)
    const statsCacheKey = createCacheKey(userId, 'clinicStats')
    const statsPromise = ConvexCacheAdapter.getOrFetch(
        statsCacheKey,
        () => fetchQuery(api.clinics.getClinicDashboardStats, {}, context),
        CACHE_CONFIGS.DASHBOARD_STATS
    )

    const revenueCacheKey = createCacheKey(userId, 'clinicRevenue')
    const revenuePromise = ConvexCacheAdapter.getOrFetch(
        revenueCacheKey,
        () => fetchQuery(api.clinics.getClinicRevenue, {}, context),
        CACHE_CONFIGS.DASHBOARD_STATS
    )

    // 4. Fetch Activity (Cache for 1 min)
    const activityCacheKey = createCacheKey(userId, 'clinicActivity')
    const activityPromise = ConvexCacheAdapter.getOrFetch(
        activityCacheKey,
        () => fetchQuery(api.clinics.getClinicActivity, { limit: 5 }, context),
        CACHE_CONFIGS.DASHBOARD_STATS // Reusing stats config for now, maybe needs shorter TTL
    )

    // 5. Fetch Staff & Invitations (Cache for 5 mins)
    const staffCacheKey = createCacheKey(userId, 'clinicStaff')
    const staffPromise = ConvexCacheAdapter.getOrFetch(
        staffCacheKey,
        () => fetchQuery(api.clinics.getClinicStaff, {}, context),
        CACHE_CONFIGS.CLINIC_INFO
    )

    const invitationsCacheKey = createCacheKey(userId, 'clinicInvitations')
    const invitationsPromise = ConvexCacheAdapter.getOrFetch(
        invitationsCacheKey,
        () => fetchQuery(api.clinics.getClinicInvitations, {}, context),
        CACHE_CONFIGS.CLINIC_INFO
    )

    // Wrap each promise with a fallback so preview mode doesn't crash
    // when queries throw auth errors for non-clinic-owner users
    const safeFetch = <T,>(promise: Promise<T>, fallback: T): Promise<T> =>
        promise.catch((err) => {
            console.warn('[Preview Mode] Query failed, using fallback:', err?.message || err)
            return fallback
        })

    const [user, approvalStatus, clinic, stats, revenue, activity, staff, invitations] = await Promise.all([
        safeFetch(userPromise, null),
        safeFetch(approvalPromise, null),
        safeFetch(clinicPromise, null),
        safeFetch(statsPromise, {
            totalPatients: 0,
            activeStaff: 0,
            appointmentsToday: 0,
            thisMonthAppointments: 0,
            completionRate: 0,
            pendingInvitations: 0,
        }),
        safeFetch(revenuePromise, null),
        safeFetch(activityPromise, []),
        safeFetch(staffPromise, []),
        safeFetch(invitationsPromise, [])
    ])

    return { user, approvalStatus, clinic, stats, revenue, activity, staff, invitations }
}
