import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { Id } from '@/convex/_generated/dataModel'

export interface DashboardStats {
  totalPatients: number
  todaysAppointments: number
  upcomingAppointments: number
  completedSessionsThisWeek: number
  pendingInvitations: number
}

export interface DashboardFilters {
  dateRange: 'week' | 'month' | 'quarter'
  appointmentStatus: 'all' | 'scheduled' | 'confirmed' | 'completed' | 'cancelled'
  searchTerm: string
}

interface DashboardState {
  // UI State
  activeTab: string
  sidebarCollapsed: boolean
  
  // Filters
  filters: DashboardFilters
  
  // Cached Data (with timestamps for invalidation)
  cachedStats: {
    data: DashboardStats | null
    timestamp: number | null
  }
  
  // Actions
  setActiveTab: (tab: string) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  updateFilters: (filters: Partial<DashboardFilters>) => void
  setCachedStats: (stats: DashboardStats) => void
  clearCache: () => void
  
  // Utilities
  isStatsExpired: (maxAge?: number) => boolean
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    immer((set, get) => ({
      // Initial state
      activeTab: 'overview',
      sidebarCollapsed: false,
      
      filters: {
        dateRange: 'month',
        appointmentStatus: 'all',
        searchTerm: '',
      },
      
      cachedStats: {
        data: null,
        timestamp: null,
      },
      
      // Actions
      setActiveTab: (tab) => set((state) => {
        state.activeTab = tab
      }),
      
      setSidebarCollapsed: (collapsed) => set((state) => {
        state.sidebarCollapsed = collapsed
      }),
      
      updateFilters: (newFilters) => set((state) => {
        state.filters = { ...state.filters, ...newFilters }
      }),
      
      setCachedStats: (stats) => set((state) => {
        state.cachedStats = {
          data: stats,
          timestamp: Date.now(),
        }
      }),
      
      clearCache: () => set((state) => {
        state.cachedStats = {
          data: null,
          timestamp: null,
        }
      }),
      
      // Utilities
      isStatsExpired: (maxAge = 5 * 60 * 1000) => { // 5 minutes default
        const { cachedStats } = get()
        if (!cachedStats.timestamp) return true
        return Date.now() - cachedStats.timestamp > maxAge
      },
    })),
    {
      name: 'dashboard-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeTab: state.activeTab,
        sidebarCollapsed: state.sidebarCollapsed,
        filters: state.filters,
      }),
    }
  )
)