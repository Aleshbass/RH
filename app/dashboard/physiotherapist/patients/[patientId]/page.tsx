'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuth } from '@clerk/nextjs';
import { useRouter, useParams } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2, ArrowLeft, Calendar, FileText, Phone, Mail, User, Heart, Pill, AlertTriangle, Plus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { Id } from '@/convex/_generated/dataModel';

// Simple type definition to avoid complex inference
type PatientDoc = any;

interface PatientDetails {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  imageUrl?: string;
  phoneNumber?: string;
  relationship: {
    _id: string;
    patientId: string;
    physiotherapistId: string;
    clinicId: string;
    status: 'active' | 'inactive' | 'archived';
    isPrimaryPhysiotherapist: boolean;
    startDate: number;
    endDate?: number;
    notes?: string;
  };
  patientProfile?: {
    dateOfBirth?: string;
    gender?: string;
    emergencyContact?: {
      name: string;
      phone: string;
      relationship: string;
    };
    medicalHistory?: string[];
    currentMedications?: string[];
    allergies?: string[];
  };
  appointments: Array<{
    _id: string;
    startTime: number;
    endTime: number;
    serviceType: string;
    status: string;
    notesForPatient?: string;
    notesForTherapist?: string;
  }>;
  sessionLogs: Array<{
    _id: string;
    sessionDate: number;
    subjectiveAssessment?: string;
    objectiveAssessment?: string;
    treatmentAdministered?: string;
    planForNextSession?: string;
  }>;
  treatmentPlans: Array<{
    _id: string;
    title: string;
    description?: string;
    startDate: number;
    endDate?: number;
    goals: string[];
    status: string;
  }>;
}

export default function PatientDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const { isLoaded, isSignedIn } = useAuth();
  const patientId = params.patientId as string;

  // Get current user - use explicit any to avoid deep type instantiation
  const currentUser: any = useQuery(api.users.getMyUser);
  
  // Get patient details - use function aliasing to avoid deep type instantiation
  const getPatientDetailsQuery = api.patients.getPatientDetails;
  const patientDetails: any = useQuery(
    getPatientDetailsQuery,
    patientId ? { patientId: patientId as Id<'users'> } : 'skip'
  );

  // Patient documents for physio - use function aliasing to avoid deep type instantiation
  const getPatientDocsQuery = api.files.getPatientDocumentsForPhysio;
  const patientDocs: any = useQuery(
    getPatientDocsQuery,
    patientId ? { patientUserId: patientId as Id<'users'> } : 'skip'
  );

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  // Redirect if not physiotherapist
  useEffect(() => {
    if (currentUser && currentUser.role !== 'physiotherapist') {
      router.push('/dashboard');
    }
  }, [currentUser, router]);

  // Loading state
  if (!isLoaded || currentUser === undefined || patientDetails === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading patient details...</p>
        </div>
      </div>
    );
  }

  const getInitials = (firstName?: string, lastName?: string): string => {
    if (!firstName || !lastName) return '??';
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled_by_patient':
      case 'cancelled_by_therapist':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {patientDetails.firstName} {patientDetails.lastName}
          </h1>
          <p className="text-gray-600">Patient Details & Treatment History</p>
        </div>
        <Button className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Schedule Appointment
        </Button>
      </div>

      {/* Patient Overview */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-6">
            <Avatar className="h-20 w-20">
              <AvatarImage 
                src={patientDetails.imageUrl} 
                alt={`${patientDetails.firstName} ${patientDetails.lastName}`} 
              />
              <AvatarFallback className="text-lg">
                {getInitials(patientDetails.firstName, patientDetails.lastName)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  {patientDetails.firstName} {patientDetails.lastName}
                </h2>
                {patientDetails.relationship.isPrimaryPhysiotherapist && (
                  <Badge variant="secondary">Primary Therapist</Badge>
                )}
                <Badge className="bg-green-100 text-green-800">
                  {patientDetails.relationship.status}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail className="h-4 w-4" />
                  <span className="text-sm">{patientDetails.email}</span>
                </div>
                {patientDetails.phoneNumber && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="h-4 w-4" />
                    <span className="text-sm">{patientDetails.phoneNumber}</span>
                  </div>
                )}
                {patientDetails.patientProfile?.dateOfBirth && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <User className="h-4 w-4" />
                    <span className="text-sm">
                      Born: {format(new Date(patientDetails.patientProfile.dateOfBirth), 'MMM dd, yyyy')}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">
                    Patient since: {format(new Date(patientDetails.relationship.startDate), 'MMM dd, yyyy')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Information Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="sessions">Session Logs</TabsTrigger>
          <TabsTrigger value="treatment">Treatment Plans</TabsTrigger>
          <TabsTrigger value="medical">Medical Info</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Appointments</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{patientDetails.appointments.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Session Logs</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{patientDetails.sessionLogs.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Treatment Plans</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{patientDetails.treatmentPlans.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {patientDetails.sessionLogs.slice(0, 3).map((session: any) => (
                  <div key={session._id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        Session on {format(new Date(session.sessionDate), 'MMM dd, yyyy')}
                      </p>
                      {session.treatmentAdministered && (
                        <p className="text-sm text-gray-600 mt-1">
                          {session.treatmentAdministered.substring(0, 100)}...
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appointments" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Appointment History</h3>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Appointment
            </Button>
          </div>
          <div className="space-y-3">
            {patientDetails.appointments.map((appointment: any) => (
              <Card key={appointment._id}>
                <CardContent className="pt-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <p className="font-medium text-gray-900">
                          {format(new Date(appointment.startTime), 'PPP')}
                        </p>
                        <Badge className={getStatusColor(appointment.status)}>
                          {appointment.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">
                        <strong>Service:</strong> {appointment.serviceType}
                      </p>
                      <p className="text-sm text-gray-600">
                        <strong>Time:</strong> {format(new Date(appointment.startTime), 'p')} - {format(new Date(appointment.endTime), 'p')}
                      </p>
                      {appointment.notesForTherapist && (
                        <p className="text-sm text-gray-600 mt-2">
                          <strong>Notes:</strong> {appointment.notesForTherapist}
                        </p>
                      )}
                    </div>
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Session Logs</h3>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Session Log
            </Button>
          </div>
          <div className="space-y-3">
            {patientDetails.sessionLogs.map((session: any) => (
              <Card key={session._id}>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <h4 className="font-medium text-gray-900">
                        Session - {format(new Date(session.sessionDate), 'PPP')}
                      </h4>
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    </div>
                    
                    {session.subjectiveAssessment && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">Subjective Assessment:</p>
                        <p className="text-sm text-gray-600">{session.subjectiveAssessment}</p>
                      </div>
                    )}
                    
                    {session.objectiveAssessment && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">Objective Assessment:</p>
                        <p className="text-sm text-gray-600">{session.objectiveAssessment}</p>
                      </div>
                    )}
                    
                    {session.treatmentAdministered && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">Treatment Administered:</p>
                        <p className="text-sm text-gray-600">{session.treatmentAdministered}</p>
                      </div>
                    )}
                    
                    {session.planForNextSession && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">Plan for Next Session:</p>
                        <p className="text-sm text-gray-600">{session.planForNextSession}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="treatment" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Treatment Plans</h3>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Treatment Plan
            </Button>
          </div>
          <div className="space-y-3">
            {patientDetails.treatmentPlans.map((plan: any) => (
              <Card key={plan._id}>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900">{plan.title}</h4>
                        <p className="text-sm text-gray-600">
                          {format(new Date(plan.startDate), 'MMM dd, yyyy')} - 
                          {plan.endDate ? format(new Date(plan.endDate), 'MMM dd, yyyy') : 'Ongoing'}
                        </p>
                      </div>
                      <Badge>{plan.status}</Badge>
                    </div>
                    
                    {plan.description && (
                      <p className="text-sm text-gray-600">{plan.description}</p>
                    )}
                    
                    {plan.goals.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">Goals:</p>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {plan.goals.map((goal: any, index: any) => (
                            <li key={index} className="flex items-start gap-2">
                              <span className="text-blue-500">•</span>
                              {goal}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="medical" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Medical History */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Heart className="h-5 w-5 text-red-500" />
                <CardTitle>Medical History</CardTitle>
              </CardHeader>
              <CardContent>
                {patientDetails.patientProfile?.medicalHistory && patientDetails.patientProfile.medicalHistory.length > 0 ? (
                  <ul className="space-y-2">
                    {patientDetails.patientProfile.medicalHistory.map((condition: any, index: any) => (
                      <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                        <span className="text-red-500">•</span>
                        {condition}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No medical history recorded</p>
                )}
              </CardContent>
            </Card>

            {/* Current Medications */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Pill className="h-5 w-5 text-blue-500" />
                <CardTitle>Current Medications</CardTitle>
              </CardHeader>
              <CardContent>
                {patientDetails.patientProfile?.currentMedications && patientDetails.patientProfile.currentMedications.length > 0 ? (
                  <ul className="space-y-2">
                    {patientDetails.patientProfile.currentMedications.map((medication: any, index: any) => (
                      <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        {medication}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No medications recorded</p>
                )}
              </CardContent>
            </Card>

            {/* Allergies */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <CardTitle>Allergies</CardTitle>
              </CardHeader>
              <CardContent>
                {patientDetails.patientProfile?.allergies && patientDetails.patientProfile.allergies.length > 0 ? (
                  <ul className="space-y-2">
                    {patientDetails.patientProfile.allergies.map((allergy: any, index: any) => (
                      <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                        <span className="text-orange-500">•</span>
                        {allergy}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No allergies recorded</p>
                )}
              </CardContent>
            </Card>

            {/* Emergency Contact */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Phone className="h-5 w-5 text-green-500" />
                <CardTitle>Emergency Contact</CardTitle>
              </CardHeader>
              <CardContent>
                {patientDetails.patientProfile?.emergencyContact ? (
                  <div className="space-y-2">
                    <p className="text-sm">
                      <strong>Name:</strong> {patientDetails.patientProfile.emergencyContact.name}
                    </p>
                    <p className="text-sm">
                      <strong>Phone:</strong> {patientDetails.patientProfile.emergencyContact.phone}
                    </p>
                    <p className="text-sm">
                      <strong>Relationship:</strong> {patientDetails.patientProfile.emergencyContact.relationship}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No emergency contact recorded</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {patientDocs && patientDocs.length > 0 ? (
                <ul className="space-y-2">
                  {patientDocs.map((doc: PatientDoc) => (
                    <li key={doc._id} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-gray-500" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{doc.fileName}</p>
                          <p className="text-xs text-gray-500">{doc.documentType} - {(doc.fileSize / 1024).toFixed(2)} KB</p>
                        </div>
                      </div>
                      <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No documents uploaded.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 