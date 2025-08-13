'use client'
import React, { useState, useEffect } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { QueryCache, CACHE_TTL } from '@/lib/redis/caching'
import { useCachedUser } from '@/hooks/useCachedQueries'
import { useSession } from '@/hooks/useSession'
import { UserSession } from '@/lib/redis/sessionManager'

import { Calendar, Users, Clock, CheckCircle } from 'lucide-react'

interface DashboardStatsData {
  totalAppointments: number
  totalPatients: number
  upcomingAppointments: number
  completedSessions: number
  todayAppointments: number
  pendingApprovals?: number
}

/**
 * Enhanced dashboard stats component with Redis caching
 */
export function CachedDashboardStats() {
  const { user, isLoading: userLoading } = useCachedUser()
  const { session, recordActivity } = useSession()
  const [cachedStats, setCachedStats] = useState<DashboardStatsData | null>(null)
  const [isLoadingCache, setIsLoadingCache] = useState(true)
  const [cacheStatus, setCacheStatus] = useState<'loading' | 'hit' | 'miss'>('loading')

  // Fallback to Convex query if cache fails
  const convexStats = useQuery(
    api.queries.getDashboardStats,
    user && !userLoading ? {} : "skip"
  )

  useEffect(() => {
    async function loadCachedStats() {
      if (!user) {
        setIsLoadingCache(false)
        return
      }

      try {
        const cacheKey = `dashboard-stats-${user.role}-${user._id}`
        
        // Try to get from cache first
        const cached = await QueryCache.getCachedQuery<DashboardStatsData>(
          cacheKey,
          {}
        )

        if (cached) {
          setCachedStats(cached)
          setCacheStatus('hit')
          console.log('[DASHBOARD] Cache hit for dashboard stats')
          
          // Record activity
          await recordActivity('lastActivity' as keyof UserSession['recentActivity'], Date.now())
        } else {
          setCacheStatus('miss')
          console.log('[DASHBOARD] Cache miss for dashboard stats')
        }
      } catch (error) {
        console.error('[DASHBOARD] Error loading cached stats:', error)
        setCacheStatus('miss')
      } finally {
        setIsLoadingCache(false)
      }
    }

    loadCachedStats()
  }, [user, recordActivity])

  // Cache Convex data when it arrives
  useEffect(() => {
    async function cacheConvexStats() {
      if (!user || !convexStats) return

      try {
        const cacheKey = `dashboard-stats-${user.role}-${user._id}`
        
        // Cache the fresh data
        await QueryCache.cacheQuery(
          cacheKey,
          {},
          convexStats,
          CACHE_TTL.MEDIUM
        )

        // Update local state if we don't have cached data
        if (!cachedStats) {
          setCachedStats(convexStats as DashboardStatsData)
        }

        console.log('[DASHBOARD] Cached fresh dashboard stats')
      } catch (error) {
        console.error('[DASHBOARD] Error caching stats:', error)
      }
    }

    cacheConvexStats()
  }, [convexStats, user, cachedStats])

  // Use cached data if available, otherwise fallback to Convex
  const stats = cachedStats || convexStats
  const isLoading = userLoading || isLoadingCache || (!stats && convexStats === undefined)

  if (isLoading) {
    return <DashboardStatsSkeleton />
  }

  if (!stats) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Unable to load dashboard statistics</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Cache Status Indicator (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span>Cache Status:</span>
          <span className={`px-2 py-1 rounded text-white text-xs ${
            cacheStatus === 'hit' ? 'bg-green-500' : 
            cacheStatus === 'miss' ? 'bg-yellow-500' : 'bg-gray-500'
          }`}>
            {cacheStatus.toUpperCase()}
          </span>
          {session && (
            <span className="text-xs">
              Session Active: {session.lastActivity ? 'Yes' : 'No'}
            </span>
          )}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Appointments</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAppointments}</div>
            <p className="text-xs text-muted-foreground">
              All time appointments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPatients}</div>
            <p className="text-xs text-muted-foreground">
              Active patients
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.upcomingAppointments}</div>
            <p className="text-xs text-muted-foreground">
              Next 7 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedSessions}</div>
            <p className="text-xs text-muted-foreground">
              This month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Today's Appointments */}
      {stats.todayAppointments > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Today&apos;s Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {stats.todayAppointments}
            </div>
            <p className="text-sm text-muted-foreground">
              appointments scheduled for today
            </p>
          </CardContent>
        </Card>
      )}

      {/* Admin-specific stats */}
      {user?.role === 'admin' && stats.pendingApprovals !== undefined && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {stats.pendingApprovals}
            </div>
            <p className="text-sm text-muted-foreground">
              accounts awaiting approval
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * Loading skeleton for dashboard stats
 */
function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mb-2" />
            <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
