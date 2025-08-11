import { useEffect, useState, useCallback } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { SessionManager, UserSession } from '@/lib/redis/sessionManager'
import { Id } from '@/convex/_generated/dataModel'

interface UseSessionReturn {
  session: UserSession | null
  isLoading: boolean
  updatePreferences: (preferences: Partial<UserSession['preferences']>) => Promise<void>
  updateDashboardState: (state: Partial<UserSession['dashboardState']>) => Promise<void>
  recordActivity: (type: keyof UserSession['recentActivity'], value: number | string) => Promise<void>
  extendSession: () => Promise<void>
  destroySession: () => Promise<void>
  isSessionActive: boolean
}

/**
 * Hook for managing user sessions with Redis caching
 */
export function useSession(): UseSessionReturn {
  const { isLoaded, isSignedIn, userId: clerkUserId } = useAuth()
  const { user: clerkUser } = useUser()
  const convexUser = useQuery(api.users.getMyUser, isLoaded && isSignedIn ? {} : "skip")
  
  const [session, setSession] = useState<UserSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSessionActive, setIsSessionActive] = useState(false)

  // Initialize or load session when user data is available
  useEffect(() => {
    async function initializeSession() {
      if (!isLoaded || !isSignedIn || !convexUser || !clerkUserId) {
        setIsLoading(false)
        return
      }

      try {
        // Try to get existing session
        let existingSession = await SessionManager.getSession(convexUser._id)
        
        if (!existingSession) {
          // Create new session
          const success = await SessionManager.createSession(
            convexUser._id,
            clerkUserId,
            {
              role: convexUser.role,
              preferences: {
                theme: 'light', // default theme
                language: 'en',
              }
            }
          )
          
          if (success) {
            existingSession = await SessionManager.getSession(convexUser._id)
          }
        } else {
          // Update activity for existing session
          await SessionManager.updateActivity(convexUser._id)
        }

        setSession(existingSession)
        
        // Check if session is active
        const active = await SessionManager.isSessionActive(convexUser._id)
        setIsSessionActive(active)
        
      } catch (error) {
        console.error('Error initializing session:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initializeSession()
  }, [isLoaded, isSignedIn, convexUser, clerkUserId])

  // Update activity periodically
  useEffect(() => {
    if (!convexUser || !session) return

    const interval = setInterval(async () => {
      try {
        await SessionManager.updateActivity(convexUser._id)
        const active = await SessionManager.isSessionActive(convexUser._id)
        setIsSessionActive(active)
      } catch (error) {
        console.error('Error updating session activity:', error)
      }
    }, 5 * 60 * 1000) // Update every 5 minutes

    return () => clearInterval(interval)
  }, [convexUser, session])

  const updatePreferences = useCallback(async (preferences: Partial<UserSession['preferences']>) => {
    if (!convexUser) return

    try {
      const success = await SessionManager.updatePreferences(convexUser._id, preferences)
      if (success) {
        const updatedSession = await SessionManager.getSession(convexUser._id)
        setSession(updatedSession)
      }
    } catch (error) {
      console.error('Error updating preferences:', error)
    }
  }, [convexUser])

  const updateDashboardState = useCallback(async (state: Partial<UserSession['dashboardState']>) => {
    if (!convexUser) return

    try {
      const success = await SessionManager.updateDashboardState(convexUser._id, state)
      if (success) {
        const updatedSession = await SessionManager.getSession(convexUser._id)
        setSession(updatedSession)
      }
    } catch (error) {
      console.error('Error updating dashboard state:', error)
    }
  }, [convexUser])

  const recordActivity = useCallback(async (
    type: keyof UserSession['recentActivity'], 
    value: number | string
  ) => {
    if (!convexUser) return

    try {
      await SessionManager.recordActivity(convexUser._id, type, value)
      const updatedSession = await SessionManager.getSession(convexUser._id)
      setSession(updatedSession)
    } catch (error) {
      console.error('Error recording activity:', error)
    }
  }, [convexUser])

  const extendSession = useCallback(async () => {
    if (!convexUser) return

    try {
      const success = await SessionManager.extendSession(convexUser._id)
      if (success) {
        const updatedSession = await SessionManager.getSession(convexUser._id)
        setSession(updatedSession)
        setIsSessionActive(true)
      }
    } catch (error) {
      console.error('Error extending session:', error)
    }
  }, [convexUser])

  const destroySession = useCallback(async () => {
    if (!convexUser) return

    try {
      await SessionManager.destroySession(convexUser._id)
      setSession(null)
      setIsSessionActive(false)
    } catch (error) {
      console.error('Error destroying session:', error)
    }
  }, [convexUser])

  return {
    session,
    isLoading,
    updatePreferences,
    updateDashboardState,
    recordActivity,
    extendSession,
    destroySession,
    isSessionActive,
  }
}

/**
 * Hook for dashboard-specific session state
 */
export function useDashboardSession() {
  const { session, updateDashboardState, isLoading } = useSession()

  const updateActiveTab = useCallback((tab: string) => {
    updateDashboardState({ activeTab: tab })
  }, [updateDashboardState])

  const updateFilters = useCallback((filters: Record<string, any>) => {
    updateDashboardState({ filters })
  }, [updateDashboardState])

  const updateSidebarState = useCallback((collapsed: boolean) => {
    updateDashboardState({ sidebarCollapsed: collapsed })
  }, [updateDashboardState])

  return {
    dashboardState: session?.dashboardState,
    isLoading,
    updateActiveTab,
    updateFilters,
    updateSidebarState,
  }
}

/**
 * Hook for user preferences with session persistence
 */
export function useUserPreferences() {
  const { session, updatePreferences, isLoading } = useSession()

  const updateTheme = useCallback((theme: 'light' | 'dark') => {
    updatePreferences({ theme })
  }, [updatePreferences])

  const updateLanguage = useCallback((language: string) => {
    updatePreferences({ language })
  }, [updatePreferences])

  const updateTimezone = useCallback((timezone: string) => {
    updatePreferences({ timezone })
  }, [updatePreferences])

  const updateDashboardLayout = useCallback((layout: Record<string, any>) => {
    updatePreferences({ dashboardLayout: layout })
  }, [updatePreferences])

  return {
    preferences: session?.preferences,
    isLoading,
    updateTheme,
    updateLanguage,
    updateTimezone,
    updateDashboardLayout,
  }
}
