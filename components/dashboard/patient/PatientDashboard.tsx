'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
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
import { useState } from 'react'
import { PatientDashboardHeader } from './PatientDashboardHeader'
import { PatientStatsCards } from './PatientStatsCards'


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

  // Fetch patient data
  const user = useQuery(api.users.getMyUser)
  const appointments = useQuery(api.appointments.getPatientAppointments, {})
  
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
  const upcomingAppointments = appointments?.filter(a => new Date(a.startTime) > new Date()) || []
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
    <div className="flex-1 space-y-6 p-6">
      <PatientDashboardHeader />
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="exercises">Exercises</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <PatientStatsCards 
            upcomingCount={stats.upcomingCount}
            nextAppointmentDate={stats.nextAppointmentDate}
            activeTreatments={stats.activeTreatments}
            healthScore={stats.healthScore}
            completedSessions={stats.completedSessions}
          />
          
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Your latest updates and activities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {appointments?.slice(0, 3).map(appointment => (
                  <div key={appointment._id} className="flex items-center space-x-4">
                    <Calendar className="h-5 w-5 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium">
                        Appointment with Physiotherapist
                      </p>
                      <p className="text-sm text-gray-500">
                        {format(new Date(appointment.startTime), 'PPP')} at {format(new Date(appointment.startTime), 'p')}
                      </p>
                    </div>
                    <Badge variant={appointment.status === 'confirmed' ? 'default' : 'secondary'}>
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
                {appointments?.map(appointment => (
                  <div key={appointment._id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
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
                    <div className="flex items-center space-x-2">
                      <Badge variant={appointment.status === 'confirmed' ? 'default' : 'secondary'}>
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

        <TabsContent value="exercises" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Assigned Exercises</CardTitle>
              <CardDescription>Track your exercise progress</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {exercises.length > 0 ? exercises.map((exercise: Exercise) => (
                  <div key={exercise._id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
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
                    <div className="flex items-center space-x-2">
                      <Badge variant={exercise.status === 'completed' ? 'default' : 'secondary'}>
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
                  <div key={entry._id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
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
                    <div className="text-right">
                      <p className="font-medium">{entry.value}</p>
                    </div>
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
                    <div key={doc._id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
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
                      <Button variant="outline" size="sm" onClick={() => window.open('#')}>
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