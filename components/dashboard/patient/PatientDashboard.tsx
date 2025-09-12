'use client'
import React, { useState } from 'react'
import { useQuery as useQueryUntyped } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import type { Appointment } from '@/app/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Calendar, 
  Heart, 
  Activity, 
  FileText, 
  Video,
  Download,
  CreditCard
} from 'lucide-react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { usePatientDocuments } from '@/lib/hooks/usePatientDocuments'
import FileUpload from '@/components/ui/FileUpload'
import { PatientDashboardHeader } from './PatientDashboardHeader'
import { PatientStatsCards } from './PatientStatsCards'
import { HealthMonitoringDashboard } from './health/HealthMonitoringDashboard'
import { TreatmentPlanUpdateCard } from './TreatmentPlanSyncIndicator'


interface Exercise {
  _id: string;
  name: string;
  sets?: number;
  reps?: number;
  duration?: string;
  status: 'pending' | 'completed' | 'in_progress';
  videoUrl?: string;
}


interface ProgressEntry {
  _id: string;
  date: number;
  metric: string;
  value: number;
  notes?: string;
}

export function PatientDashboard() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('overview')

  // Fetch patient data - using untyped to avoid deep type instantiation
  const user = useQueryUntyped(api.users.getMyUser)
  const appointments = useQueryUntyped(api.appointments.getPatientAppointments, {}) as unknown as Appointment[] | undefined
  
  // Use empty arrays for now since these endpoints don't exist yet
  const exercises: Exercise[] = []
  const progress: ProgressEntry[] = []
  
  // Get patient profile ID from user
  const patientProfileId = user?.patientProfileId
  
  // Always call the hook, but pass undefined when patientProfileId is missing
  const { 
    documents, 
    uploadPatientDocument, 
    isLoadingDocuments
  } = usePatientDocuments({ patientProfileId: patientProfileId as Id<"patientProfiles"> | undefined })

  // Loading state
  if (!user) {
    return (
      <div className="p-6">
        <div className="space-y-6">
          <Skeleton className="h-12 w-[250px]" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-[180px]" />
            <Skeleton className="h-[180px]" />
            <Skeleton className="h-[180px]" />
          </div>
        </div>
      </div>
    )
  }

  // Stats for overview
  
const upcomingAppointments = appointments?.filter((a: Appointment) => new Date(a.startTime) > new Date()) || []
  const nextAppointment = upcomingAppointments[0]
  
  const stats = {
    upcomingCount: upcomingAppointments.length,
    nextAppointmentDate: nextAppointment?.startTime,
    activeTreatments: 0, // TODO: Add when treatment plans are implemented
    healthScore: 85, // TODO: Calculate based on progress data
    completedSessions: 0, // TODO: Add when session logs are implemented
  }

  const handleUploadDocument = async (files: File | File[] | null) => {
    if (patientProfileId && uploadPatientDocument && files) {
      try {
        const fileToUpload = Array.isArray(files) ? files[0] : files
        if (fileToUpload) {
          await uploadPatientDocument(fileToUpload, 'otherDocument', patientProfileId)
        }
      } catch (error) {
        console.error('Error uploading document:', error)
      }
    }
  }

  return (
    <div className="space-y-6">
      <PatientDashboardHeader />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full overflow-x-auto bg-[#005b57] text-white gap-2 rounded-md">
          <TabsTrigger value="overview" className="shrink-0 px-3 py-2 text-sm data-[state=active]:bg-[#D4FAE8] data-[state=active]:text-[#005b57]">Overview</TabsTrigger>
          <TabsTrigger value="appointments" className="shrink-0 px-3 py-2 text-sm data-[state=active]:bg-[#D4FAE8] data-[state=active]:text-[#005b57]">Appointments</TabsTrigger>
          <TabsTrigger value="exercises" className="shrink-0 px-3 py-2 text-sm data-[state=active]:bg-[#D4FAE8] data-[state=active]:text-[#005b57]">Exercises</TabsTrigger>
          <TabsTrigger value="progress" className="shrink-0 px-3 py-2 text-sm data-[state=active]:bg-[#D4FAE8] data-[state=active]:text-[#005b57]">Progress</TabsTrigger>
          <TabsTrigger value="documents" className="shrink-0 px-3 py-2 text-sm data-[state=active]:bg-[#D4FAE8] data-[state=active]:text-[#005b57]">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <PatientStatsCards 
            upcomingCount={stats.upcomingCount}
            nextAppointmentDate={stats.nextAppointmentDate}
            activeTreatments={stats.activeTreatments}
            healthScore={stats.healthScore}
            completedSessions={stats.completedSessions}
          />
          
          {/* Treatment Plan Updates */}
          <TreatmentPlanUpdateCard />
          
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Your latest updates and activities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {appointments?.slice(0, 3).map((appointment: Appointment) => (
                  <div key={appointment._id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Calendar className="h-5 w-5 text-gray-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Appointment with Physiotherapist
                      </p>
                      <p className="text-sm text-gray-500">
                        {format(new Date(appointment.startTime), 'PPP')} at {format(new Date(appointment.startTime), 'p')}
                      </p>
                    </div>
                    <Badge className="w-fit" variant={appointment.status === 'confirmed' ? 'default' : 'secondary'}>
                      {appointment.status}
                    </Badge>
                  </div>
                )) || (
                  <p className="text-sm text-gray-500">No recent appointments</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appointments" className="space-y-6">
          <Card>
                          <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Your Appointments</CardTitle>
                  <CardDescription>Manage your upcoming and past appointments</CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => router.push('/dashboard/patient/appointments')}
                >
                  View All
                </Button>
              </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {appointments?.map((appointment: Appointment) => (
                  <div key={appointment._id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-primary/10 rounded-full">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{appointment.serviceType}</p>
                        <p className="text-sm text-gray-500">
                          with Physiotherapist
                        </p>
                        <p className="text-sm text-gray-500">
                          {format(new Date(appointment.startTime), 'PPP')} at {format(new Date(appointment.startTime), 'p')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:self-auto">
                      <Badge className="w-fit" variant={appointment.status === 'confirmed' ? 'default' : 'secondary'}>
                        {appointment.status}
                      </Badge>
                      {appointment.status === 'confirmed' && (
                        <Button variant="outline" size="sm" onClick={() => router.push(`/video-call/${appointment._id}`)}>
                          <Video className="h-4 w-4 mr-2" />
                          Join Call
                        </Button>
                      )}
                    </div>
                  </div>
                )) || (
                  <p className="text-sm text-gray-500">No appointments scheduled</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="space-y-6">
          <HealthMonitoringDashboard />
        </TabsContent>

        <TabsContent value="exercises" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Assigned Exercises</CardTitle>
              <CardDescription>Track your exercise progress</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {exercises.length > 0 ? exercises.map((exercise: Exercise) => (
                  <div key={exercise._id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-primary/10 rounded-full">
                        <Activity className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{exercise.name}</p>
                        <p className="text-sm text-gray-500">
                          {exercise.sets} sets of {exercise.reps} reps
                        </p>
                        {exercise.duration && (
                          <p className="text-sm text-gray-500">
                            Duration: {exercise.duration} minutes
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:self-auto">
                      <Badge className="w-fit" variant={exercise.status === 'completed' ? 'default' : 'secondary'}>
                        {exercise.status}
                      </Badge>
                      {exercise.videoUrl && (
                        <Button variant="outline" size="sm" onClick={() => window.open(exercise.videoUrl)}>
                          <Video className="h-4 w-4 mr-2" />
                          Watch Video
                        </Button>
                      )}
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-gray-500">No exercises assigned yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recovery Progress</CardTitle>
              <CardDescription>Track your rehabilitation journey</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {progress.length > 0 ? progress.map((entry: ProgressEntry) => (
                  <div key={entry._id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-primary/10 rounded-full">
                        <Heart className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{entry.metric}</p>
                        <p className="text-sm text-gray-500">
                          {format(new Date(entry.date), 'PPP')}
                        </p>
                        {entry.notes && (
                          <p className="text-sm text-gray-500">{entry.notes}</p>
                        )}
                      </div>
                    </div>
                    <p className="font-medium sm:text-right">{entry.value}</p>
                  </div>
                )) : (
                  <p className="text-sm text-gray-500">No progress data available yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Invoices & Billing</CardTitle>
                <CardDescription>View and manage your invoices and payments</CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => router.push('/dashboard/patient/invoices')}
              >
                View All Invoices
              </Button>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Manage Your Invoices</h3>
                <p className="text-gray-600 mb-4">
                  View invoices sent by your physiotherapist, track payment status, and pay online.
                </p>
                <Button onClick={() => router.push('/dashboard/patient/invoices')}>
                  Open Invoice Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Medical Documents</CardTitle>
              <CardDescription>Upload and manage your medical documents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <FileUpload 
                  id="document-upload"
                  label="Upload Document"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={handleUploadDocument}
                  maxSizeInMB={5}
                />
                <p className="mt-2 text-sm text-gray-500">
                  Upload medical records, referral letters, or other documents
                </p>
              </div>
              
              <div className="space-y-3">
                {isLoadingDocuments ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : documents && documents.length > 0 ? (
                  documents.map((doc) => (
                    <div key={doc._id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-primary/10 rounded-full">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{doc.fileName}</p>
                          <p className="text-sm text-gray-500">
                            Type: {doc.documentType}
                          </p>
                          <p className="text-sm text-gray-500">
                            Uploaded: {format(new Date(doc.uploadedAt), 'PPP')}
                          </p>
                        </div>
                      </div>
                      <Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={() => window.open('#')}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No documents uploaded yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 