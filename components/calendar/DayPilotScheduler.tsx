'use client'

import React, { useRef, useEffect, useState } from 'react'
// DayPilot is not installed - using react-big-calendar instead
// import { DayPilot, DayPilotScheduler as DPScheduler } from '@daypilot/daypilot-lite-react'
import {
  AppointmentData,
  Provider,
  appointmentsToDayPilotEvents,
  providersToDayPilotResources,
  dayPilotEventToAppointmentUpdate,
  validateTimeSlot,
  getCellConfig
} from '@/lib/calendar/dayPilotAdapter'
import { toast } from 'sonner'
import { Id } from '@/convex/_generated/dataModel'

interface DayPilotSchedulerProps {
  providers: Provider[]
  appointments: AppointmentData[]
  viewMode: 'day' | 'week'
  currentDate: Date
  onCreateAppointment: (providerId: Id<'users'>, startTime: number, endTime: number) => void
  onAppointmentClick: (appointment: AppointmentData) => void
  onAppointmentReschedule: (appointmentId: string, newStartTime: number, newEndTime: number) => Promise<void>
  onAppointmentReassign: (appointmentId: string, newProviderId: Id<'users'>) => Promise<void>
  businessHoursStart?: number
  businessHoursEnd?: number
  cellDuration?: number
  cellHeight?: number
  loading?: boolean
}

export function DayPilotScheduler({
  providers,
  appointments,
  viewMode,
  currentDate,
  onCreateAppointment,
  onAppointmentClick,
  onAppointmentReschedule,
  onAppointmentReassign,
  businessHoursStart = 9,
  businessHoursEnd = 17,
  cellDuration = 30,
  cellHeight = 60,
  loading = false
}: DayPilotSchedulerProps) {
  const schedulerRef = useRef<any>(null)
  
  const [config, setConfig] = useState<any>({
    viewType: viewMode === 'day' ? 'Day' : 'Week',
    startDate: currentDate,
    days: viewMode === 'day' ? 1 : 7,
    ...getCellConfig(cellDuration),
    
    // Time range
    businessBeginsHour: businessHoursStart,
    businessEndsHour: businessHoursEnd,
    showNonBusiness: true,
    
    // Appearance
    theme: 'scheduler_white',
    headerHeight: 40,
    rowHeaderWidth: 180,
    rowMarginTop: 2,
    rowMarginBottom: 2,
    eventHeight: 'auto',
    eventBorderRadius: 8,
    eventMarginBottom: 4,
    
    // Resource headers
    rowHeaderColumns: [
      { 
        title: 'Physiotherapist',
        display: 'name',
        width: 180
      }
    ],
    
    // Interaction
    eventMoveHandling: 'Update',
    eventResizeHandling: 'Update',
    eventClickHandling: 'Enabled',
    timeRangeSelectedHandling: 'Enabled',
    
    // Drag & Drop
    eventMoveDragAndDrop: true,
    eventResizeDragAndDrop: true,
    allowEventOverlap: false,
    
    // Event handlers
    onTimeRangeSelected: async (args: any) => {
      const providerId = args.resource as Id<'users'>
      const start = new Date(args.start.value).getTime()
      const end = new Date(args.end.value).getTime()
      
      const validation = validateTimeSlot(start, end)
      if (!validation.valid) {
        toast.error(validation.error)
        schedulerRef.current?.control.clearSelection()
        return
      }
      
      onCreateAppointment(providerId, start, end)
      schedulerRef.current?.control.clearSelection()
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
      
      const oldProviderId = appointment.physiotherapistId
      const newProviderId = args.newResource as Id<'users'>
      
      // Use args.newStart and args.newEnd for accurate new times
      const newStartTime = new Date(args.newStart.value).getTime()
      const newEndTime = new Date(args.newEnd.value).getTime()
      
      // Check if recurring
      if (appointment.isRecurring) {
        toast.info('Editing recurring appointment. This will update only this instance.')
      }
      
      const validation = validateTimeSlot(newStartTime, newEndTime)
      
      if (!validation.valid) {
        toast.error(validation.error)
        args.preventDefault()
        return
      }
      
      try {
        // First reschedule if times changed
        if (newStartTime !== appointment.startTime || newEndTime !== appointment.endTime) {
          await onAppointmentReschedule(appointmentId, newStartTime, newEndTime)
        }
        
        // Then reassign if provider changed
        if (oldProviderId !== newProviderId) {
          const newProvider = providers.find(p => p._id === newProviderId)
          if (newProvider) {
            await onAppointmentReassign(appointmentId, newProviderId)
            toast.success(`Reassigned to ${newProvider.firstName} ${newProvider.lastName}`)
          }
        } else {
          toast.success('Appointment rescheduled successfully')
        }
      } catch (error) {
        toast.error('Failed to update appointment')
        args.preventDefault()
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
      
      const validation = validateTimeSlot(newStartTime, newEndTime)
      
      if (!validation.valid) {
        toast.error(validation.error)
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
    },
    
    onBeforeEventRender: (args: any) => {
      // Add custom HTML for provider avatar
      if (args.data.tags?.patientName) {
        const typeIcon = args.data.tags.telehealth ? '📹' : '🏥'
        args.data.html = `
          <div style="padding: 8px; position: relative; height: 100%; border-radius: 6px;">
            ${args.data.tags.isPinned ? '<span style="position: absolute; top: 4px; right: 4px;">📌</span>' : ''}
            ${args.data.tags.isRecurring ? '<span style="position: absolute; bottom: 4px; right: 4px; font-size: 10px;">🔄</span>' : ''}
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
              <span>${typeIcon}</span>
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${args.data.tags.patientName}</span>
            </div>
            <div style="font-size: 11px; opacity: 0.9;">
              ${new Date(args.data.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${args.data.tags.serviceType}
            </div>
          </div>
        `
      }
      
      // Priority bar
      if (args.data.barColor && args.data.barColor !== 'transparent') {
        args.data.barHidden = false
        args.data.barHeight = 4
      }
    }
  })

  // Update resources and events when providers/appointments change
  useEffect(() => {
    if (schedulerRef.current) {
      const resources = providersToDayPilotResources(providers)
      const events = appointmentsToDayPilotEvents(appointments)
      schedulerRef.current.control.update({ resources, events })
    }
  }, [providers, appointments])

  // Update view when viewMode or currentDate changes
  useEffect(() => {
    if (schedulerRef.current) {
      schedulerRef.current.control.update({
        viewType: viewMode === 'day' ? 'Day' : 'Week',
        startDate: currentDate,
        days: viewMode === 'day' ? 1 : 7
      })
    }
  }, [viewMode, currentDate])

  // Initialize resources and events
  const resources = providersToDayPilotResources(providers)
  const events = appointmentsToDayPilotEvents(appointments)

  return (
    <div className="daypilot-scheduler-wrapper">
      <style jsx global>{`
        .daypilot-scheduler-wrapper {
          position: relative;
          width: 100%;
          height: 100%;
        }
        
        /* Custom styling for DayPilot Scheduler */
        .scheduler_white_main {
          border: 1px solid #E0E0E0;
          border-radius: 8px;
          font-family: inherit;
        }
        
        .scheduler_white_timeheadercol,
        .scheduler_white_corner {
          background: #FAFAFA;
          border-color: #E0E0E0;
        }
        
        .scheduler_white_timeheader_cell {
          text-transform: uppercase;
          font-weight: 600;
          font-size: 12px;
          color: #616161;
        }
        
        .scheduler_white_rowheader {
          background: #FAFAFA;
          border-color: #E0E0E0;
        }
        
        .scheduler_white_rowheader_inner {
          padding: 12px;
          font-weight: 500;
          font-size: 14px;
          color: #424242;
        }
        
        .scheduler_white_cell {
          border: 1px solid #F5F5F5;
        }
        
        .scheduler_white_cell_business {
          background-color: #FFFFFF;
        }
        
        .scheduler_white_cell_non_business {
          background: #F5F5F5;
        }
        
        .scheduler_white_event {
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
          transition: box-shadow 0.2s ease;
          cursor: pointer;
        }
        
        .scheduler_white_event:hover {
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);
        }
        
        .scheduler_white_event_inner {
          padding: 0;
          border-radius: 8px;
        }
        
        /* Priority bar (left border) */
        .scheduler_white_event_bar {
          border-radius: 8px 0 0 8px;
        }
        
        /* Loading overlay */
        .scheduler-loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          border-radius: 8px;
        }
        
        /* Selection highlight */
        .scheduler_white_selected {
          background: #E3F2FD !important;
        }
      `}</style>
      
      {loading && (
        <div className="scheduler-loading-overlay">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
            <span className="text-sm text-gray-600">Loading schedule...</span>
          </div>
        </div>
      )}
      
      {/* DayPilot scheduler disabled - package not installed */}
      <div className="p-8 text-center text-gray-500">
        DayPilot scheduler is disabled. Using react-big-calendar instead.
      </div>
    </div>
  )
}
