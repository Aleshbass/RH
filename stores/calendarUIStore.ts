import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent'

interface CalendarUIState {
  pinMode: boolean
  selectedColor: string | null
  selectedPriority: PriorityLevel | null
  // actions
  togglePinMode: () => void
  setSelectedColor: (color: string | null) => void
  setSelectedPriority: (priority: PriorityLevel | null) => void
  clearSelections: () => void
}

export const useCalendarUIStore = create<CalendarUIState>()(
  immer((set) => ({
    pinMode: false,
    selectedColor: null,
    selectedPriority: null,
    togglePinMode: () => set((s) => { s.pinMode = !s.pinMode }),
    setSelectedColor: (color) => set((s) => { s.selectedColor = color; s.selectedPriority = null; s.pinMode = false }),
    setSelectedPriority: (priority) => set((s) => { s.selectedPriority = priority; s.selectedColor = null; s.pinMode = false }),
    clearSelections: () => set((s) => { s.selectedColor = null; s.selectedPriority = null; s.pinMode = false }),
  }))
) 