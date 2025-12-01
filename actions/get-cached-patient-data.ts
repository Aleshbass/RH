'use server'

import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import { auth } from '@clerk/nextjs/server'
import { ConvexCacheAdapter, CACHE_CONFIGS, createCacheKey } from '@/lib/cache/convexCacheAdapter'

export async function getCachedPatientData() {
    const { userId } = await auth()

    if (!userId) {
        return { user: null, appointments: [], stats: null }
    }

    const token = await (await auth()).getToken({ template: 'convex' })
    const context = { token: token || undefined }

    // 1. Fetch User (Cache for 15 mins)
    const userCacheKey = createCacheKey(userId, 'myUser')
    const userPromise = ConvexCacheAdapter.getOrFetch(
        userCacheKey,
        () => fetchQuery(api.users.getMyUser, {}, context),
        CACHE_CONFIGS.USER_PROFILE
    )

    // 2. Fetch Appointments (Cache for 1 min)
    const appointmentsCacheKey = createCacheKey(userId, 'patientAppointments')
    const appointmentsPromise = ConvexCacheAdapter.getOrFetch(
        appointmentsCacheKey,
        () => fetchQuery(api.appointments.getPatientAppointments, {}, context),
        CACHE_CONFIGS.APPOINTMENTS
    )

    // 3. Fetch Stats (Cache for 5 mins)
    const statsCacheKey = createCacheKey(userId, 'patientStats')
    const statsPromise = ConvexCacheAdapter.getOrFetch(
        statsCacheKey,
        () => fetchQuery(api.analytics.getPatientStats, {}, context),
        CACHE_CONFIGS.DASHBOARD_STATS
    )

    const [user, appointments, stats] = await Promise.all([
        userPromise,
        appointmentsPromise,
        statsPromise
    ])

    return { user, appointments, stats }
}
