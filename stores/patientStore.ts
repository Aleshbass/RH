import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { Id } from '@/convex/_generated/dataModel'

// Types
export interface Patient {
  _id: Id<"users">
  firstName?: string
  lastName?: string
  email?: string
  phoneNumber?: string
  imageUrl?: string
  relationship?: {
    physiotherapistId: Id<"users">
    clinicId?: Id<"clinics">
    status: 'active' | 'inactive' | 'discharged'
    assignedAt: number
  }
  profile?: {
    dateOfBirth?: number
    gender?: string
    address?: string
    emergencyContact?: {
      name: string
      phone: string
      relationship: string
    }
    medicalHistory?: string[]
    currentConditions?: string[]
    allergies?: string[]
    medications?: string[]
    insuranceInfo?: {
      provider: string
      policyNumber: string
    }
  } | null
  stats?: {
    totalAppointments: number
    completedSessions: number
    upcomingAppointments: number
    lastVisit?: number
    nextAppointment?: number
  }
}

export interface PatientFilters {
  searchTerm: string
  status: 'all' | 'active' | 'inactive' | 'discharged'
  sortBy: 'name' | 'lastVisit' | 'nextAppointment' | 'joinedDate'
  sortOrder: 'asc' | 'desc'
  dateRange?: {
    start: number
    end: number
  }
  conditions?: string[]
  assignedTo?: Id<"users"> // For clinic owners to filter by physiotherapist
}

export interface PatientStats {
  totalPatients: number
  activePatients: number
  newPatientsThisMonth: number
  dischargedPatients: number
  averageSessionsPerPatient: number
  patientRetentionRate: number
}

// Store interface
interface PatientState {
  // Data
  patients: Patient[]
  selectedPatient: Patient | null
  patientStats: PatientStats | null
  
  // Filters and search
  filters: PatientFilters
  
  // UI State
  viewMode: 'grid' | 'list'
  selectedPatients: Id<"users">[] // For bulk operations
  
  // Loading states
  isLoadingPatients: boolean
  isLoadingStats: boolean
  isLoadingPatientDetails: boolean
  
  // Actions
  setPatients: (patients: Patient[]) => void
  setSelectedPatient: (patient: Patient | null) => void
  setPatientStats: (stats: PatientStats) => void
  
  // Patient management
  addPatient: (patient: Patient) => void
  updatePatient: (id: Id<"users">, updates: Partial<Patient>) => void
  removePatient: (id: Id<"users">) => void
  
  // Selection
  selectPatients: (ids: Id<"users">[]) => void
  togglePatientSelection: (id: Id<"users">) => void
  clearSelection: () => void
  
  // Filters and search
  setSearchTerm: (term: string) => void
  setStatusFilter: (status: PatientFilters['status']) => void
  setSortBy: (sortBy: PatientFilters['sortBy']) => void
  setSortOrder: (order: PatientFilters['sortOrder']) => void
  setDateRange: (range: PatientFilters['dateRange']) => void
  setConditionFilter: (conditions: string[]) => void
  setAssignedToFilter: (physiotherapistId: Id<"users"> | undefined) => void
  resetFilters: () => void
  
  // UI state
  setViewMode: (mode: 'grid' | 'list') => void
  
  // Loading states
  setLoadingPatients: (loading: boolean) => void
  setLoadingStats: (loading: boolean) => void
  setLoadingPatientDetails: (loading: boolean) => void
  
  // Computed properties
  filteredPatients: Patient[]
  selectedPatientsCount: number
  hasActiveFilters: boolean
  
  // Reset
  reset: () => void
}

const defaultFilters: PatientFilters = {
  searchTerm: '',
  status: 'all',
  sortBy: 'name',
  sortOrder: 'asc',
  dateRange: undefined,
  conditions: undefined,
  assignedTo: undefined,
}

export const usePatientStore = create<PatientState>()(
  persist(
    immer((set, get) => ({
      // Initial state
      patients: [],
      selectedPatient: null,
      patientStats: null,
      filters: defaultFilters,
      viewMode: 'list',
      selectedPatients: [],
      isLoadingPatients: false,
      isLoadingStats: false,
      isLoadingPatientDetails: false,

      // Actions
      setPatients: (patients) => set((state) => {
        state.patients = patients
      }),

      setSelectedPatient: (patient) => set((state) => {
        state.selectedPatient = patient
      }),

      setPatientStats: (stats) => set((state) => {
        state.patientStats = stats
      }),

      // Patient management
      addPatient: (patient) => set((state) => {
        state.patients.push(patient)
      }),

      updatePatient: (id, updates) => set((state) => {
        const index = state.patients.findIndex(p => p._id === id)
        if (index !== -1) {
          Object.assign(state.patients[index], updates)
        }
        // Update selected patient if it's the same one
        if (state.selectedPatient?._id === id) {
          Object.assign(state.selectedPatient, updates)
        }
      }),

      removePatient: (id) => set((state) => {
        state.patients = state.patients.filter(p => p._id !== id)
        if (state.selectedPatient?._id === id) {
          state.selectedPatient = null
        }
        state.selectedPatients = state.selectedPatients.filter(pid => pid !== id)
      }),

      // Selection
      selectPatients: (ids) => set((state) => {
        state.selectedPatients = ids
      }),

      togglePatientSelection: (id) => set((state) => {
        const index = state.selectedPatients.indexOf(id)
        if (index > -1) {
          state.selectedPatients.splice(index, 1)
        } else {
          state.selectedPatients.push(id)
        }
      }),

      clearSelection: () => set((state) => {
        state.selectedPatients = []
      }),

      // Filters and search
      setSearchTerm: (term) => set((state) => {
        state.filters.searchTerm = term
      }),

      setStatusFilter: (status) => set((state) => {
        state.filters.status = status
      }),

      setSortBy: (sortBy) => set((state) => {
        state.filters.sortBy = sortBy
      }),

      setSortOrder: (order) => set((state) => {
        state.filters.sortOrder = order
      }),

      setDateRange: (range) => set((state) => {
        state.filters.dateRange = range
      }),

      setConditionFilter: (conditions) => set((state) => {
        state.filters.conditions = conditions
      }),

      setAssignedToFilter: (physiotherapistId) => set((state) => {
        state.filters.assignedTo = physiotherapistId
      }),

      resetFilters: () => set((state) => {
        state.filters = { ...defaultFilters }
      }),

      // UI state
      setViewMode: (mode) => set((state) => {
        state.viewMode = mode
      }),

      // Loading states
      setLoadingPatients: (loading) => set((state) => {
        state.isLoadingPatients = loading
      }),

      setLoadingStats: (loading) => set((state) => {
        state.isLoadingStats = loading
      }),

      setLoadingPatientDetails: (loading) => set((state) => {
        state.isLoadingPatientDetails = loading
      }),

      // Computed properties
      get filteredPatients() {
        const { patients, filters } = get()
        let filtered = [...patients]

        // Search filter
        if (filters.searchTerm) {
          const searchLower = filters.searchTerm.toLowerCase()
          filtered = filtered.filter(patient =>
            patient.firstName?.toLowerCase().includes(searchLower) ||
            patient.lastName?.toLowerCase().includes(searchLower) ||
            patient.email?.toLowerCase().includes(searchLower) ||
            patient.phoneNumber?.includes(filters.searchTerm)
          )
        }

        // Status filter
        if (filters.status !== 'all') {
          filtered = filtered.filter(patient =>
            patient.relationship?.status === filters.status
          )
        }

        // Assigned to filter (for clinic owners)
        if (filters.assignedTo) {
          filtered = filtered.filter(patient =>
            patient.relationship?.physiotherapistId === filters.assignedTo
          )
        }

        // Condition filter
        if (filters.conditions && filters.conditions.length > 0) {
          filtered = filtered.filter(patient =>
            filters.conditions!.some(condition =>
              patient.profile?.currentConditions?.includes(condition)
            )
          )
        }

        // Date range filter
        if (filters.dateRange) {
          filtered = filtered.filter(patient => {
            const lastVisit = patient.stats?.lastVisit
            if (!lastVisit) return false
            return lastVisit >= filters.dateRange!.start && lastVisit <= filters.dateRange!.end
          })
        }

        // Sorting
        filtered.sort((a, b) => {
          let aValue: any, bValue: any

          switch (filters.sortBy) {
            case 'name':
              aValue = `${a.firstName || ''} ${a.lastName || ''}`.trim()
              bValue = `${b.firstName || ''} ${b.lastName || ''}`.trim()
              break
            case 'lastVisit':
              aValue = a.stats?.lastVisit || 0
              bValue = b.stats?.lastVisit || 0
              break
            case 'nextAppointment':
              aValue = a.stats?.nextAppointment || 0
              bValue = b.stats?.nextAppointment || 0
              break
            case 'joinedDate':
              aValue = a.relationship?.assignedAt || 0
              bValue = b.relationship?.assignedAt || 0
              break
            default:
              return 0
          }

          if (typeof aValue === 'string') {
            const comparison = aValue.localeCompare(bValue)
            return filters.sortOrder === 'asc' ? comparison : -comparison
          } else {
            const comparison = aValue - bValue
            return filters.sortOrder === 'asc' ? comparison : -comparison
          }
        })

        return filtered
      },

      get selectedPatientsCount() {
        return get().selectedPatients.length
      },

      get hasActiveFilters() {
        const { filters } = get()
        return (
          filters.searchTerm !== '' ||
          filters.status !== 'all' ||
          filters.dateRange !== undefined ||
          (filters.conditions && filters.conditions.length > 0) ||
          filters.assignedTo !== undefined
        )
      },

      reset: () => set((state) => {
        state.patients = []
        state.selectedPatient = null
        state.patientStats = null
        state.filters = { ...defaultFilters }
        state.selectedPatients = []
        state.isLoadingPatients = false
        state.isLoadingStats = false
        state.isLoadingPatientDetails = false
      }),
    })),
    {
      name: 'patient-store',
      partialize: (state) => ({
        filters: state.filters,
        viewMode: state.viewMode,
      }),
    }
  )
) 