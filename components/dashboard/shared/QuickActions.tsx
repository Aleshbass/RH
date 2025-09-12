 'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UserPlus, Calendar, FileTextIcon, Users, Dumbbell, ClipboardList, BookOpen } from 'lucide-react'

interface QuickActionsProps {
  onInvitePatient: () => void
  onScheduleAppointment: () => void
  onCreateSession: () => void
  onManagePatients: () => void
  onExerciseLibrary?: () => void
  onTreatmentTemplates?: () => void
  onAssessments?: () => void
}

export function QuickActions({ 
  onInvitePatient, 
  onScheduleAppointment, 
  onCreateSession, 
  onManagePatients,
  onExerciseLibrary,
  onTreatmentTemplates,
  onAssessments
}: QuickActionsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button 
          className="w-full justify-start" 
          variant="outline"
          onClick={onInvitePatient}
        >
          <UserPlus className="h-4 w-4 mr-2" />
          Invite New Patient
        </Button>

        <Button 
          className="w-full justify-start" 
          variant="outline"
          onClick={onScheduleAppointment}
        >
          <Calendar className="h-4 w-4 mr-2" />
          Schedule Appointment
        </Button>

        <Button 
          className="w-full justify-start" 
          variant="outline"
          onClick={onCreateSession}
        >
          <FileTextIcon className="h-4 w-4 mr-2" />
          Create Session Log
        </Button>

        <Button 
          className="w-full justify-start" 
          variant="outline"
          onClick={onManagePatients}
        >
          <Users className="h-4 w-4 mr-2" />
          Manage Patients
        </Button>

        {onExerciseLibrary && (
          <Button 
            className="w-full justify-start" 
            variant="outline"
            onClick={onExerciseLibrary}
          >
            <Dumbbell className="h-4 w-4 mr-2" />
            Exercise Library
          </Button>
        )}

        {onTreatmentTemplates && (
          <Button 
            className="w-full justify-start" 
            variant="outline"
            onClick={onTreatmentTemplates}
          >
            <BookOpen className="h-4 w-4 mr-2" />
            Treatment Templates
          </Button>
        )}

        {onAssessments && (
          <Button 
            className="w-full justify-start" 
            variant="outline"
            onClick={onAssessments}
          >
            <ClipboardList className="h-4 w-4 mr-2" />
            Run Assessment
          </Button>
        )}
      </CardContent>
    </Card>
  )
}