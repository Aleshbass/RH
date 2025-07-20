import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { Id } from '@/convex/_generated/dataModel'

export interface User {
  _id: Id<"users">
  _creationTime: number
  email?: string
  firstName?: string
  lastName?: string
  imageUrl?: string
  phoneNumber?: string
  clerkId: string
  role: "physiotherapist" | "clinic_owner" | "patient" | "family_member" | "admin"
  onboarded: boolean
  physiotherapistProfileId?: Id<"physiotherapistProfiles">
  patientProfileId?: Id<"patientProfiles">
  // Note: clinicOwnerProfiles table doesn't exist yet, using clinics table instead
}

export interface ApprovalStatus {
  _id: Id<"accountApprovalStatus">
  userId: Id<"users">
  status: "pending" | "approved" | "rejected"
  submittedAt: number
  reviewedAt?: number
  reviewedBy?: Id<"users">
  rejectionReason?: string
  notes?: string
}

interface AuthState {
  // State
  user: User | null
  approvalStatus: ApprovalStatus | null
  isLoading: boolean
  error: string | null
  
  // Actions
  setUser: (user: User | null) => void
  setApprovalStatus: (status: ApprovalStatus | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearAuth: () => void
  
  // Computed
  isAuthenticated: boolean
  isApproved: boolean
  needsApproval: boolean
  canAccessDashboard: boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    immer((set, get) => ({
      // Initial state
      user: null,
      approvalStatus: null,
      isLoading: false,
      error: null,
      
      // Actions
      setUser: (user) => set((state) => {
        state.user = user
        state.error = null
      }),
      
      setApprovalStatus: (status) => set((state) => {
        state.approvalStatus = status
      }),
      
      setLoading: (loading) => set((state) => {
        state.isLoading = loading
      }),
      
      setError: (error) => set((state) => {
        state.error = error
        state.isLoading = false
      }),
      
      clearAuth: () => set((state) => {
        state.user = null
        state.approvalStatus = null
        state.error = null
        state.isLoading = false
      }),
      
      // Computed getters
      get isAuthenticated() {
        return get().user !== null
      },
      
      get isApproved() {
        const { approvalStatus } = get()
        return approvalStatus?.status === 'approved'
      },
      
      get needsApproval() {
        const { user, approvalStatus } = get()
        if (!user) return false
        
        // Admin users don't need approval
        if (user.role === 'admin') return false
        
        // Check if approval is needed for this role
        const rolesNeedingApproval = ['physiotherapist', 'clinic_owner']
        if (!rolesNeedingApproval.includes(user.role)) return false
        
        return !approvalStatus || approvalStatus.status === 'pending'
      },
      
      get canAccessDashboard() {
        const { user, isApproved, needsApproval } = get()
        if (!user) return false
        
        // Admin can always access
        if (user.role === 'admin') return true
        
        // If approval is needed, must be approved
        if (needsApproval) return isApproved
        
        // Otherwise, can access
        return true
      }
    })),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        approvalStatus: state.approvalStatus,
      }),
    }
  )
) 