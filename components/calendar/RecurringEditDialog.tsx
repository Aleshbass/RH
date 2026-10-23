'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar, CalendarDays, CalendarRange, Info } from '@/components/icons'

export type RecurringEditScope = 'instance' | 'future' | 'series'

interface RecurringEditDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (scope: RecurringEditScope) => void
  appointmentDate?: Date
  actionType: 'move' | 'resize'
}

export function RecurringEditDialog({
  isOpen,
  onClose,
  onConfirm,
  appointmentDate,
  actionType = 'move'
}: RecurringEditDialogProps) {
  const actionText = actionType === 'move' ? 'reschedule' : 'change duration of'
  const appointmentDateStr = appointmentDate 
    ? appointmentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'this appointment'

  const handleChoice = (scope: RecurringEditScope) => {
    onConfirm(scope)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-blue-600" />
            Edit Recurring Appointment
          </DialogTitle>
          <DialogDescription className="pt-2">
            This is part of a recurring series. How would you like to {actionText} it?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {/* This instance only */}
          <button
            onClick={() => handleChoice('instance')}
            className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all group"
          >
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-gray-600 group-hover:text-blue-600 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-gray-900 group-hover:text-blue-900">
                  This appointment only
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {actionType === 'move' ? 'Reschedule' : 'Change'} only the appointment on {appointmentDateStr}
                </div>
              </div>
            </div>
          </button>

          {/* This and future appointments */}
          <button
            onClick={() => handleChoice('future')}
            className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-purple-500 hover:bg-purple-50 transition-all group"
          >
            <div className="flex items-start gap-3">
              <CalendarRange className="h-5 w-5 text-gray-600 group-hover:text-purple-600 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-gray-900 group-hover:text-purple-900">
                  This and future appointments
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {actionType === 'move' ? 'Reschedule' : 'Change'} this appointment and all following occurrences
                </div>
              </div>
            </div>
          </button>

          {/* All appointments in series */}
          <button
            onClick={() => handleChoice('series')}
            className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-green-500 hover:bg-green-50 transition-all group"
          >
            <div className="flex items-start gap-3">
              <CalendarDays className="h-5 w-5 text-gray-600 group-hover:text-green-600 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-gray-900 group-hover:text-green-900">
                  All appointments in series
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {actionType === 'move' ? 'Reschedule' : 'Change'} every appointment in this recurring series
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-800">
            <strong>Note:</strong> All affected appointments will be updated, and patients will be notified via email.
          </p>
        </div>

        <DialogFooter className="sm:justify-start">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
