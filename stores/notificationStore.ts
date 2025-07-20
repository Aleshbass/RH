import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { Id } from '@/convex/_generated/dataModel'

// Types
export type NotificationType = 
  | 'appointment_reminder'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'new_patient_assignment'
  | 'session_completed'
  | 'invoice_generated'
  | 'payment_received'
  | 'staff_invitation'
  | 'approval_required'
  | 'system_alert'
  | 'message_received'

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Notification {
  _id: Id<"notifications">
  userId: Id<"users">
  type: NotificationType
  title: string
  message: string
  priority?: NotificationPriority
  isRead: boolean
  createdAt: number
  readAt?: number
  data?: {
    entityId?: string
    entityType?: string
    actionUrl?: string
    metadata?: Record<string, any>
  }
  expiresAt?: number
}

export interface NotificationFilters {
  type: NotificationType | 'all'
  priority: NotificationPriority | 'all'
  isRead: boolean | 'all'
  dateRange?: {
    start: number
    end: number
  }
}

export interface NotificationSettings {
  email: {
    enabled: boolean
    types: NotificationType[]
    frequency: 'immediate' | 'daily' | 'weekly'
  }
  push: {
    enabled: boolean
    types: NotificationType[]
  }
  inApp: {
    enabled: boolean
    types: NotificationType[]
    showBadge: boolean
    playSound: boolean
  }
  doNotDisturb: {
    enabled: boolean
    startTime: string // "22:00"
    endTime: string   // "08:00"
  }
}

export interface NotificationStats {
  total: number
  unread: number
  todayCount: number
  thisWeekCount: number
  byType: Record<NotificationType, number>
  byPriority: Record<NotificationPriority, number>
}

// Store interface
interface NotificationState {
  // Data
  notifications: Notification[]
  notificationStats: NotificationStats | null
  settings: NotificationSettings | null
  
  // Filters and UI
  filters: NotificationFilters
  selectedNotifications: Id<"notifications">[]
  
  // UI State
  isNotificationPanelOpen: boolean
  activeNotification: Notification | null
  showOnlyUnread: boolean
  
  // Loading states
  isLoadingNotifications: boolean
  isLoadingStats: boolean
  isUpdatingSettings: boolean
  isMarkingAsRead: boolean
  
  // Actions - Data Management
  setNotifications: (notifications: Notification[]) => void
  setNotificationStats: (stats: NotificationStats) => void
  setSettings: (settings: NotificationSettings) => void
  
  // Actions - Notification Management
  addNotification: (notification: Notification) => void
  updateNotification: (id: Id<"notifications">, updates: Partial<Notification>) => void
  removeNotification: (id: Id<"notifications">) => void
  markAsRead: (id: Id<"notifications">) => void
  markAsUnread: (id: Id<"notifications">) => void
  markAllAsRead: () => void
  deleteNotification: (id: Id<"notifications">) => void
  deleteAllRead: () => void
  
  // Actions - Bulk Operations
  selectNotification: (id: Id<"notifications">) => void
  selectAllNotifications: () => void
  clearSelection: () => void
  markSelectedAsRead: () => void
  deleteSelected: () => void
  
  // Actions - Filters
  setTypeFilter: (type: NotificationType | 'all') => void
  setPriorityFilter: (priority: NotificationPriority | 'all') => void
  setReadFilter: (isRead: boolean | 'all') => void
  setDateRangeFilter: (range: NotificationFilters['dateRange']) => void
  resetFilters: () => void
  
  // Actions - UI State
  openNotificationPanel: () => void
  closeNotificationPanel: () => void
  toggleNotificationPanel: () => void
  setActiveNotification: (notification: Notification | null) => void
  toggleShowOnlyUnread: () => void
  
  // Actions - Settings
  updateEmailSettings: (settings: Partial<NotificationSettings['email']>) => void
  updatePushSettings: (settings: Partial<NotificationSettings['push']>) => void
  updateInAppSettings: (settings: Partial<NotificationSettings['inApp']>) => void
  updateDoNotDisturbSettings: (settings: Partial<NotificationSettings['doNotDisturb']>) => void
  
  // Actions - Loading States
  setLoadingNotifications: (loading: boolean) => void
  setLoadingStats: (loading: boolean) => void
  setUpdatingSettings: (updating: boolean) => void
  setMarkingAsRead: (marking: boolean) => void
  
  // Computed Properties
  filteredNotifications: Notification[]
  unreadCount: number
  urgentCount: number
  todaysNotifications: Notification[]
  recentNotifications: Notification[]
  hasUnreadUrgent: boolean
  
  // Reset
  reset: () => void
}

const defaultFilters: NotificationFilters = {
  type: 'all',
  priority: 'all',
  isRead: 'all'
}

const defaultSettings: NotificationSettings = {
  email: {
    enabled: true,
    types: ['appointment_reminder', 'appointment_cancelled', 'new_patient_assignment'],
    frequency: 'immediate'
  },
  push: {
    enabled: true,
    types: ['appointment_reminder', 'appointment_cancelled', 'message_received']
  },
  inApp: {
    enabled: true,
    types: ['appointment_reminder', 'appointment_cancelled', 'appointment_rescheduled', 'new_patient_assignment', 'session_completed', 'invoice_generated', 'payment_received', 'staff_invitation', 'approval_required', 'system_alert', 'message_received'],
    showBadge: true,
    playSound: true
  },
  doNotDisturb: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00'
  }
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    immer((set, get) => ({
      // Initial state
      notifications: [],
      notificationStats: null,
      settings: defaultSettings,
      filters: defaultFilters,
      selectedNotifications: [],
      isNotificationPanelOpen: false,
      activeNotification: null,
      showOnlyUnread: false,
      isLoadingNotifications: false,
      isLoadingStats: false,
      isUpdatingSettings: false,
      isMarkingAsRead: false,

      // Data Management
      setNotifications: (notifications) => set((state) => {
        state.notifications = notifications
      }),

      setNotificationStats: (stats) => set((state) => {
        state.notificationStats = stats
      }),

      setSettings: (settings) => set((state) => {
        state.settings = settings
      }),

      // Notification Management
      addNotification: (notification) => set((state) => {
        // Add to beginning for chronological order
        state.notifications.unshift(notification)
        
        // Limit to 100 notifications to prevent memory issues
        if (state.notifications.length > 100) {
          state.notifications = state.notifications.slice(0, 100)
        }
      }),

      updateNotification: (id, updates) => set((state) => {
        const index = state.notifications.findIndex(n => n._id === id)
        if (index !== -1) {
          Object.assign(state.notifications[index], updates)
        }
      }),

      removeNotification: (id) => set((state) => {
        state.notifications = state.notifications.filter(n => n._id !== id)
        state.selectedNotifications = state.selectedNotifications.filter(nId => nId !== id)
        if (state.activeNotification?._id === id) {
          state.activeNotification = null
        }
      }),

      markAsRead: (id) => set((state) => {
        const index = state.notifications.findIndex(n => n._id === id)
        if (index !== -1) {
          state.notifications[index].isRead = true
          state.notifications[index].readAt = Date.now()
        }
      }),

      markAsUnread: (id) => set((state) => {
        const index = state.notifications.findIndex(n => n._id === id)
        if (index !== -1) {
          state.notifications[index].isRead = false
          state.notifications[index].readAt = undefined
        }
      }),

      markAllAsRead: () => set((state) => {
        const now = Date.now()
        state.notifications.forEach(notification => {
          if (!notification.isRead) {
            notification.isRead = true
            notification.readAt = now
          }
        })
      }),

      deleteNotification: (id) => set((state) => {
        state.notifications = state.notifications.filter(n => n._id !== id)
        state.selectedNotifications = state.selectedNotifications.filter(nId => nId !== id)
      }),

      deleteAllRead: () => set((state) => {
        state.notifications = state.notifications.filter(n => !n.isRead)
        state.selectedNotifications = []
      }),

      // Bulk Operations
      selectNotification: (id) => set((state) => {
        const index = state.selectedNotifications.indexOf(id)
        if (index > -1) {
          state.selectedNotifications.splice(index, 1)
        } else {
          state.selectedNotifications.push(id)
        }
      }),

      selectAllNotifications: () => set((state) => {
        state.selectedNotifications = get().filteredNotifications.map(n => n._id)
      }),

      clearSelection: () => set((state) => {
        state.selectedNotifications = []
      }),

      markSelectedAsRead: () => set((state) => {
        const now = Date.now()
        state.selectedNotifications.forEach(id => {
          const index = state.notifications.findIndex(n => n._id === id)
          if (index !== -1) {
            state.notifications[index].isRead = true
            state.notifications[index].readAt = now
          }
        })
        state.selectedNotifications = []
      }),

      deleteSelected: () => set((state) => {
        state.notifications = state.notifications.filter(n => 
          !state.selectedNotifications.includes(n._id)
        )
        state.selectedNotifications = []
      }),

      // Filters
      setTypeFilter: (type) => set((state) => {
        state.filters.type = type
      }),

      setPriorityFilter: (priority) => set((state) => {
        state.filters.priority = priority
      }),

      setReadFilter: (isRead) => set((state) => {
        state.filters.isRead = isRead
      }),

      setDateRangeFilter: (range) => set((state) => {
        state.filters.dateRange = range
      }),

      resetFilters: () => set((state) => {
        state.filters = { ...defaultFilters }
      }),

      // UI State
      openNotificationPanel: () => set((state) => {
        state.isNotificationPanelOpen = true
      }),

      closeNotificationPanel: () => set((state) => {
        state.isNotificationPanelOpen = false
      }),

      toggleNotificationPanel: () => set((state) => {
        state.isNotificationPanelOpen = !state.isNotificationPanelOpen
      }),

      setActiveNotification: (notification) => set((state) => {
        state.activeNotification = notification
      }),

      toggleShowOnlyUnread: () => set((state) => {
        state.showOnlyUnread = !state.showOnlyUnread
      }),

      // Settings
      updateEmailSettings: (settings) => set((state) => {
        if (state.settings) {
          Object.assign(state.settings.email, settings)
        }
      }),

      updatePushSettings: (settings) => set((state) => {
        if (state.settings) {
          Object.assign(state.settings.push, settings)
        }
      }),

      updateInAppSettings: (settings) => set((state) => {
        if (state.settings) {
          Object.assign(state.settings.inApp, settings)
        }
      }),

      updateDoNotDisturbSettings: (settings) => set((state) => {
        if (state.settings) {
          Object.assign(state.settings.doNotDisturb, settings)
        }
      }),

      // Loading States
      setLoadingNotifications: (loading) => set((state) => {
        state.isLoadingNotifications = loading
      }),

      setLoadingStats: (loading) => set((state) => {
        state.isLoadingStats = loading
      }),

      setUpdatingSettings: (updating) => set((state) => {
        state.isUpdatingSettings = updating
      }),

      setMarkingAsRead: (marking) => set((state) => {
        state.isMarkingAsRead = marking
      }),

      // Computed Properties
      get filteredNotifications() {
        const { notifications, filters, showOnlyUnread } = get()
        let filtered = [...notifications]

        // Show only unread filter
        if (showOnlyUnread) {
          filtered = filtered.filter(n => !n.isRead)
        }

        // Type filter
        if (filters.type !== 'all') {
          filtered = filtered.filter(n => n.type === filters.type)
        }

        // Priority filter
        if (filters.priority !== 'all') {
          filtered = filtered.filter(n => (n.priority || 'medium') === filters.priority)
        }

        // Read status filter
        if (filters.isRead !== 'all') {
          filtered = filtered.filter(n => n.isRead === filters.isRead)
        }

        // Date range filter
        if (filters.dateRange) {
          filtered = filtered.filter(n => 
            n.createdAt >= filters.dateRange!.start && 
            n.createdAt <= filters.dateRange!.end
          )
        }

        // Sort by creation time (newest first)
        return filtered.sort((a, b) => b.createdAt - a.createdAt)
      },

      get unreadCount() {
        return get().notifications.filter(n => !n.isRead).length
      },

      get urgentCount() {
        return get().notifications.filter(n => (n.priority || 'medium') === 'urgent' && !n.isRead).length
      },

      get todaysNotifications() {
        const today = new Date()
        const startOfDay = new Date(today.setHours(0, 0, 0, 0)).getTime()
        const endOfDay = new Date(today.setHours(23, 59, 59, 999)).getTime()
        
        return get().notifications.filter(n => 
          n.createdAt >= startOfDay && n.createdAt <= endOfDay
        ).sort((a, b) => b.createdAt - a.createdAt)
      },

      get recentNotifications() {
        return get().notifications
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 10)
      },

      get hasUnreadUrgent() {
        return get().notifications.some(n => (n.priority || 'medium') === 'urgent' && !n.isRead)
      },

      reset: () => set((state) => {
        state.notifications = []
        state.notificationStats = null
        state.settings = { ...defaultSettings }
        state.filters = { ...defaultFilters }
        state.selectedNotifications = []
        state.isNotificationPanelOpen = false
        state.activeNotification = null
        state.showOnlyUnread = false
        state.isLoadingNotifications = false
        state.isLoadingStats = false
        state.isUpdatingSettings = false
        state.isMarkingAsRead = false
      }),
    })),
    {
      name: 'notification-store',
      partialize: (state) => ({
        settings: state.settings,
        filters: state.filters,
        showOnlyUnread: state.showOnlyUnread,
        isNotificationPanelOpen: state.isNotificationPanelOpen,
      }),
    }
  )
) 