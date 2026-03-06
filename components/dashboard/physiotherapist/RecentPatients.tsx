import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Users, UserPlus, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { PatientQuickViewSheet } from './PatientQuickViewSheet'

interface Patient {
  _id: string
  firstName: string
  lastName: string
  imageUrl?: string
  email?: string
  phoneNumber?: string
  stats: {
    appointmentCount: number
    lastSessionDate?: number
  }
}

interface RecentPatientsProps {
  recentPatients: Patient[] | undefined
  onViewAll: () => void
  onViewPatient: (patientId: string) => void // Kept for compatibility but unused in this component now
  onInvitePatient: () => void
}

export function RecentPatients({
  recentPatients,
  onViewAll,
  onInvitePatient
}: RecentPatientsProps) {
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)

  return (
    <>
      <Card className="border-none shadow-none bg-transparent sm:bg-white sm:border sm:shadow-sm">
        <CardHeader className="px-0 sm:px-6 pt-0 sm:pt-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 sm:h-5 sm:w-5" />
              Recent Patients
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={onViewAll} className="text-xs sm:text-sm">
              View All
            </Button>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Patients you've worked with recently
          </p>
        </CardHeader>
        <CardContent className="px-0 sm:px-6 space-y-3">
          {recentPatients && recentPatients.length > 0 ? (
            [...new Map(recentPatients.map(p => [p._id, p])).values()].map((patient) => (
              <div
                key={patient._id}
                className="group flex items-center gap-3 p-3 bg-white border rounded-xl hover:border-[#005b57]/30 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => setSelectedPatient(patient)}
              >
                <Avatar className="h-10 w-10 sm:h-12 sm:w-12 border-2 border-white shadow-sm">
                  <AvatarImage src={patient.imageUrl} />
                  <AvatarFallback className="bg-blue-50 text-blue-700 font-medium">
                    {patient.firstName?.[0]}{patient.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm sm:text-base truncate group-hover:text-[#005b57] transition-colors">
                    {patient.firstName} {patient.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {patient.stats.appointmentCount} appointments
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-[#005b57] transition-colors" />
              </div>
            ))
          ) : (
            <div className="text-center py-8 border-2 border-dashed rounded-xl bg-gray-50/50">
              <div className="w-12 h-12 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <Users className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-900">No patients yet</p>
              <p className="text-xs text-gray-500 mb-4">Start by inviting your first patient</p>
              <Button
                size="sm"
                variant="outline"
                onClick={onInvitePatient}
                className="bg-white"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Patient
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <PatientQuickViewSheet
        patient={selectedPatient}
        isOpen={!!selectedPatient}
        onClose={() => setSelectedPatient(null)}
      />
    </>
  )
}