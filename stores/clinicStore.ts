import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { Id } from '@/convex/_generated/dataModel'

// Types
export interface Clinic {
  _id: Id<"clinics">
  name: string
  address?: string
  phoneNumber?: string
  email?: string
  website?: string
  description?: string
  specializations?: string[]
  operatingHours?: Record<string, string>
  ownerId: Id<"users">
}

export interface StaffMember {
  _id: Id<"users">
  firstName?: string
  lastName?: string
  email?: string
  role: string
  profileId?: string
  joinedAt?: number
  status: 'active' | 'inactive' | 'pending'
}

export interface ClinicInvitation {
  _id: Id<"clinicStaffInvitations">
  email: string
  role: string
  invitationCode: string
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  invitedAt: number
  expiresAt: number
  invitedBy: Id<"users">
}

// Store interface
interface ClinicState {
  // Data
  currentClinic: Clinic | null
  staff: StaffMember[]
  invitations: ClinicInvitation[]
  
  // UI State
  selectedStaffMember: StaffMember | null
  staffSearchTerm: string
  invitationFilter: 'all' | 'pending' | 'accepted' | 'declined' | 'expired'
  
  // Actions
  setCurrentClinic: (clinic: Clinic | null) => void
  setStaff: (staff: StaffMember[]) => void
  setInvitations: (invitations: ClinicInvitation[]) => void
  
  // Staff management
  selectStaffMember: (member: StaffMember | null) => void
  updateStaffMember: (id: Id<"users">, updates: Partial<StaffMember>) => void
  removeStaffMember: (id: Id<"users">) => void
  setStaffSearchTerm: (term: string) => void
  
  // Invitation management
  addInvitation: (invitation: ClinicInvitation) => void
  updateInvitation: (id: Id<"clinicStaffInvitations">, updates: Partial<ClinicInvitation>) => void
  removeInvitation: (id: Id<"clinicStaffInvitations">) => void
  setInvitationFilter: (filter: 'all' | 'pending' | 'accepted' | 'declined' | 'expired') => void
  
  // Computed properties
  pendingInvitationsCount: number
  activeStaffCount: number
  filteredInvitations: ClinicInvitation[]
  filteredStaff: StaffMember[]
  
  // Reset
  reset: () => void
}

export const useClinicStore = create<ClinicState>()(
  persist(
    immer((set, get) => ({
      // Initial state
      currentClinic: null,
      staff: [],
      invitations: [],
      selectedStaffMember: null,
      staffSearchTerm: '',
      invitationFilter: 'all',

      // Actions
      setCurrentClinic: (clinic) => set((state) => {
        state.currentClinic = clinic
      }),

      setStaff: (staff) => set((state) => {
        state.staff = staff
      }),

      setInvitations: (invitations) => set((state) => {
        state.invitations = invitations
      }),

      // Staff management
      selectStaffMember: (member) => set((state) => {
        state.selectedStaffMember = member
      }),

      updateStaffMember: (id, updates) => set((state) => {
        const index = state.staff.findIndex(member => member._id === id)
        if (index !== -1) {
          Object.assign(state.staff[index], updates)
        }
      }),

      removeStaffMember: (id) => set((state) => {
        state.staff = state.staff.filter(member => member._id !== id)
        if (state.selectedStaffMember?._id === id) {
          state.selectedStaffMember = null
        }
      }),

      setStaffSearchTerm: (term) => set((state) => {
        state.staffSearchTerm = term
      }),

      // Invitation management
      addInvitation: (invitation) => set((state) => {
        state.invitations.push(invitation)
      }),

      updateInvitation: (id, updates) => set((state) => {
        const index = state.invitations.findIndex(inv => inv._id === id)
        if (index !== -1) {
          Object.assign(state.invitations[index], updates)
        }
      }),

      removeInvitation: (id) => set((state) => {
        state.invitations = state.invitations.filter(inv => inv._id !== id)
      }),

      setInvitationFilter: (filter) => set((state) => {
        state.invitationFilter = filter
      }),

      // Computed properties
      get pendingInvitationsCount() {
        return get().invitations.filter(inv => inv.status === 'pending').length
      },

      get activeStaffCount() {
        return get().staff.filter(member => member.status === 'active').length
      },

      get filteredInvitations() {
        const { invitations, invitationFilter } = get()
        if (invitationFilter === 'all') return invitations
        return invitations.filter(inv => inv.status === invitationFilter)
      },

      get filteredStaff() {
        const { staff, staffSearchTerm } = get()
        if (!staffSearchTerm) return staff
        
        const searchLower = staffSearchTerm.toLowerCase()
        return staff.filter(member => 
          member.firstName?.toLowerCase().includes(searchLower) ||
          member.lastName?.toLowerCase().includes(searchLower) ||
          member.email?.toLowerCase().includes(searchLower) ||
          member.role.toLowerCase().includes(searchLower)
        )
      },

      reset: () => set((state) => {
        state.currentClinic = null
        state.staff = []
        state.invitations = []
        state.selectedStaffMember = null
        state.staffSearchTerm = ''
        state.invitationFilter = 'all'
      }),
    })),
    {
      name: 'clinic-store',
      partialize: (state) => ({
        currentClinic: state.currentClinic,
        staffSearchTerm: state.staffSearchTerm,
        invitationFilter: state.invitationFilter,
      }),
    }
  )
)