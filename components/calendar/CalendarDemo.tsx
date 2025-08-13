'use client'

import { useState } from 'react'
import { DragDropTooltipCalendar, type AppointmentData } from './DragDropTooltipCalendar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

import { toast } from 'sonner'

// Mock data for demonstration
const mockAppointments: AppointmentData[] = [
  {
    _id: '1',
    patientId: 'patient1',
    physiotherapistId: 'physio1',
    clinicId: 'clinic1',
    startTime: new Date(2025, 7, 11, 9, 0).getTime(), // Aug 11, 2025, 9:00 AM
    endTime: new Date(2025, 7, 11, 10, 0).getTime(), // Aug 11, 2025, 10:00 AM
    serviceType: 'Initial Assessment',
    status: 'scheduled' as const,
    priority: 'high' as const,
    appointmentType: 'in-person' as const,
    isPinned: true,
    notesForTherapist: 'Patient has chronic lower back pain. First visit.',
    patient: {
      _id: 'patient1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@email.com',
      phoneNumber: '+1-555-0123',
      imageUrl: undefined
    }
  },
  {
    _id: '2',
    patientId: 'patient2',
    physiotherapistId: 'physio1',
    clinicId: 'clinic1',
    startTime: new Date(2025, 7, 11, 14, 30).getTime(), // Aug 11, 2025, 2:30 PM
    endTime: new Date(2025, 7, 11, 15, 30).getTime(), // Aug 11, 2025, 3:30 PM
    serviceType: 'Follow-up Session',
    status: 'confirmed' as const,
    priority: 'medium' as const,
    appointmentType: 'telehealth' as const,
    notesForTherapist: 'Progress check on shoulder mobility exercises.',
    patient: {
      _id: 'patient2',
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.johnson@email.com',
      phoneNumber: '+1-555-0456',
      imageUrl: undefined
    }
  },
  {
    _id: '3',
    patientId: 'patient3',
    physiotherapistId: 'physio1',
    clinicId: 'clinic1',
    startTime: new Date(2025, 7, 12, 10, 0).getTime(), // Aug 12, 2025, 10:00 AM
    endTime: new Date(2025, 7, 12, 11, 30).getTime(), // Aug 12, 2025, 11:30 AM
    serviceType: 'Massage Therapy',
    status: 'completed' as const,
    priority: 'low' as const,
    appointmentType: 'in-person' as const,
    notesForTherapist: 'Deep tissue massage for muscle tension relief.',
    patient: {
      _id: 'patient3',
      firstName: 'Michael',
      lastName: 'Chen',
      email: 'michael.chen@email.com',
      phoneNumber: '+1-555-0789',
      imageUrl: undefined
    }
  },
  {
    _id: '4',
    patientId: 'patient4',
    physiotherapistId: 'physio1',
    clinicId: 'clinic1',
    startTime: new Date(2025, 7, 13, 16, 0).getTime(), // Aug 13, 2025, 4:00 PM
    endTime: new Date(2025, 7, 13, 17, 0).getTime(), // Aug 13, 2025, 5:00 PM
    serviceType: 'Exercise Therapy',
    status: 'cancelled_by_patient' as const,
    priority: 'urgent' as const,
    appointmentType: 'in-person' as const,
    colorCode: '#EC4899', // Custom pink color
    cancellationReason: 'Patient had emergency',
    notesForTherapist: 'Strength training session for knee rehabilitation.',
    patient: {
      _id: 'patient4',
      firstName: 'Emily',
      lastName: 'Rodriguez',
      email: 'emily.rodriguez@email.com',
      phoneNumber: '+1-555-0321',
      imageUrl: undefined
    }
  }
]

export function CalendarDemo() {
  const [appointments, setAppointments] = useState(mockAppointments)
  const [viewMode, setViewMode] = useState<'week' | 'day' | 'month'>('week')
  const [enableDragDrop, setEnableDragDrop] = useState(true)
  const [showTooltips, setShowTooltips] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  // Handle appointment updates (drag & drop, colors, pins, priority)
  const handleAppointmentUpdate = async (appointmentId: string, updates: Partial<typeof mockAppointments[0]>) => {
    setIsLoading(true)
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 800))
    
    // Update the appointment in state
    setAppointments(prev => 
      prev.map(apt => 
        apt._id === appointmentId 
          ? { ...apt, ...updates }
          : apt
      )
    )
    
    setIsLoading(false)
  }

  // Handle creating new appointments
  const handleCreateAppointment = (date?: Date) => {
    const selectedDate = date || new Date()
    toast.success(`Creating new appointment for ${selectedDate.toLocaleDateString()}`, {
      description: 'This would open the appointment creation modal in your app'
    })
  }

  // Handle appointment clicks
  const handleAppointmentClick = (appointment: AppointmentData) => {
    toast.info(`Clicked appointment: ${appointment.patient?.firstName} ${appointment.patient?.lastName}`, {
      description: 'This would open the appointment details modal in your app'
    })
  }

  // Add a new demo appointment
  const addDemoAppointment = () => {
    const newAppointment = {
      _id: `demo-${Date.now()}`,
      patientId: 'demo-patient',
      physiotherapistId: 'physio1',
      clinicId: 'clinic1',
      startTime: new Date(2025, 7, 14, 11, 0).getTime(), // Aug 14, 2025, 11:00 AM
      endTime: new Date(2025, 7, 14, 12, 0).getTime(), // Aug 14, 2025, 12:00 PM
      serviceType: 'Consultation',
      status: 'scheduled' as const,
      priority: 'medium' as const,
      appointmentType: 'telehealth' as const,
      notesForTherapist: 'New patient consultation via video call.',
      patient: {
        _id: 'demo-patient',
        firstName: 'Demo',
        lastName: 'Patient',
        email: 'demo@example.com',
        phoneNumber: '+1-555-DEMO',
        imageUrl: undefined
      }
    }

    setAppointments(prev => [...prev, newAppointment])
    toast.success('Demo appointment added! Try dragging it around.')
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Enhanced Calendar Demo</h1>
          <p className="text-gray-600 mt-1">
            Featuring drag & drop functionality and rich tooltips
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {appointments.length} appointments
          </Badge>
          <Button onClick={addDemoAppointment} variant="outline">
            Add Demo Appointment
          </Button>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Calendar Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* View Mode */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">View Mode</Label>
              <div className="flex gap-2">
                {(['day', 'week', 'month'] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant={viewMode === mode ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode(mode)}
                    className="capitalize"
                  >
                    {mode}
                  </Button>
                ))}
              </div>
            </div>

            {/* Drag & Drop Toggle */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Features</Label>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="drag-drop"
                    checked={enableDragDrop}
                    onCheckedChange={setEnableDragDrop}
                  />
                  <Label htmlFor="drag-drop" className="text-sm">
                    Enable Drag & Drop
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="tooltips"
                    checked={showTooltips}
                    onCheckedChange={setShowTooltips}
                  />
                  <Label htmlFor="tooltips" className="text-sm">
                    Show Tooltips
                  </Label>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Quick Stats</Label>
              <div className="space-y-1 text-sm text-gray-600">
                <div>Scheduled: {appointments.filter(a => a.status === 'scheduled').length}</div>
                <div>Confirmed: {appointments.filter(a => a.status === 'confirmed').length}</div>
                <div>Completed: {appointments.filter(a => a.status === 'completed').length}</div>
                <div>Cancelled: {appointments.filter(a => a.status.includes('cancelled')).length}</div>
                <div>📌 Pinned: {appointments.filter(a => a.isPinned).length}</div>
                <div>⚡ High Priority: {appointments.filter(a => a.priority === 'high' || a.priority === 'urgent').length}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Calendar */}
      <DragDropTooltipCalendar
        appointments={appointments}
        onCreateAppointment={handleCreateAppointment}
        onAppointmentClick={handleAppointmentClick}
        onAppointmentUpdate={handleAppointmentUpdate}
        viewMode={viewMode}
        currentDate={new Date()}
        enableDragDrop={enableDragDrop}
        showTooltips={showTooltips}
        showColorPicker={true}
        allowPinning={true}
        isLoading={isLoading}
      />

      {/* Interactive Demo Instructions */}
      <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
        <CardHeader>
          <CardTitle className="text-lg text-purple-800">🚀 Try the Interactive Features!</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-purple-700">
            <div className="flex items-start gap-3">
              <span className="text-lg">1️⃣</span>
              <div>
                <strong>Test Colors:</strong> Click the &quot;🎨 Colors&quot; button, select a color or gradient, then click any appointment to apply it.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-lg">2️⃣</span>
              <div>
                <strong>Test Pin Mode:</strong> Click &quot;📌 Pin Mode&quot; to activate it, then click appointments to pin/unpin them.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-lg">3️⃣</span>
              <div>
                <strong>Test Priority:</strong> Click &quot;⚡ Priority&quot;, select a level (urgent, high, medium, low), then click appointments.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-lg">4️⃣</span>
              <div>
                <strong>Test Drag & Drop:</strong> Drag appointments to different time slots or resize them by dragging the edges.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-lg">5️⃣</span>
              <div>
                <strong>Test Tooltips:</strong> Hover over appointments to see rich information tooltips with patient details.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Highlights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">✨ Complete Feature Set</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold text-green-600">🎯 Enhanced Tooltips</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Rich patient information display</li>
                <li>• Contact details and appointment notes</li>
                <li>• Priority and status indicators</li>
                <li>• Interactive hover experience</li>
                <li>• Responsive positioning</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-blue-600">🖱️ Drag & Drop</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Drag appointments to reschedule</li>
                <li>• Resize appointments by dragging edges</li>
                <li>• Visual feedback during interactions</li>
                <li>• Automatic conflict detection</li>
                <li>• Toast notifications for actions</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-purple-600">🎨 Interactive Modes</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• 🎨 Color picker with service type themes</li>
                <li>• 📌 Pin mode for important appointments</li>
                <li>• ⚡ Priority levels (low to urgent)</li>
                <li>• Click appointments to apply changes</li>
                <li>• Visual indicators and feedback</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
