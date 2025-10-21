'use client'
import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  Calendar, 
  Clock, 
  Repeat, 
  Edit, 
  Trash2, 
  CheckCircle,
  XCircle 
} from 'lucide-react'
import { useRecurringAppointments, useSeriesAppointments, recurringAppointmentUtils } from '@/hooks/useRecurringAppointments'
import { Id } from '@/convex/_generated/dataModel'
import type { DayOfWeek } from '@/lib/types/recurring-appointments'
// Local lightweight types to avoid deep type instantiation and mismatch with backend shape
type SeriesUpdateMode = 'all-in-series' | 'this-and-future'
type UIRecurringSeries = {
  _id: string
  name?: string
  description?: string
  isActive: boolean
  // template fields
  serviceType?: string
  duration?: number
  // recurrence fields
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number
  daysOfWeek?: number[]
  endDate?: string
  maxOccurrences?: number
  priority?: 'low' | 'medium' | 'high' | 'urgent'
}


interface RecurringSeriesManagerProps {
  userId: Id<'users'>
  role: 'patient' | 'physiotherapist'
  onEditSeries?: (seriesId: Id<'recurringSeries'>) => void
}

interface SeriesActionModalProps {
  isOpen: boolean
  onClose: () => void
  series: UIRecurringSeries | null
  action: 'edit' | 'delete'
  onConfirm: (mode: SeriesUpdateMode, fromDate?: string, reason?: string) => void
  isLoading: boolean
}

function SeriesActionModal({ isOpen, onClose, series, action, onConfirm, isLoading }: SeriesActionModalProps) {
  const [mode, setMode] = useState<SeriesUpdateMode>('all-in-series')
  const [fromDate, setFromDate] = useState('')
  const [reason, setReason] = useState('')

  const handleConfirm = () => {
    onConfirm(mode, mode === 'this-and-future' ? fromDate : undefined, reason)
  }

  const actionText = action === 'edit' ? 'edit' : 'delete'
  const actionTitle = action === 'edit' ? 'Edit Recurring Series' : 'Delete Recurring Series'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {action === 'edit' ? <Edit className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
            {actionTitle}
          </DialogTitle>
          <DialogDescription>
            How would you like to {actionText} this recurring appointment series?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Choose what to {actionText}:</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as SeriesUpdateMode)}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-in-series">
                  All appointments in this series
                </SelectItem>
                <SelectItem value="this-and-future">
                  This and future appointments only
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === 'this-and-future' && (
            <div>
              <Label htmlFor="fromDate">Starting from date:</Label>
              <input
                id="fromDate"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full mt-2 px-3 py-2 border border-input rounded-md"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          )}

          {action === 'delete' && (
            <div>
              <Label htmlFor="reason">Reason for cancellation (optional):</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Patient request, schedule conflict..."
                className="mt-2"
                rows={2}
              />
            </div>
          )}

          <div className="bg-muted p-3 rounded-md">
            <p className="text-sm font-medium mb-1">This will {actionText}:</p>
            <p className="text-sm text-muted-foreground">
              {mode === 'all-in-series' 
                ? `All appointments in the "${series?.name}" series`
                : `All appointments in the "${series?.name}" series starting from ${fromDate || 'the selected date'}`
              }
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm} 
              disabled={isLoading || (mode === 'this-and-future' && !fromDate)}
              variant={action === 'delete' ? 'destructive' : 'default'}
            >
              {isLoading ? 'Processing...' : `${action === 'edit' ? 'Edit' : 'Delete'} Series`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SeriesCard({ series, onEdit, onDelete }: {
  series: UIRecurringSeries
  onEdit: () => void
  onDelete: () => void
}) {
  const { appointments } = useSeriesAppointments({ 
    seriesId: series._id as Id<'recurringSeries'>,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Next 90 days
  })

  const upcomingCount = appointments?.filter((apt: {
    startTime: number;
    status: string;
  }) => 
    apt.startTime > Date.now() && apt.status === 'scheduled'
  ).length || 0

  const completedCount = appointments?.filter((apt: {
    status: string;
  }) => 
    apt.status === 'completed'
  ).length || 0

  const cancelledCount = appointments?.filter((apt: {
    status: string;
  }) => 
    apt.status === 'cancelled_by_patient' || apt.status === 'cancelled_by_therapist'
  ).length || 0

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-gray-100 text-gray-800'
      default: return 'bg-blue-100 text-blue-800'
    }
  }

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800'
      case 'high': return 'bg-orange-100 text-orange-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'low': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Repeat className="h-4 w-4" />
              {series.name}
            </CardTitle>
            {series.description && (
              <p className="text-sm text-muted-foreground mt-1">{series.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Badge className={getStatusColor(series.isActive ? 'active' : 'inactive')}>
              {series.isActive ? 'Active' : 'Inactive'}
            </Badge>
            {series.priority && (
              <Badge className={getPriorityColor(series.priority)}>
                {series.priority}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{series.serviceType}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>{series.duration} minutes</span>
          </div>
        </div>

        {/* Recurrence Info */}
        <div className="bg-muted p-3 rounded-md">
          <p className="text-sm font-medium mb-1">Recurrence Pattern:</p>
          <p className="text-sm text-muted-foreground">
            {recurringAppointmentUtils.getRecurrenceDescription({
              frequency: series.frequency,
              interval: series.interval,
              daysOfWeek: (series.daysOfWeek ? series.daysOfWeek.filter((d): d is DayOfWeek => d >= 0 && d <= 6) : undefined),
              endDate: series.endDate,
              maxOccurrences: series.maxOccurrences,
            })}
          </p>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-blue-50 p-2 rounded-md">
            <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
              <Calendar className="h-3 w-3" />
              <span className="text-xs font-medium">Upcoming</span>
            </div>
            <p className="text-lg font-bold text-blue-700">{upcomingCount}</p>
          </div>
          <div className="bg-green-50 p-2 rounded-md">
            <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
              <CheckCircle className="h-3 w-3" />
              <span className="text-xs font-medium">Completed</span>
            </div>
            <p className="text-lg font-bold text-green-700">{completedCount}</p>
          </div>
          <div className="bg-red-50 p-2 rounded-md">
            <div className="flex items-center justify-center gap-1 text-red-600 mb-1">
              <XCircle className="h-3 w-3" />
              <span className="text-xs font-medium">Cancelled</span>
            </div>
            <p className="text-lg font-bold text-red-700">{cancelledCount}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit className="h-3 w-3 mr-1" />
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete}>
            <Trash2 className="h-3 w-3 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function RecurringSeriesManager({ userId, role, onEditSeries }: RecurringSeriesManagerProps) {
  const { 
    recurringSeries, 
    deleteRecurringSeries,
    isUpdating,
    isDeleting 
  } = useRecurringAppointments({ userId, role })

  const [actionModal, setActionModal] = useState<{
    isOpen: boolean
    series: UIRecurringSeries | null
    action: 'edit' | 'delete'
  }>({
    isOpen: false,
    series: null,
    action: 'edit'
  })

  const handleEditSeries = (series: UIRecurringSeries) => {
    if (onEditSeries) {
      onEditSeries(series._id as Id<'recurringSeries'>)
    } else {
      setActionModal({
        isOpen: true,
        series,
        action: 'edit'
      })
    }
  }

  const handleDeleteSeries = (series: UIRecurringSeries) => {
    setActionModal({
      isOpen: true,
      series,
      action: 'delete'
    })
  }

  const handleActionConfirm = async (mode: SeriesUpdateMode, fromDate?: string) => {
    if (!actionModal.series) return

    try {
      if (actionModal.action === 'edit') {
        // For now, just show a placeholder - full edit functionality would require a more complex modal
        console.log('Edit series:', actionModal.series._id, mode, fromDate)
      } else {
        await deleteRecurringSeries(actionModal.series._id as Id<'recurringSeries'>, mode, fromDate)
      }
      
      setActionModal({ isOpen: false, series: null, action: 'edit' })
    } catch (error) {
      console.error('Action failed:', error)
    }
  }

  const activeSeries: UIRecurringSeries[] =
    (recurringSeries as UIRecurringSeries[] | undefined)?.filter((series) => series.isActive) ?? []
  const inactiveSeries: UIRecurringSeries[] =
    (recurringSeries as UIRecurringSeries[] | undefined)?.filter((series) => !series.isActive) ?? []

  if (!recurringSeries) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <Repeat className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">Loading recurring appointments...</p>
        </div>
      </div>
    )
  }

  if (recurringSeries.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Repeat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No recurring appointment series found</h3>
          <p className="text-gray-500 mb-4">
            Recurring series help you schedule regular appointments automatically
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left mb-4">
            <h4 className="font-medium text-blue-900 mb-2">Recurring Series Benefits</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Schedule weekly/monthly appointments in bulk</li>
              <li>• Automatically book resources for each appointment</li>
              <li>• Manage entire series or individual appointments</li>
              <li>• Perfect for ongoing therapy programs</li>
            </ul>
          </div>
          <p className="text-sm text-gray-600">
            Click &quot;Create Recurring Series&quot; above to get started
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Active Series */}
      {activeSeries.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Active Series ({activeSeries.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeSeries.map((series: UIRecurringSeries) => (
              <SeriesCard
                key={series._id}
                series={series}
                onEdit={() => handleEditSeries(series)}
                onDelete={() => handleDeleteSeries(series)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inactive Series */}
      {inactiveSeries.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <XCircle className="h-5 w-5 text-gray-600" />
            Inactive Series ({inactiveSeries.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {inactiveSeries.map((series: UIRecurringSeries) => (
              <SeriesCard
                key={series._id}
                series={series}
                onEdit={() => handleEditSeries(series)}
                onDelete={() => handleDeleteSeries(series)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Action Modal */}
      <SeriesActionModal
        isOpen={actionModal.isOpen}
        onClose={() => setActionModal({ isOpen: false, series: null, action: 'edit' })}
        series={actionModal.series}
        action={actionModal.action}
        onConfirm={handleActionConfirm}
        isLoading={isUpdating || isDeleting}
      />
    </div>
  )
}
