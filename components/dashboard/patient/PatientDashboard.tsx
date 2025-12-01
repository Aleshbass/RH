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
  Clock,
  FileText,
  Video,
  Download,
  Plus,
  Upload,
  ChevronRight,
  MapPin,
  Phone,
  Mail
} from 'lucide-react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { usePatientDocuments } from '@/lib/hooks/usePatientDocuments'
import FileUpload from '@/components/ui/FileUpload'
import { TourGuide } from '@/components/shared/TourGuide'
import { InsightsSidebar } from '@/components/dashboard/shared/InsightsSidebar'

interface PatientDashboardProps {
  initialUser?: any;
  initialAppointments?: any[];
  initialStats?: any;
}

export function PatientDashboard({ initialUser, initialAppointments, initialStats }: PatientDashboardProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('home')

  // Fetch patient data with real-time updates, falling back to initial cached data
  const liveUser = useQueryUntyped(api.users.getMyUser)
  const user = liveUser || initialUser

  const liveAppointments = useQueryUntyped(api.appointments.getPatientAppointments, {})
  const appointments = (liveAppointments || initialAppointments) as unknown as Appointment[] | undefined

  const liveStats = useQueryUntyped(api.analytics.getPatientStats);
  const patientStats = liveStats || initialStats;

  // Get patient profile ID
  const patientProfileId = user?.patientProfileId

  const {
    documents,
    uploadPatientDocument,
    isLoadingDocuments
  } = usePatientDocuments({ patientProfileId: patientProfileId as Id<"patientProfiles"> | undefined })

  // Loading state
  if (!user) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  const upcomingAppointments = appointments?.filter((a: Appointment) => new Date(a.startTime) > new Date()).sort((a, b) => a.startTime - b.startTime) || []
  const nextAppointment = upcomingAppointments[0]
  const pastAppointments = appointments?.filter((a: Appointment) => new Date(a.startTime) <= new Date()) || []

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
    <div className="min-h-screen bg-gray-50 flex gap-6">
      <div className="flex-1 min-w-0 max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 space-y-3 sm:space-y-4 lg:space-y-6">

        {/* Hero Section - Welcome */}
        <div id="patient-dashboard-welcome" className="bg-white border-2 border-brand/20 rounded-2xl p-4 sm:p-6 lg:p-8 shadow-lg">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-1 sm:mb-2 text-gray-900">
            Welcome back, {user.firstName}!
          </h1>
          <p className="text-gray-600 text-xs sm:text-sm lg:text-base">
            Track your recovery journey and stay connected with your physiotherapist
          </p>
        </div>

        {/* Next Appointment Hero Card */}
        {nextAppointment && (
          <Card id="patient-next-appointment" className="border-2 border-brand/20 shadow-md hover:shadow-lg transition-shadow">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-brand/10 rounded-xl">
                    <Calendar className="h-6 w-6 text-brand" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Next Appointment</p>
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900">
                      {format(new Date(nextAppointment.startTime), 'EEEE, MMM d')}
                    </h3>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  {nextAppointment.status}
                </Badge>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Clock className="h-4 w-4" />
                  <span>{format(new Date(nextAppointment.startTime), 'h:mm a')}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <FileText className="h-4 w-4" />
                  <span>{nextAppointment.serviceType}</span>
                </div>
              </div>

              {nextAppointment.appointmentType === 'telehealth' && nextAppointment.status === 'confirmed' && (
                <Button
                  className="w-full bg-brand hover:bg-brand-dark text-white"
                  onClick={() => router.push(`/video-call/${nextAppointment._id}`)}
                >
                  <Video className="h-4 w-4 mr-2" />
                  Join Video Call
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Quick Stats */}
        <div id="patient-quick-stats" className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col">
                <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-brand mb-2" />
                <p className="text-2xl sm:text-3xl font-bold text-gray-900">{upcomingAppointments.length}</p>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">Upcoming</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 mb-2" />
                <p className="text-2xl sm:text-3xl font-bold text-gray-900">{documents?.length || 0}</p>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">Documents</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow col-span-2 sm:col-span-1">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col">
                <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 mb-2" />
                <p className="text-2xl sm:text-3xl font-bold text-gray-900">{pastAppointments.length}</p>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">Completed Sessions</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card id="patient-quick-actions">
          <CardHeader className="pb-2 sm:pb-3 px-4 sm:px-6 pt-4 sm:pt-6">
            <CardTitle className="text-sm sm:text-base lg:text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 px-4 sm:px-6 pb-4 sm:pb-6">
            <Button
              variant="outline"
              className="h-auto py-3 sm:py-4 flex-col gap-1.5 sm:gap-2 hover:bg-brand/5 hover:border-brand"
              onClick={() => router.push('/dashboard/patient/appointments')}
            >
              <div className="p-2 bg-brand/10 rounded-lg">
                <Plus className="h-5 w-5 text-brand" />
              </div>
              <span className="text-sm font-medium">Book Appointment</span>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2 hover:bg-blue-50 hover:border-blue-500"
              onClick={() => setActiveTab('documents')}
            >
              <div className="p-2 bg-blue-100 rounded-lg">
                <Upload className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium">Upload Document</span>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2 hover:bg-purple-50 hover:border-purple-500"
              onClick={() => router.push('/dashboard/patient/settings')}
            >
              <div className="p-2 bg-purple-100 rounded-lg">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <span className="text-sm font-medium">View Settings</span>
            </Button>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList id="patient-dashboard-tabs" className="w-full grid grid-cols-3 bg-white border rounded-lg p-1">
            <TabsTrigger value="home" className="data-[state=active]:bg-brand data-[state=active]:text-white">
              Home
            </TabsTrigger>
            <TabsTrigger value="appointments" className="data-[state=active]:bg-brand data-[state=active]:text-white">
              Appointments
            </TabsTrigger>
            <TabsTrigger value="documents" className="data-[state=active]:bg-brand data-[state=active]:text-white">
              Documents
            </TabsTrigger>
          </TabsList>

          {/* Home Tab */}
          <TabsContent value="home" className="space-y-4 mt-4">
            {/* Upcoming Appointments List */}
            {upcomingAppointments.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base sm:text-lg">Upcoming Appointments</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab('appointments')}
                      className="text-brand hover:text-brand-dark"
                    >
                      View All
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {upcomingAppointments.slice(1, 4).map((appointment: Appointment) => (
                    <div
                      key={appointment._id}
                      className="flex items-center justify-between p-3 sm:p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-2 bg-gray-100 rounded-lg shrink-0">
                          <Calendar className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm sm:text-base text-gray-900 truncate">
                            {appointment.serviceType}
                          </p>
                          <p className="text-xs sm:text-sm text-gray-500">
                            {format(new Date(appointment.startTime), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="ml-2 shrink-0 text-xs">
                        {appointment.status}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* No Appointments State */}
            {upcomingAppointments.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="p-4 bg-gray-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <Calendar className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Upcoming Appointments</h3>
                  <p className="text-gray-600 mb-4 text-sm">
                    Book your next session with your physiotherapist
                  </p>
                  <Button
                    className="bg-brand hover:bg-brand-dark text-white"
                    onClick={() => router.push('/dashboard/patient/appointments')}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Book Appointment
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Appointments Tab */}
          <TabsContent value="appointments" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>All Appointments</CardTitle>
                <CardDescription>View and manage your appointments</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {appointments && appointments.length > 0 ? (
                  appointments.map((appointment: Appointment) => (
                    <div
                      key={appointment._id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg gap-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div className="p-2 bg-brand/10 rounded-lg shrink-0">
                          <Calendar className="h-5 w-5 text-brand" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900">{appointment.serviceType}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {format(new Date(appointment.startTime), 'EEEE, MMMM d, yyyy')}
                          </p>
                          <p className="text-sm text-gray-500">
                            {format(new Date(appointment.startTime), 'h:mm a')} - {format(new Date(appointment.endTime), 'h:mm a')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                        <Badge
                          variant={appointment.status === 'confirmed' ? 'default' : 'secondary'}
                          className="shrink-0"
                        >
                          {appointment.status}
                        </Badge>
                        {appointment.appointmentType === 'telehealth' && appointment.status === 'confirmed' && new Date(appointment.startTime) > new Date() && (
                          <Button
                            size="sm"
                            className="bg-brand hover:bg-brand-dark text-white shrink-0"
                            onClick={() => router.push(`/video-call/${appointment._id}`)}
                          >
                            <Video className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Join</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No appointments found</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Medical Documents</CardTitle>
                <CardDescription>Upload and manage your medical records</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Upload Section */}
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center bg-gray-50 hover:bg-gray-100 transition-colors">
                  <FileUpload
                    id="document-upload"
                    label="Upload Document"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={handleUploadDocument}
                    maxSizeInMB={5}
                  />
                  <p className="mt-3 text-sm text-gray-500">
                    Supports: PDF, DOC, DOCX, JPG, PNG (Max 5MB)
                  </p>
                </div>

                {/* Documents List */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm text-gray-700">Your Documents</h4>
                  {isLoadingDocuments ? (
                    <div className="space-y-2">
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  ) : documents && documents.length > 0 ? (
                    documents.map((doc) => (
                      <div
                        key={doc._id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="p-2 bg-blue-100 rounded-lg shrink-0">
                            <FileText className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 truncate">{doc.fileName}</p>
                            <p className="text-sm text-gray-500">
                              {format(new Date(doc.uploadedAt), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-2 shrink-0"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">No documents uploaded yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <TourGuide
        tourId="patient-dashboard-tour"
        steps={[
          {
            target: "#patient-dashboard-welcome",
            title: "Welcome Home",
            content: "This is your personal recovery dashboard. Track your progress and stay updated.",
            position: "bottom",
          },
          {
            target: "#nav-item-find-a-physio",
            title: "Find a Physio",
            content: "Browse and connect with qualified physiotherapists for your needs.",
            position: "right",
          },
          {
            target: "#nav-item-appointments",
            title: "Appointments",
            content: "Manage your schedule, view upcoming sessions, and join video calls.",
            position: "right",
          },
          {
            target: "#nav-item-my-physiotherapist",
            title: "My Physiotherapist",
            content: "Access your treatment plans, clinical records, and communicate with your physio.",
            position: "right",
          },
          {
            target: "#patient-next-appointment",
            title: "Next Session",
            content: "Quickly see when your next appointment is and join if it's a video call.",
            position: "bottom",
          },
          {
            target: "#patient-quick-stats",
            title: "At a Glance",
            content: "See your upcoming appointments, documents, and completed sessions.",
            position: "top",
          },
          {
            target: "#patient-quick-actions",
            title: "Quick Actions",
            content: "Fast access to common tasks like booking appointments or uploading documents.",
            position: "top",
          },
          {
            target: "#nav-item-settings",
            title: "Settings",
            content: "Manage your profile, preferences, and account settings.",
            position: "right",
          },
        ]}
      />
      <InsightsSidebar
        role="patient"
        stats={patientStats}
        className="border-l border-gray-200 h-[calc(100vh-4rem)] sticky top-0"
      />
    </div>
  )
}