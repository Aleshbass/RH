'use client'
import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { CalendarDays, Clock, Repeat, Users } from 'lucide-react'
import { useRecurringAppointments, recurringAppointmentUtils } from '@/hooks/useRecurringAppointments'
import { Id } from '@/convex/_generated/dataModel'
// Local lightweight type to avoid deep type instantiation and export resolution issues
import type { DayOfWeek } from '@/lib/types/recurring-appointments'
import { PatientProfileMiniCard } from '@/components/dashboard/physiotherapist/PatientProfileMiniCard'
type CreateSeriesParams = {
  // Series metadata
  name: string
  description?: string
  // Participants
  patientId: Id<'users'>
  physiotherapistId: Id<'users'>
  clinicId?: Id<'clinics'>
  // Template fields
  serviceType: string
  duration: number
  appointmentType: 'in-person' | 'telehealth'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  notesForPatient?: string
  notesForTherapist?: string
  // Recurrence
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number
  daysOfWeek?: number[]
  endDate?: string
  maxOccurrences?: number
  // Scheduling
  startDate: string
  startTime: string
}

interface RecurringAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  userId: Id<'users'>
  role: 'patient' | 'physiotherapist'
  defaultValues?: Partial<CreateSeriesParams>
  physiotherapists?: Array<{ _id: Id<'users'>; firstName: string; lastName: string }>
  patients?: Array<{ _id: Id<'users'>; firstName: string; lastName: string }>
  clinics?: Array<{ _id: Id<'clinics'>; name: string }>
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
]

const SERVICE_TYPES = [
  'Physical Therapy',
  'Occupational Therapy',
  'Speech Therapy',
  'Massage Therapy',
  'Consultation',
  'Follow-up',
  'Assessment',
  'Treatment',
]

export function RecurringAppointmentModal({
  isOpen,
  onClose,
  userId,
  role,
  defaultValues,
  physiotherapists = [],
  patients = [],
  clinics = [],
}: RecurringAppointmentModalProps) {
  const { createRecurringSeries, isCreating } = useRecurringAppointments({ userId, role })

  // Form state
  const [formData, setFormData] = useState<CreateSeriesParams>({
    name: '',
    description: '',
    patientId: '' as Id<'users'>,
    physiotherapistId: '' as Id<'users'>,
    clinicId: undefined,
    serviceType: '',
    duration: 60,
    appointmentType: 'in-person',
    priority: 'medium',
    notesForPatient: '',
    notesForTherapist: '',
    frequency: 'weekly',
    interval: 1,
    daysOfWeek: [],
    endDate: '',
    maxOccurrences: undefined,
    startDate: '',
    startTime: '09:00',
  })

  const [endType, setEndType] = useState<'date' | 'occurrences' | 'never'>('never')
  const [errors, setErrors] = useState<string[]>([])

  // Initialize form with default values
  useEffect(() => {
    if (defaultValues) {
      setFormData((prev: CreateSeriesParams) => ({ ...prev, ...defaultValues }))
    }
  }, [defaultValues])

  // Auto-set user based on role
  useEffect(() => {
    if (role === 'patient') {
      setFormData((prev: CreateSeriesParams) => ({ ...prev, patientId: userId }))
    } else if (role === 'physiotherapist') {
      setFormData((prev: CreateSeriesParams) => ({ ...prev, physiotherapistId: userId }))
    }
  }, [userId, role])

  const handleInputChange = (field: keyof CreateSeriesParams, value: string | number | boolean | number[]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setErrors([]) // Clear errors when user makes changes
  }

  const handleDayOfWeekToggle = (day: number) => {
    const currentDays = formData.daysOfWeek || []
    const newDays = currentDays.includes(day as import('@/lib/types/recurring-appointments').DayOfWeek)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day].sort((a, b) => a - b)
    
    handleInputChange('daysOfWeek', newDays)
  }

  const validateForm = (): boolean => {
    const newErrors: string[] = []

    if (!formData.name.trim()) newErrors.push('Series name is required')
    if (!formData.patientId) newErrors.push('Patient is required')
    if (!formData.physiotherapistId) newErrors.push('Physiotherapist is required')
    if (!formData.serviceType) newErrors.push('Service type is required')
    if (!formData.startDate) newErrors.push('Start date is required')
    if (!formData.startTime) newErrors.push('Start time is required')
    if (formData.duration < 15) newErrors.push('Duration must be at least 15 minutes')
    if (formData.interval < 1) newErrors.push('Interval must be at least 1')

    if (formData.frequency === 'weekly' && (!formData.daysOfWeek || formData.daysOfWeek.length === 0)) {
      newErrors.push('Please select at least one day of the week for weekly recurrence')
    }

    if (endType === 'date' && !formData.endDate) {
      newErrors.push('End date is required when using date-based ending')
    }

    if (endType === 'occurrences' && (!formData.maxOccurrences || formData.maxOccurrences < 1)) {
      newErrors.push('Number of occurrences must be at least 1')
    }

    // Validate recurrence rule
    const toDayOfWeek = (arr?: number[]): DayOfWeek[] | undefined => arr ? arr.filter((d): d is DayOfWeek => d >= 0 && d <= 6) : undefined
    const ruleErrors = recurringAppointmentUtils.validateRecurrenceRule({
      frequency: formData.frequency,
      interval: formData.interval,
      daysOfWeek: toDayOfWeek(formData.daysOfWeek),
      endDate: endType === 'date' ? formData.endDate : undefined,
      maxOccurrences: endType === 'occurrences' ? formData.maxOccurrences : undefined,
    })
    newErrors.push(...ruleErrors)

    setErrors(newErrors)
    return newErrors.length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    try {
      // Prepare final form data
      const submitData: CreateSeriesParams = {
        ...formData,
        endDate: endType === 'date' ? formData.endDate : undefined,
        maxOccurrences: endType === 'occurrences' ? formData.maxOccurrences : undefined,
      }

      await createRecurringSeries(submitData)
      onClose()
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        patientId: role === 'patient' ? userId : '' as Id<'users'>,
        physiotherapistId: role === 'physiotherapist' ? userId : '' as Id<'users'>,
        clinicId: undefined,
        serviceType: '',
        duration: 60,
        appointmentType: 'in-person',
        priority: 'medium',
        notesForPatient: '',
        notesForTherapist: '',
        frequency: 'weekly',
        interval: 1,
        daysOfWeek: [],
        endDate: '',
        maxOccurrences: undefined,
        startDate: '',
        startTime: '09:00',
      })
      setEndType('never')
      setErrors([])
    } catch (error) {
      console.error('Failed to create recurring series:', error)
    }
  }

  const getRecurrencePreview = () => {
    if (!formData.frequency) return ''
    
    const toDayOfWeek = (arr?: number[]): DayOfWeek[] | undefined => arr ? arr.filter((d): d is DayOfWeek => d >= 0 && d <= 6) : undefined
    return recurringAppointmentUtils.getRecurrenceDescription({
      frequency: formData.frequency,
      interval: formData.interval,
      daysOfWeek: toDayOfWeek(formData.daysOfWeek),
      endDate: endType === 'date' ? formData.endDate : undefined,
      maxOccurrences: endType === 'occurrences' ? formData.maxOccurrences : undefined,
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5" />
            Create Recurring Appointment Series
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-4 w-4" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Series Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="e.g., Weekly Physical Therapy"
                  />
                </div>
                <div>
                  <Label htmlFor="serviceType">Service Type *</Label>
                  <Select value={formData.serviceType} onValueChange={(value) => handleInputChange('serviceType', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select service type" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map(service => (
                        <SelectItem key={service} value={service}>{service}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Optional description for the appointment series"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Participants */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-4 w-4" />
                Participants
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {role !== 'patient' && (
                  <div>
                    <Label htmlFor="patient">Patient *</Label>
                    <Select value={formData.patientId} onValueChange={(value) => handleInputChange('patientId', value as Id<'users'>)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select patient" />
                      </SelectTrigger>
                      <SelectContent>
                        {patients.map(patient => (
                          <SelectItem key={patient._id} value={patient._id}>
                            {patient.firstName} {patient.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formData.patientId && (
                      <div className="mt-2">
                        <PatientProfileMiniCard patientId={formData.patientId as Id<'users'>} />
                      </div>
                    )}
                  </div>
                )}

                {role !== 'physiotherapist' && (
                  <div>
                    <Label htmlFor="physiotherapist">Physiotherapist *</Label>
                    <Select value={formData.physiotherapistId} onValueChange={(value) => handleInputChange('physiotherapistId', value as Id<'users'>)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select physiotherapist" />
                      </SelectTrigger>
                      <SelectContent>
                        {physiotherapists.map(therapist => (
                          <SelectItem key={therapist._id} value={therapist._id}>
                            {therapist.firstName} {therapist.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {clinics.length > 0 && (
                  <div>
                    <Label htmlFor="clinic">Clinic</Label>
                    <Select value={formData.clinicId || ''} onValueChange={(value) => handleInputChange('clinicId', value as Id<'clinics'>)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select clinic (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No clinic</SelectItem>
                        {clinics.map(clinic => (
                          <SelectItem key={clinic._id} value={clinic._id}>
                            {clinic.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Schedule & Timing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-4 w-4" />
                Schedule & Timing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="startDate">Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => handleInputChange('startDate', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="startTime">Start Time *</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => handleInputChange('startTime', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="duration">Duration (minutes) *</Label>
                  <Input
                    id="duration"
                    type="number"
                    min="15"
                    step="15"
                    value={formData.duration}
                    onChange={(e) => handleInputChange('duration', parseInt(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="appointmentType">Appointment Type</Label>
                  <Select value={formData.appointmentType} onValueChange={(value) => handleInputChange('appointmentType', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in-person">In-Person</SelectItem>
                      <SelectItem value="telehealth">Telehealth</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recurrence Pattern */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Repeat className="h-4 w-4" />
                Recurrence Pattern
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="frequency">Frequency *</Label>
                  <Select value={formData.frequency} onValueChange={(value) => handleInputChange('frequency', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="interval">Repeat Every *</Label>
                  <Input
                    id="interval"
                    type="number"
                    min="1"
                    value={formData.interval}
                    onChange={(e) => handleInputChange('interval', parseInt(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="startDate">Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => handleInputChange('startDate', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startTime">Start Time *</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => handleInputChange('startTime', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="duration">Duration (minutes) *</Label>
                    <Input
                      id="duration"
                      type="number"
                      min="15"
                      step="15"
                      value={formData.duration}
                      onChange={(e) => handleInputChange('duration', parseInt(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {formData.frequency === 'weekly' && (
                <div>
                  <Label>Days of Week *</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {DAYS_OF_WEEK.map(day => (
                      <div key={day.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`day-${day.value}`}
                          checked={(formData.daysOfWeek || []).includes(day.value as import('@/lib/types/recurring-appointments').DayOfWeek)}
                          onCheckedChange={() => handleDayOfWeekToggle(day.value)}
                        />
                        <Label htmlFor={`day-${day.value}`} className="text-sm">
                          {day.short}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              <div>
                <Label>End Condition</Label>
                <div className="space-y-3 mt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="end-never"
                      checked={endType === 'never'}
                      onCheckedChange={() => setEndType('never')}
                    />
                    <Label htmlFor="end-never">Never end</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="end-date"
                      checked={endType === 'date'}
                      onCheckedChange={() => setEndType('date')}
                    />
                    <Label htmlFor="end-date">End by date:</Label>
                    {endType === 'date' && (
                      <Input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) => handleInputChange('endDate', e.target.value)}
                        className="w-40"
                      />
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="end-occurrences"
                      checked={endType === 'occurrences'}
                      onCheckedChange={() => setEndType('occurrences')}
                    />
                    <Label htmlFor="end-occurrences">End after:</Label>
                    {endType === 'occurrences' && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          value={formData.maxOccurrences || ''}
                          onChange={(e) => handleInputChange('maxOccurrences', parseInt(e.target.value))}
                          className="w-20"
                        />
                        <span className="text-sm text-muted-foreground">occurrences</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {getRecurrencePreview() && (
                <div className="bg-muted p-3 rounded-md">
                  <p className="text-sm font-medium">Preview:</p>
                  <p className="text-sm text-muted-foreground">{getRecurrencePreview()}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="notesForPatient">Notes for Patient</Label>
                <Textarea
                  id="notesForPatient"
                  value={formData.notesForPatient}
                  onChange={(e) => handleInputChange('notesForPatient', e.target.value)}
                  placeholder="Notes visible to the patient"
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="notesForTherapist">Notes for Therapist</Label>
                <Textarea
                  id="notesForTherapist"
                  value={formData.notesForTherapist}
                  onChange={(e) => handleInputChange('notesForTherapist', e.target.value)}
                  placeholder="Private notes for the therapist"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
              <h4 className="font-medium text-destructive mb-2">Please fix the following errors:</h4>
              <ul className="list-disc list-inside space-y-1">
                {errors.map((error, index) => (
                  <li key={index} className="text-sm text-destructive">{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Recurring Series'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
