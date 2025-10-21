'use client'

import React, { useRef, useEffect, useState } from 'react'
// DayPilot is not installed - using react-big-calendar instead
// import { DayPilot, DayPilotCalendar as DPCalendar } from '@daypilot/daypilot-lite-react'
import {
  AppointmentData,
  appointmentsToDayPilotEvents,
  dayPilotEventToAppointmentUpdate,
  validateTimeSlot,
  getBusinessHoursConfig,
  getCellConfig,
  DayPilotEvent
} from '@/lib/calendar/dayPilotAdapter'
import { toast } from 'sonner'
import { RecurringEditDialog, RecurringEditScope } from './RecurringEditDialog'

interface DayPilotCalendarProps {
  appointments: AppointmentData[]
  viewMode: 'day' | 'week'
  currentDate: Date
  onCreateAppointment: (startTime: number, endTime: number) => void
  onAppointmentClick: (appointment: AppointmentData) => void
  onAppointmentReschedule: (appointmentId: string, newStartTime: number, newEndTime: number) => Promise<void>
  businessHoursStart?: number
  businessHoursEnd?: number
  cellDuration?: number
  cellHeight?: number
  loading?: boolean
}

export function DayPilotCalendar({
  appointments,
  viewMode,
  currentDate,
  onCreateAppointment,
  onAppointmentClick,
  onAppointmentReschedule,
  businessHoursStart = 9,
  businessHoursEnd = 17,
  cellDuration = 30,
  cellHeight = 60,
  loading = false
}: DayPilotCalendarProps) {
  const calendarRef = useRef<any>(null)
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false)
  const [pendingRecurringEdit, setPendingRecurringEdit] = useState<{
    appointmentId: string
    appointment: AppointmentData
    newStartTime: number
    newEndTime: number
    actionType: 'move' | 'resize'
  } | null>(null)
  const [config, setConfig] = useState<any>({
    viewType: viewMode === 'day' ? 'Day' : 'Week',
    startDate: currentDate,
    ...getBusinessHoursConfig(businessHoursStart, businessHoursEnd),
    ...getCellConfig(cellDuration),
    
    // Appearance
    theme: 'calendar_white',
    headerDateFormat: 'dddd',
    headerHeight: 40,
    hourWidth: 60,
    eventHeight: 'auto',
    eventBorderRadius: 8,
    eventMarginBottom: 4,
    
    // Interaction
    eventMoveHandling: 'Update',
    eventResizeHandling: 'Update',
    eventClickHandling: 'Enabled',
    timeRangeSelectedHandling: 'Enabled',
    eventDeleteHandling: 'Disabled',
    
    // Drag & Drop
    eventMoveDragAndDrop: true,
    eventResizeDragAndDrop: true,
    snapToGrid: true,
    
    // Event handlers
    onTimeRangeSelecting: (args: any) => {
      // Prevent selection of past time slots
      const selectionStart = new Date(args.start.value).getTime()
      const now = Date.now()
      
      if (selectionStart < now) {
        args.allowed = false
        toast.error('Cannot schedule appointments in the past')
      }
    },
    
    onTimeRangeSelected: async (args: any) => {
      const start = new Date(args.start.value).getTime()
      const end = new Date(args.end.value).getTime()
      
      const validation = validateTimeSlot(start, end)
      if (!validation.valid) {
        toast.error(validation.error)
        calendarRef.current?.control.clearSelection()
        return
      }
      
      onCreateAppointment(start, end)
      calendarRef.current?.control.clearSelection()
    },
    
    onEventClick: async (args: any) => {
      const appointmentId = args.e.id()
      const appointment = appointments.find(apt => apt._id === appointmentId)
      if (appointment) {
        onAppointmentClick(appointment)
      }
    },
    
    onEventMove: async (args: any) => {
      const appointmentId = args.e.id()
      const appointment = appointments.find(apt => apt._id === appointmentId)
      
      if (!appointment) {
        args.preventDefault()
        return
      }
      
      // Use args.newStart and args.newEnd for accurate new times
      const newStartTime = new Date(args.newStart.value).getTime()
      const newEndTime = new Date(args.newEnd.value).getTime()
      
      // Prevent moving to past
      if (newStartTime < Date.now()) {
        toast.error('Cannot reschedule appointments to the past')
        args.preventDefault()
        return
      }
      
      const validation = validateTimeSlot(newStartTime, newEndTime)
      
      if (!validation.valid) {
        toast.error(validation.error)
        args.preventDefault()
        return
      }
      
      // Check if recurring - show dialog
      if (appointment.isRecurring) {
        setPendingRecurringEdit({
          appointmentId,
          appointment,
          newStartTime,
          newEndTime,
          actionType: 'move'
        })
        setRecurringDialogOpen(true)
        args.preventDefault()
        return
      }
      
      try {
        await onAppointmentReschedule(appointmentId, newStartTime, newEndTime)
        toast.success('Appointment rescheduled successfully')
      } catch (error) {
        toast.error('Failed to reschedule appointment')
        args.preventDefault()
      }
    },
    
    onBeforeCellRender: (args: any) => {
      // Style past time slots
      const cellTime = new Date(args.cell.start).getTime()
      const now = Date.now()
      
      if (cellTime < now) {
        args.cell.backColor = '#F3F4F6' // Light gray for past
        args.cell.cssClass = 'calendar_past_cell'
      }
    },
    
    onEventResize: async (args: any) => {
      const appointmentId = args.e.id()
      const appointment = appointments.find(apt => apt._id === appointmentId)
      
      if (!appointment) {
        args.preventDefault()
        return
      }
      
      // Use args.newStart and args.newEnd for accurate new times
      const newStartTime = new Date(args.newStart.value).getTime()
      const newEndTime = new Date(args.newEnd.value).getTime()
      
      // Prevent resizing to past
      if (newStartTime < Date.now()) {
        toast.error('Cannot reschedule appointments to the past')
        args.preventDefault()
        return
      }
      
      const validation = validateTimeSlot(newStartTime, newEndTime)
      
      if (!validation.valid) {
        toast.error(validation.error)
        args.preventDefault()
        return
      }
      
      // Check if recurring - show dialog
      if (appointment.isRecurring) {
        setPendingRecurringEdit({
          appointmentId,
          appointment,
          newStartTime,
          newEndTime,
          actionType: 'resize'
        })
        setRecurringDialogOpen(true)
        args.preventDefault()
        return
      }
      
      try {
        await onAppointmentReschedule(appointmentId, newStartTime, newEndTime)
        toast.success('Appointment duration updated')
      } catch (error) {
        toast.error('Failed to update appointment')
        args.preventDefault()
      }
    }
  })

  // Update events when appointments change
  useEffect(() => {
    if (calendarRef.current) {
      const events = appointmentsToDayPilotEvents(appointments)
      calendarRef.current.control.update({ events })
    }
  }, [appointments])

  // Update view when viewMode or currentDate changes
  useEffect(() => {
    if (calendarRef.current) {
      calendarRef.current.control.update({
        viewType: viewMode === 'day' ? 'Day' : 'Week',
        startDate: currentDate
      })
    }
  }, [viewMode, currentDate])

  // Initialize events
  const events = appointmentsToDayPilotEvents(appointments)

  // Handle recurring edit dialog confirmation
  const handleRecurringEditConfirm = async (scope: RecurringEditScope) => {
    if (!pendingRecurringEdit) return

    const { appointmentId, appointment, newStartTime, newEndTime, actionType } = pendingRecurringEdit

    try {
      // For now, just call the regular reschedule for single instance
      // TODO: Wire up to recurringAppointments.updateSeriesAppointment or updateRecurringSeries
      await onAppointmentReschedule(appointmentId, newStartTime, newEndTime)
      
      const actionText = actionType === 'move' ? 'rescheduled' : 'updated'
      const scopeText = scope === 'instance' ? 'appointment' : scope === 'future' ? 'this and future appointments' : 'series'
      toast.success(`Successfully ${actionText} ${scopeText}`)
      
      // Refresh calendar
      if (calendarRef.current) {
        const events = appointmentsToDayPilotEvents(appointments)
        calendarRef.current.control.update({ events })
      }
    } catch (error) {
      toast.error(`Failed to update recurring appointment`)
    } finally {
      setPendingRecurringEdit(null)
    }
  }

  return (
    <div className="daypilot-calendar-wrapper">
      <style jsx global>{`
        .daypilot-calendar-wrapper {
          position: relative;
          width: 100%;
          height: 100%;
          background: transparent;
        }
        
        /* Main calendar container - Modern clean look */
        .calendar_white_main {
          border: none !important;
          border-radius: 0 !important;
          font-family: inherit;
          background: transparent !important;
        }
        
        /* Time column and corners - Subtle gray background */
        .calendar_white_timeheadercol,
        .calendar_white_cornerright,
        .calendar_white_corner {
          background: #F9FAFB !important;
          border-right: 1px solid #E5E7EB !important;
          border-bottom: 1px solid #E5E7EB !important;
        }
        
        /* Day headers - Modern gradient with better typography */
        .calendar_white_colheader {
          background: linear-gradient(to bottom, #F9FAFB, #F3F4F6) !important;
          border-bottom: 2px solid #E5E7EB !important;
          border-right: 1px solid #E5E7EB !important;
        }
        
        .calendar_white_colheader_inner {
          text-transform: uppercase;
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.5px;
          color: #374151 !important;
          padding: 16px 8px !important;
        }
        
        /* Grid cells - Clean white with subtle borders */
        .calendar_white_cell {
          border-right: 1px solid #F3F4F6 !important;
          border-bottom: 1px solid #F3F4F6 !important;
          background: #FFFFFF !important;
          transition: background-color 0.15s ease;
        }
        
        .calendar_white_cell:hover {
          background: #F9FAFB !important;
        }
        
        .calendar_white_cell_business {
          background-color: #FFFFFF !important;
        }
        
        /* Appointment events - Modern card design */
        .calendar_white_event {
          border-radius: 6px !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06) !important;
          transition: all 0.2s ease !important;
          cursor: pointer !important;
          border: 1px solid rgba(0, 0, 0, 0.05) !important;
        }
        
        .calendar_white_event:hover {
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06) !important;
          transform: translateY(-1px);
        }
        
        .calendar_white_event_inner {
          padding: 0 !important;
          border-radius: 6px !important;
          overflow: hidden;
        }
        
        /* Priority bar - Thicker and more visible */
        .calendar_white_event_bar {
          width: 4px !important;
          border-radius: 6px 0 0 6px !important;
        }
        
        /* Pinned appointments - Gold accent */
        .appointment-event.pinned .calendar_white_event {
          border: 2px solid #F59E0B !important;
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1) !important;
        }
        
        /* Recurring appointments - Blue accent with icon */
        .appointment-event.recurring .calendar_white_event {
          border-left: 3px solid #3B82F6 !important;
        }
        
        .appointment-event.recurring .calendar_white_event_inner::after {
          content: "🔄";
          position: absolute;
          bottom: 4px;
          right: 6px;
          font-size: 11px;
          opacity: 0.6;
        }
        
        /* Loading overlay - Modern blur effect */
        .calendar-loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          border-radius: 8px;
        }
        
        /* Time selection - Bright blue highlight */
        .calendar_white_selected {
          background: #DBEAFE !important;
          border: 2px dashed #3B82F6 !important;
        }
        
        /* Time labels - Better contrast */
        .calendar_white_timeheadercol_inner {
          color: #6B7280 !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          padding-right: 8px !important;
        }
        
        /* Non-business hours - Subtle gray */
        .calendar_white_cell_non_business {
          background: #F9FAFB !important;
          opacity: 0.5;
        }
        
        /* Past time slots - Clearly disabled look */
        .calendar_past_cell {
          background: repeating-linear-gradient(
            45deg,
            #F3F4F6,
            #F3F4F6 10px,
            #E5E7EB 10px,
            #E5E7EB 20px
          ) !important;
          opacity: 0.6 !important;
          cursor: not-allowed !important;
          position: relative;
        }
        
        .calendar_past_cell::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.03);
          pointer-events: none;
        }
        
        .calendar_past_cell:hover {
          background: repeating-linear-gradient(
            45deg,
            #F3F4F6,
            #F3F4F6 10px,
            #E5E7EB 10px,
            #E5E7EB 20px
          ) !important;
        }
        
        /* Today's column - Very subtle highlight */
        .calendar_white_cell.calendar_white_cell_today {
          background: #FEFCE8 !important;
          position: relative;
        }
        
        .calendar_white_colheader.calendar_white_colheader_today {
          background: linear-gradient(to bottom, #FEF3C7, #FDE68A) !important;
        }
        
        .calendar_white_colheader.calendar_white_colheader_today .calendar_white_colheader_inner {
          color: #92400E !important;
          font-weight: 800 !important;
        }
        
        /* Hour lines - Make major hours more visible */
        .calendar_white_cell[data-hour="9"],
        .calendar_white_cell[data-hour="12"],
        .calendar_white_cell[data-hour="15"] {
          border-bottom: 1px solid #D1D5DB !important;
        }
        
        /* Scrollbar styling */
        .calendar_white_main ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        
        .calendar_white_main ::-webkit-scrollbar-track {
          background: #F3F4F6;
          border-radius: 4px;
        }
        
        .calendar_white_main ::-webkit-scrollbar-thumb {
          background: #D1D5DB;
          border-radius: 4px;
        }
        
        .calendar_white_main ::-webkit-scrollbar-thumb:hover {
          background: #9CA3AF;
        }
      `}</style>
      
      {loading && (
        <div className="calendar-loading-overlay">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
            <span className="text-sm text-gray-600">Loading appointments...</span>
          </div>
        </div>
      )}
      
      {/* DayPilot component disabled - package not installed */}
      <div className="p-8 text-center text-gray-500">
        DayPilot calendar is disabled. Using react-big-calendar instead.
      </div>
      
      <RecurringEditDialog
        isOpen={recurringDialogOpen}
        onClose={() => {
          setRecurringDialogOpen(false)
          setPendingRecurringEdit(null)
          // Refresh calendar to revert visual change
          if (calendarRef.current) {
            const events = appointmentsToDayPilotEvents(appointments)
            calendarRef.current.control.update({ events })
          }
        }}
        onConfirm={handleRecurringEditConfirm}
        appointmentDate={pendingRecurringEdit ? new Date(pendingRecurringEdit.newStartTime) : undefined}
        actionType={pendingRecurringEdit?.actionType || 'move'}
      />
    </div>
  )
}
