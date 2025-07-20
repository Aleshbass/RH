 'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, CalendarDays, Plus } from 'lucide-react'
import { format } from 'date-fns'

interface Appointment {
  _id: string
  startTime: number
  endTime: number
  serviceType: string
  status: string
  patient?: {
    firstName: string
    lastName: string
  }
}

interface TodaysScheduleProps {
  todaysSchedule: Appointment[] | undefined
  onViewCalendar: () => void
}

export function TodaysSchedule({ todaysSchedule, onViewCalendar }: TodaysScheduleProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Today&apos;s Schedule</CardTitle>
          <Button size="sm" variant="outline" onClick={onViewCalendar}>
            <Calendar className="h-4 w-4 mr-2" />
            View Full Calendar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {todaysSchedule && todaysSchedule.length > 0 ? (
          todaysSchedule.map((appointment) => (
            <div key={appointment._id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-3">
                <div className={`w-2 h-12 rounded-full ${
                  appointment.status === 'completed' ? 'bg-green-500' :
                  appointment.status === 'confirmed' ? 'bg-blue-500' :
                  appointment.status === 'scheduled' ? 'bg-yellow-500' : 'bg-gray-400'
                }`}></div>
                <div>
                  <h4 className="font-medium">
                    {appointment.patient ? 
                      `${appointment.patient.firstName} ${appointment.patient.lastName}` : 
                      'Unknown Patient'
                    }
                  </h4>
                  <p className="text-sm text-gray-500">{appointment.serviceType}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-medium">
                  {format(new Date(appointment.startTime), 'h:mm a')} - {format(new Date(appointment.endTime), 'h:mm a')}
                </p>
                <Badge variant="secondary" className="capitalize">
                  {appointment.status.replace('_', ' ')}
                </Badge>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500">
            <CalendarDays className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No appointments scheduled for today</p>
            <Button 
              size="sm" 
              variant="outline" 
              className="mt-2"
              onClick={onViewCalendar}
            >
              <Plus className="h-4 w-4 mr-2" />
              Schedule Appointment
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}