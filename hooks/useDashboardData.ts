import { api } from '@/convex/_generated/api'
import { useConvexQuery } from './useConvexQuery'

/**
 * Hook for dashboard statistics with smart caching
 */
export function useDashboardStats() {
  return useConvexQuery(
    api.patients.getDashboardStats,
    {},
    {
      staleTime: 2 * 60 * 1000, // 2 minutes - stats change frequently
      gcTime: 10 * 60 * 1000, // 10 minutes (gcTime replaces cacheTime in v5)
      refetchOnWindowFocus: true, // Refetch stats when user returns
    }
  )
}

/**
 * Hook for user's patients with search and pagination
 */
export function useMyPatients(searchTerm?: string, limit?: number) {
  return useConvexQuery(
    api.patients.getMyPatients,
    { searchTerm, limit },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
      placeholderData: (previousData) => previousData, // Keep previous data while fetching new
    }
  )
}

/**
 * Hook for appointments with filtering
 */
export function useMyAppointments(filters?: {
  startDate?: number
  endDate?: number
  status?: string
  limit?: number
}) {
  return useConvexQuery(
    api.appointments.getMyAppointments,
    filters,
    {
      staleTime: 30 * 1000, // 30 seconds - appointments change frequently
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: true,
    }
  )
}

/**
 * Hook for user profile data
 */
export function useMyUser() {
  return useConvexQuery(
    api.users.getMyUser,
    {},
    {
      staleTime: 10 * 60 * 1000, // 10 minutes - user data doesn't change often
      gcTime: 30 * 60 * 1000, // 30 minutes
    }
  )
}

/**
 * Hook for approval status
 */
export function useMyApprovalStatus() {
  return useConvexQuery(
    api.users.getUserApprovalStatus,
    {},
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
      refetchOnWindowFocus: true,
    }
  )
}

/**
 * Hook for clinic data
 */
export function useMyClinic() {
  return useConvexQuery(
    api.clinics.getMyClinic,
    {},
    {
      staleTime: 15 * 60 * 1000, // 15 minutes - clinic data changes infrequently
      gcTime: 60 * 60 * 1000, // 1 hour
    }
  )
}

/**
 * Hook for clinic staff and invitations
 */
export function useClinicStaff() {
  return useConvexQuery(
    api.clinics.getClinicStaff,
    {},
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
    }
  )
}

/**
 * Hook for clinic invitations
 */
export function useClinicInvitations() {
  return useConvexQuery(
    api.clinics.getClinicInvitations,
    {},
    {
      staleTime: 2 * 60 * 1000, // 2 minutes - invitations change frequently
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: true,
    }
  )
}

/**
 * Hook for notifications
 */
export function useMyNotifications(limit?: number) {
  return useConvexQuery(
    api.notifications.getMyNotifications,
    { limit },
    {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
      refetchInterval: 60 * 1000,
    }
  )
}

/**
 * Hook for unread notification count
 */
export function useUnreadNotificationCount() {
  return useConvexQuery(
    api.notifications.getMyUnreadCount,
    {},
    {
      staleTime: 30 * 1000,
      gcTime: 2 * 60 * 1000,
      refetchOnWindowFocus: true,
      refetchInterval: 30 * 1000,
    }
  )
}

/**
 * Hook for session logs
 */
export function useMySessionLogs(limit?: number) {
  return useConvexQuery(
    api.sessionLogs.getMySessionLogs,
    { limit },
    {
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    }
  )
}

/**
 * Hook for patient details by ID
 */
export function usePatientDetails(patientId?: string) {
  return useConvexQuery(
    api.patients.getPatientDetails,
    { patientId },
    {
      enabled: !!patientId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
    }
  )
}

/**
 * Hook for patient care team (patient only)
 */
export function usePatientCareTeam() {
  return useConvexQuery(
    api.patients.getPatientCareTeam,
    {},
    {
      staleTime: 10 * 60 * 1000, // 10 minutes - care team doesn't change often
      gcTime: 30 * 60 * 1000, // 30 minutes
    }
  )
}

/**
 * Hook for all users (admin only)
 */
export function useAllUsers() {
  return useConvexQuery(
    api.users.getAllUsers,
    {},
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
    }
  )
}

/**
 * Hook for pending approvals (admin only)
 */
export function usePendingApprovals() {
  return useConvexQuery(
    api.accountApproval.getPendingApprovals,
    {},
    {
      staleTime: 1 * 60 * 1000, // 1 minute - approvals are time-sensitive
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: true,
    }
  )
}

/**
 * Hook for clinic dashboard statistics (clinic owner only)
 */
export function useClinicDashboardStats() {
  return useConvexQuery(
    api.clinics.getClinicDashboardStats,
    {},
    {
      staleTime: 2 * 60 * 1000, // 2 minutes - stats change frequently
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: true,
    }
  )
}

/**
 * Hook for clinic revenue analytics (clinic owner only)
 */
export function useClinicRevenue() {
  return useConvexQuery(
    api.clinics.getClinicRevenue,
    {},
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
      refetchOnWindowFocus: true,
    }
  )
}

/**
 * Hook for clinic performance metrics (clinic owner only)
 */
export function useClinicPerformanceMetrics() {
  return useConvexQuery(
    api.clinics.getClinicPerformanceMetrics,
    {},
    {
      staleTime: 10 * 60 * 1000, // 10 minutes - metrics don't change often
      gcTime: 30 * 60 * 1000, // 30 minutes
    }
  )
}

/**
 * Hook for clinic recent activity (clinic owner only)
 */
export function useClinicRecentActivity(limit?: number) {
  return useConvexQuery(
    api.clinics.getClinicRecentActivity,
    { limit },
    {
      staleTime: 1 * 60 * 1000, // 1 minute - activity changes frequently
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: true,
      refetchInterval: 60 * 1000, // Refetch every minute for real-time feel
    }
  )
}

/**
 * Hook for patient dashboard statistics (patient only)
 */
export function usePatientDashboardStats() {
  return useConvexQuery(
    api.patients.getPatientDashboardStats,
    {},
    {
      staleTime: 2 * 60 * 1000, // 2 minutes - stats change frequently
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: true,
    }
  )
}

/**
 * Hook for patient recent activity (patient only)
 */
export function usePatientRecentActivity(limit?: number) {
  return useConvexQuery(
    api.patients.getPatientRecentActivity,
    { limit },
    {
      staleTime: 1 * 60 * 1000, // 1 minute - activity changes frequently
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: true,
      refetchInterval: 60 * 1000, // Refetch every minute for real-time feel
    }
  )
}

/**
 * Hook for patient health summary (patient only)
 */
export function usePatientHealthSummary() {
  return useConvexQuery(
    api.patients.getPatientHealthSummary,
    {},
    {
      staleTime: 5 * 60 * 1000, // 5 minutes - health data doesn't change often
      gcTime: 15 * 60 * 1000, // 15 minutes
    }
  )
}