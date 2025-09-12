import { SessionCache, CACHE_TTL } from './caching'
import { Id } from '@/convex/_generated/dataModel'

// Session data structure
type RecentActivityKeys = 'lastLogin' | 'lastActivity' | 'lastAppointment' | 'lastPatientView' | 'lastClinicView';

export interface UserSession {
  userId: Id<"users">
  clerkId: string
  role?: string
  lastActivity: number
  preferences?: {
    theme?: 'light' | 'dark'
    language?: string
    timezone?: string
    dashboardLayout?: Record<string, unknown>
  }
  dashboardState?: {
    activeTab?: string
    filters?: Record<string, unknown>
    sidebarCollapsed?: boolean
  }
  recentActivity?: {
    lastLogin?: number
    lastActivity?: number
    lastAppointment?: number
    lastPatientView?: string
    lastClinicView?: string
  }
}

export class SessionManager {
  /**
   * Create or update user session
   */
  static async createSession(
    userId: Id<"users">,
    clerkId: string,
    initialData: Partial<UserSession> = {}
  ): Promise<boolean> {
    try {
      const sessionData: UserSession = {
        userId,
        clerkId,
        lastActivity: Date.now(),
        recentActivity: {
          lastLogin: Date.now(),
        },
        ...initialData,
      }

      const success = await SessionCache.setSession(
        userId,
        sessionData as unknown as Record<string, unknown>,
        CACHE_TTL.SESSION
      )

      if (success) {
        console.log(`[SESSION] Created session for user: ${userId}`)
      }

      return success
    } catch (error) {
      console.error('[SESSION] Error creating session:', error)
      return false
    }
  }

  /**
   * Get user session
   */
  static async getSession(userId: Id<"users">): Promise<UserSession | null> {
    try {
      const session = await SessionCache.getSession(userId)
      return session as UserSession | null
    } catch (error) {
      console.error('[SESSION] Error getting session:', error)
      return null
    }
  }

  /**
   * Update user session activity
   */
  static async updateActivity(userId: Id<"users">): Promise<boolean> {
    try {
      const existing = await this.getSession(userId)
      if (!existing) return false

      const updated: UserSession = {
        ...existing,
        lastActivity: Date.now(),
      }

      return SessionCache.setSession(userId, updated as unknown as Record<string, unknown>, CACHE_TTL.SESSION)
    } catch (error) {
      console.error('[SESSION] Error updating activity:', error)
      return false
    }
  }

  /**
   * Update user preferences in session
   */
  static async updatePreferences(
    userId: Id<"users">,
    preferences: Partial<UserSession['preferences']>
  ): Promise<boolean> {
    try {
      const existing = await this.getSession(userId)
      if (!existing) return false

      const updated: UserSession = {
        ...existing,
        preferences: {
          ...existing.preferences,
          ...preferences,
        },
        lastActivity: Date.now(),
      }

      return SessionCache.setSession(userId, updated as unknown as Record<string, unknown>, CACHE_TTL.SESSION)
    } catch (error) {
      console.error('[SESSION] Error updating preferences:', error)
      return false
    }
  }

  /**
   * Update dashboard state in session
   */
  static async updateDashboardState(
    userId: Id<"users">,
    dashboardState: Partial<UserSession['dashboardState']>
  ): Promise<boolean> {
    try {
      const existing = await this.getSession(userId)
      if (!existing) return false

      const updated: UserSession = {
        ...existing,
        dashboardState: {
          ...existing.dashboardState,
          ...dashboardState,
        },
        lastActivity: Date.now(),
      }

      return SessionCache.setSession(userId, updated as unknown as Record<string, unknown>, CACHE_TTL.SESSION)
    } catch (error) {
      console.error('[SESSION] Error updating dashboard state:', error)
      return false
    }
  }

  /**
   * Record recent activity
   */
  static async recordActivity(
    userId: Id<"users">,
    activityType: RecentActivityKeys,
    value: number | string
  ): Promise<boolean> {
    try {
      const existing = await this.getSession(userId)
      if (!existing) return false

      const updated: UserSession = {
        ...existing,
        recentActivity: {
          ...existing.recentActivity,
          [activityType]: value,
        },
        lastActivity: Date.now(),
      }

      return SessionCache.setSession(userId, updated as unknown as Record<string, unknown>, CACHE_TTL.SESSION)
    } catch (error) {
      console.error('[SESSION] Error recording activity:', error)
      return false
    }
  }

  /**
   * Check if session is active (within last 30 minutes)
   */
  static async isSessionActive(userId: Id<"users">): Promise<boolean> {
    try {
      const session = await this.getSession(userId)
      if (!session) return false

      const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000)
      return session.lastActivity > thirtyMinutesAgo
    } catch (error) {
      console.error('[SESSION] Error checking session activity:', error)
      return false
    }
  }

  /**
   * Extend session TTL
   */
  static async extendSession(userId: Id<"users">): Promise<boolean> {
    try {
      const session = await this.getSession(userId)
      if (!session) return false

      // Reset the session with updated activity time and fresh TTL
      return SessionCache.setSession(userId, {
        ...session,
        lastActivity: Date.now(),
      }, CACHE_TTL.SESSION)
    } catch (error) {
      console.error('[SESSION] Error extending session:', error)
      return false
    }
  }

  /**
   * Destroy user session
   */
  static async destroySession(userId: Id<"users">): Promise<boolean> {
    try {
      const success = await SessionCache.deleteSession(userId)
      if (success) {
        console.log(`[SESSION] Destroyed session for user: ${userId}`)
      }
      return success
    } catch (error) {
      console.error('[SESSION] Error destroying session:', error)
      return false
    }
  }

  /**
   * Get all active sessions (for admin purposes)
   */
  static async getActiveSessions(): Promise<UserSession[]> {
    try {
      // This would require scanning Redis keys, which is expensive
      // In a production environment, you might want to maintain a separate
      // active sessions list or use Redis Sets
      console.warn('[SESSION] getActiveSessions not implemented for performance reasons')
      return []
    } catch (error) {
      console.error('[SESSION] Error getting active sessions:', error)
      return []
    }
  }

  /**
   * Clean up expired sessions (maintenance function)
   */
  static async cleanupExpiredSessions(): Promise<number> {
    try {
      // This would be implemented as a background job
      // For now, Redis handles TTL automatically
      console.log('[SESSION] Expired sessions are automatically cleaned by Redis TTL')
      return 0
    } catch (error) {
      console.error('[SESSION] Error cleaning up sessions:', error)
      return 0
    }
  }
}
