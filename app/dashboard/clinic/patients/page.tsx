'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Users,
  Search,
  Filter,
  Calendar,
  Activity,
  TrendingUp,
  UserPlus,
  Stethoscope,
  ArrowLeftRight
} from 'lucide-react'
import PatientClinicalView from '@/components/clinic/patients/PatientClinicalView'
import { TourGuide } from '@/components/shared/TourGuide'

import { useState, useMemo } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import type { Id } from '@/convex/_generated/dataModel'

// Correct interface matching backend response
interface ClinicPatient {
  _id: Id<'users'>
  firstName: string
  lastName: string
  email: string
  imageUrl?: string
  phoneNumber?: string
  primaryPhysiotherapist: {
    _id: Id<'users'>
    firstName: string
    lastName: string
  } | null
  relationship: {
    isPrimary: boolean
    startDate: number
    status: string
  }
  stats: {
    appointmentCount: number
    lastSessionDate?: number
  }
}

export default function ClinicPatientsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPhysio, setSelectedPhysio] = useState<string>('all')
  const [selectedPatientId, setSelectedPatientId] = useState<Id<'users'> | null>(null)

  const clinicPatients = useQuery(api.clinics.getClinicPatients) as ClinicPatient[] | undefined
  const patientStats = useQuery(api.clinics.getClinicPatientStats)
  const clinicStaff = useQuery(api.clinics.getClinicStaff)

  // Get unique physiotherapists for filter dropdown
  const uniquePhysiotherapists = useMemo(() => {
    if (!clinicPatients) return []
    const physioMap = new Map<string, { _id: Id<'users'>, firstName: string, lastName: string }>()

    clinicPatients.forEach(patient => {
      if (patient.primaryPhysiotherapist) {
        const id = patient.primaryPhysiotherapist._id
        if (!physioMap.has(id)) {
          physioMap.set(id, patient.primaryPhysiotherapist)
        }
      }
    })

    return Array.from(physioMap.values())
  }, [clinicPatients])

  // Count patients per physiotherapist
  const staffCount = clinicStaff?.length || 1

  if (clinicPatients === undefined || patientStats === undefined) {
    return (
      <div className="p-8">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  // Filter patients by search term and selected physiotherapist
  const filteredPatients = clinicPatients?.filter(patient => {
    // Search filter
    const matchesSearch =
      patient.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.email?.toLowerCase().includes(searchTerm.toLowerCase())

    // Physiotherapist filter
    const matchesPhysio =
      selectedPhysio === 'all' ||
      (selectedPhysio === 'unassigned' && !patient.primaryPhysiotherapist) ||
      patient.primaryPhysiotherapist?._id === selectedPhysio

    return matchesSearch && matchesPhysio
  }) || []

  return (
    <div className="p-8">
      <div className="space-y-6">
        {/* Header */}
        <div id="patients-header" className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Patients</h1>
            <p className="text-gray-600">Manage all patients across your clinic</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{patientStats?.totalPatients || 0}</div>
              <p className="text-xs text-muted-foreground">Across all physiotherapists</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Per Physiotherapist</CardTitle>
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.round((patientStats?.totalPatients || 0) / staffCount)}
              </div>
              <p className="text-xs text-muted-foreground">Average caseload</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Patients</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{patientStats?.activePatients || 0}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New This Month</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{patientStats?.newThisMonth || 0}</div>
              <p className="text-xs text-muted-foreground">Recently added</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div id="patients-search" className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={selectedPhysio} onValueChange={setSelectedPhysio}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All Physiotherapists" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Physiotherapists</SelectItem>
              <SelectItem value="unassigned">Unassigned Patients</SelectItem>
              {uniquePhysiotherapists.map((physio) => (
                <SelectItem key={physio._id} value={physio._id}>
                  {physio.firstName} {physio.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Patients List */}
        <Card id="patients-list">
          <CardHeader>
            <CardTitle>All Patients</CardTitle>
            <CardDescription>
              {filteredPatients.length} of {clinicPatients?.length || 0} patients
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredPatients.length > 0 ? (
              <div className="space-y-3">
                {filteredPatients.map((patient) => (
                  <div
                    key={patient._id}
                    className="grid grid-cols-[auto_1fr_1fr_auto] gap-4 items-center p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {/* Patient Info */}
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={patient.imageUrl} />
                        <AvatarFallback>
                          {patient.firstName?.[0]}{patient.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-sm">
                          {patient.firstName} {patient.lastName}
                        </h3>
                        <p className="text-xs text-gray-600">{patient.email}</p>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {patient.stats.appointmentCount} visits
                          </Badge>
                          {patient.stats.lastSessionDate && (
                            <span className="text-xs text-gray-500">
                              Last: {formatDistanceToNow(new Date(patient.stats.lastSessionDate), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Physiotherapist Info */}
                    <div className="border-l pl-4">
                      <p className="text-xs font-medium text-gray-500 mb-1">Assigned To:</p>
                      {patient.primaryPhysiotherapist ? (
                        <div>
                          <div className="flex items-center space-x-2">
                            <Stethoscope className="h-3 w-3 text-gray-400" />
                            <span className="text-sm font-medium">
                              {patient.primaryPhysiotherapist.firstName}{' '}
                              {patient.primaryPhysiotherapist.lastName}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 mt-1">
                            {patient.relationship.isPrimary && (
                              <Badge variant="default" className="text-xs">Primary</Badge>
                            )}
                            <span className="text-xs text-gray-500">
                              Since {format(new Date(patient.relationship.startDate), 'MMM yyyy')}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 italic">Unassigned</span>
                      )}
                    </div>

                    {/* Spacer */}
                    <div></div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2">
                      <Badge
                        variant={patient.relationship.status === 'active' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {patient.relationship.status}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPatientId(patient._id)}
                      >
                        View
                      </Button>
                      <Button variant="outline" size="sm">
                        <ArrowLeftRight className="h-3 w-3 mr-1" />
                        Reassign
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm ? 'No patients found' : 'No patients yet'}
                </h3>
                <p className="text-gray-600">
                  {searchTerm
                    ? 'Try adjusting your search terms'
                    : 'Patients will appear here once they join your clinic'
                  }
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PatientClinicalView
        patientId={selectedPatientId}
        isOpen={!!selectedPatientId}
        onClose={() => setSelectedPatientId(null)}
      />


      <TourGuide
        tourId="clinic-patients-tour"
        steps={[
          {
            target: "#patients-header",
            title: "Patient Directory",
            content: "Access and manage your entire patient database from this central hub.",
            position: "bottom"
          },
          {
            target: "#patients-search",
            title: "Find Patients",
            content: "Quickly search for patients or filter by assigned physiotherapist.",
            position: "bottom"
          },
          {
            target: "#patients-list",
            title: "Patient Records",
            content: "View patient details, check status, and manage assignments directly from the list.",
            position: "top"
          }
        ]}
      />
    </div >
  )
}
