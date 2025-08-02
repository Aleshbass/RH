'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, User, Loader2 } from 'lucide-react'
import { format, addDays } from 'date-fns'
import { toast } from 'sonner'
import { Id } from '@/convex/_generated/dataModel'

interface AppointmentBookingModalProps {
  isOpen: boolean
  onClose: () => void
  onAppointmentBooked: () => void
}

// Time slot returned by getAvailableTimeSlots query
interface TimeSlot {
  startTime: number;
  endTime: number;
  startTimeFormatted: string;
  endTimeFormatted: string;
  available: boolean;
}

const serviceTypes = [
  'Initial Consultation',
  'Follow-up Session',
  'Assessment',
  'Treatment Session',
  'Rehabilitation Session',
  'Exercise Training',
  'Manual Therapy',
  'Other'
]

export function AppointmentBookingModal({
  isOpen,
  onClose,
  onAppointmentBooked,
}: AppointmentBookingModalProps) {
  const [selectedPhysiotherapist, setSelectedPhysiotherapist] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlot | null>(null)
  const [serviceType, setServiceType] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Get patient's physiotherapists
  const physiotherapists = useQuery(api.appointments.getMyPhysiotherapists)
  
  // Get available time slots for selected physiotherapist and date
  const availableSlots = useQuery(
    api.appointments.getAvailableTimeSlots,
    selectedPhysiotherapist && selectedDate
      ? {
          physiotherapistId: selectedPhysiotherapist as Id<'users'>,
          date: selectedDate,
          serviceType,
        }
      : 'skip'
  )

  const requestAppointment = useMutation(api.appointments.requestAppointment)

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedPhysiotherapist('')
      setSelectedDate('')
      setSelectedTimeSlot(null)
      setServiceType('')
      setNotes('')
    }
  }, [isOpen])

  // Set default date to tomorrow
  useEffect(() => {
    if (isOpen && !selectedDate) {
      const tomorrow = addDays(new Date(), 1)
      setSelectedDate(format(tomorrow, 'yyyy-MM-dd'))
    }
  }, [isOpen, selectedDate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedPhysiotherapist || !selectedTimeSlot || !serviceType) {
      toast.error('Please fill in all required fields')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await requestAppointment({
        physiotherapistId: selectedPhysiotherapist as Id<'users'>,
        startTime: selectedTimeSlot.startTime,
        endTime: selectedTimeSlot.endTime,
        serviceType,
        notes: notes || undefined,
      })

      if (result.success) {
        toast.success(result.message)
        onAppointmentBooked()
        onClose()
      } else {
        toast.error('Failed to book appointment')
      }
    } catch (error) {
      console.error('Error booking appointment:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to book appointment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getNextAvailableDates = () => {
    const dates = []
    for (let i = 1; i <= 14; i++) { // Next 2 weeks
      const date = addDays(new Date(), i)
      dates.push({
        value: format(date, 'yyyy-MM-dd'),
        label: format(date, 'EEEE, MMMM do'),
      })
    }
    return dates
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Book New Appointment
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Physiotherapist Selection */}
          <div className="space-y-2">
            <Label htmlFor="physiotherapist">Select Physiotherapist *</Label>
            <Select value={selectedPhysiotherapist} onValueChange={setSelectedPhysiotherapist}>
              <SelectTrigger>
                <SelectValue placeholder="Choose your physiotherapist" />
              </SelectTrigger>
              <SelectContent>
                {physiotherapists?.map((physio) => physio && (
                  <SelectItem key={physio._id} value={physio._id}>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {physio?.firstName} {physio?.lastName}
                      {physio?.isPrimary && (
                        <Badge variant="secondary" className="text-xs">Primary</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Service Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="serviceType">Service Type *</Label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger>
                <SelectValue placeholder="Select service type" />
              </SelectTrigger>
              <SelectContent>
                {serviceTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Selection */}
          <div className="space-y-2">
            <Label htmlFor="date">Preferred Date *</Label>
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger>
                <SelectValue placeholder="Select appointment date" />
              </SelectTrigger>
              <SelectContent>
                {getNextAvailableDates().map((date) => (
                  <SelectItem key={date.value} value={date.value}>
                    {date.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time Slot Selection */}
          {selectedPhysiotherapist && selectedDate && (
            <div className="space-y-2">
              <Label>Available Time Slots *</Label>
              {availableSlots === undefined ? (
                <div className="flex items-center gap-2 p-4 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading available slots...
                </div>
              ) : availableSlots?.length === 0 ? (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-center text-gray-500">
                      No available slots for this date. Please select a different date.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {availableSlots?.map((slot, index) => (
                    <Button
                      key={index}
                      type="button"
                      variant={selectedTimeSlot?.startTime === slot.startTime ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedTimeSlot(slot)}
                      className="justify-start"
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      {slot.startTimeFormatted}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any specific concerns or requests for your appointment..."
              rows={3}
            />
          </div>

          {/* Selected Appointment Summary */}
          {selectedPhysiotherapist && selectedTimeSlot && serviceType && (
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-blue-800">Appointment Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-blue-600" />
                  <span>
                    {physiotherapists?.find(p => p?._id === selectedPhysiotherapist)?.firstName}{' '}
                    {physiotherapists?.find(p => p?._id === selectedPhysiotherapist)?.lastName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <span>{format(new Date(selectedDate), 'EEEE, MMMM do, yyyy')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span>
                    {selectedTimeSlot.startTimeFormatted} - {selectedTimeSlot.endTimeFormatted}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">Service:</span>
                  <span>{serviceType}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Form Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!selectedPhysiotherapist || !selectedTimeSlot || !serviceType || isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Booking...
                </>
              ) : (
                'Book Appointment'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
} 