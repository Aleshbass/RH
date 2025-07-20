 'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Users, UserPlus, Eye } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Patient {
  _id: string
  firstName: string
  lastName: string
  imageUrl?: string
  stats: {
    lastSessionDate?: number
  }
}

interface RecentPatientsProps {
  recentPatients: Patient[] | undefined
  onViewAll: () => void
  onViewPatient: (patientId: string) => void
  onInvitePatient: () => void
}

export function RecentPatients({ 
  recentPatients, 
  onViewAll, 
  onViewPatient, 
  onInvitePatient 
}: RecentPatientsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Recent Patients</CardTitle>
          <Button size="sm" variant="ghost" onClick={onViewAll}>
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {recentPatients && recentPatients.length > 0 ? (
          recentPatients.map((patient) => (
            <div key={patient._id} className="flex items-center space-x-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={patient.imageUrl} />
                <AvatarFallback>
                  {patient.firstName?.[0]}{patient.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {patient.firstName} {patient.lastName}
                </p>
                <p className="text-xs text-gray-500">
                  {patient.stats.lastSessionDate 
                    ? `Last session: ${formatDistanceToNow(new Date(patient.stats.lastSessionDate))} ago`
                    : 'No sessions yet'
                  }
                </p>
              </div>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => onViewPatient(patient._id)}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-gray-500">
            <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No patients yet</p>
            <Button 
              size="sm" 
              variant="outline" 
              className="mt-2"
              onClick={onInvitePatient}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Invite First Patient
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}