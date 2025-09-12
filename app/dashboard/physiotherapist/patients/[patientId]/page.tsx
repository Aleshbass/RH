'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuth } from '@clerk/nextjs';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { Loader2, ArrowLeft, Calendar, FileText, Phone, Mail, User, Heart, Pill, AlertTriangle, Plus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { Id } from '@/convex/_generated/dataModel';
import { InteractiveTreatmentPlan } from '@/components/dashboard/physiotherapist/treatment/InteractiveTreatmentPlan';

// Type definitions for patient data structures
interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  imageUrl?: string;
  phoneNumber?: string;
  role: 'patient' | 'physiotherapist' | 'admin';
}


interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

interface PatientProfile {
  dateOfBirth?: string;
  gender?: string;
  emergencyContact?: EmergencyContact;
  medicalHistory?: string[];
  currentMedications?: string[];
  allergies?: string[];
}

interface Appointment {
  _id: string;
  startTime: number;
  endTime: number;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'cancelled_by_patient' | 'cancelled_by_therapist' | 'no-show';
  serviceType: string;
  type: string;
  notes?: string;
  notesForTherapist?: string;
}

interface SessionLog {
  _id: string;
  sessionDate: number;
  subjectiveAssessment?: string;
  objectiveAssessment?: string;
  treatmentAdministered?: string;
  planForNextSession?: string;
}

interface TreatmentPlan {
  _id: string;
  title: string;
  description?: string;
  startDate: number;
  endDate?: number;
  goals: string[];
  status: 'active' | 'completed' | 'paused';
}

interface PatientDocument {
  _id: string;
  fileName: string;
  documentType: string;
  uploadedAt: number;
  fileSize: number;
  downloadUrl: string;
}

interface PatientRelationship {
  isPrimaryPhysiotherapist: boolean;
  status: 'active' | 'inactive' | 'archived' | string;
  startDate: number;
}

interface PatientDetailsData {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  imageUrl?: string;
  phoneNumber?: string;
  relationship: PatientRelationship;
  patientProfile?: PatientProfile;
  appointments: Appointment[];
  sessionLogs: SessionLog[];
  treatmentPlans: TreatmentPlan[];
}

export default function PatientDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const { isLoaded, isSignedIn } = useAuth();
  const patientId = params.patientId as string;

  // Get current user
  const currentUser = useQuery(api.users.getMyUser) as User | undefined;
  
  // Get patient details
  const detailsRaw = useQuery(
    api.patients.getPatientDetails,
    patientId ? { patientId: patientId as Id<'users'> } : 'skip'
  ) as {
    patient?: {
      _id: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      imageUrl?: string;
      phoneNumber?: string;
    };
    profile?: {
      dateOfBirth?: number;
      gender?: string;
      emergencyContact?: string;
      medicalHistory?: string[];
      currentConditions?: string[];
      currentMedications?: string[];
      medications?: string[];
      allergies?: string[];
    };
    relationship?: unknown;
    appointments?: unknown[];
    sessionLogs?: unknown[];
    treatmentPlans?: Array<{
      _id: string;
      title?: string;
      description?: string;
      startDate?: number;
      endDate?: number;
      goals?: Array<{ description: string }>;
      status?: string;
    }>;
  } | undefined;

  // Map backend shape { patient, profile, relationship, appointments, sessionLogs, treatmentPlans }
  // to the UI view model expected by this page
  type RawTreatmentPlan = {
    _id: string;
    title?: string;
    description?: string;
    startDate?: number;
    endDate?: number;
    goals?: Array<string | { description: string }>;
    status?: string;
  };

  // Narrowing helper for relationship object
  const isRelationshipObject = (
    v: unknown
  ): v is { isPrimaryPhysiotherapist?: boolean; status?: string; startDate?: number } => {
    return typeof v === 'object' && v !== null && 'status' in (v as Record<string, unknown>);
  };

  const patientData = useMemo(() => {
    if (!detailsRaw?.patient) return null;
    const p = detailsRaw.patient;
    const prof = detailsRaw.profile || undefined;
    // Map relationship into a safe view model without using `any`
    const rawRel: unknown = detailsRaw.relationship;
    const relationship: PatientRelationship = isRelationshipObject(rawRel)
      ? {
          isPrimaryPhysiotherapist: Boolean(rawRel.isPrimaryPhysiotherapist),
          status: (rawRel.status as PatientRelationship['status']) || 'active',
          startDate: (rawRel.startDate as number) || Date.now(),
        }
      : {
          isPrimaryPhysiotherapist: false,
          status: (typeof rawRel === 'string' ? rawRel : 'active') as PatientRelationship['status'],
          startDate: Date.now(),
        };

    return {
      _id: p._id,
      firstName: p.firstName || 'Unknown',
      lastName: p.lastName || 'Patient',
      email: p.email || 'no-email@example.com',
      imageUrl: p.imageUrl,
      phoneNumber: p.phoneNumber,
      relationship,
      patientProfile: prof ? {
        dateOfBirth: prof.dateOfBirth,
        gender: prof.gender,
        emergencyContact: prof.emergencyContact,
        medicalHistory: prof.medicalHistory || prof.currentConditions || [],
        currentMedications: prof.currentMedications || prof.medications || [],
        allergies: prof.allergies || [],
      } : undefined,
      appointments: detailsRaw.appointments || [],
      sessionLogs: detailsRaw.sessionLogs || [],
      treatmentPlans: (detailsRaw.treatmentPlans || []).map((tp: RawTreatmentPlan) => ({
        _id: tp._id,
        title: tp.title || 'Untitled Plan',
        description: tp.description,
        startDate: tp.startDate || Date.now(),
        endDate: tp.endDate,
        goals: (tp.goals || []).map((g) => typeof g === 'string' ? g : g.description),
        status: tp.status || 'active',
      })),
    } as PatientDetailsData;
  }, [detailsRaw]);

  // Backwards-compatible alias for existing JSX that references `patientDetails`
  const patientDetails = patientData as PatientDetailsData | null;

  // Patient documents for physio
  const patientDocs = useQuery(
    api.files.getPatientDocumentsForPhysio,
    patientId ? { patientUserId: patientId as Id<'users'> } : 'skip'
  ) as PatientDocument[] | undefined;

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
  if (!isLoaded || currentUser === undefined || patientDetails === null) {
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
        <Button className="flex items-center gap-2" onClick={() => router.push(`/dashboard/physiotherapist/appointments?patient=${patientId}`)}>
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
                {patientDetails.sessionLogs.slice(0, 3).map((session: SessionLog) => (
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
            {patientDetails.appointments.map((appointment: Appointment) => (
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
            {patientDetails.sessionLogs.map((session: SessionLog) => (
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
          <InteractiveTreatmentPlan patientId={patientId} />
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
                    {patientDetails.patientProfile?.medicalHistory.map((condition: string, index: number) => (
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
                    {patientDetails.patientProfile.currentMedications.map((medication: string, index: number) => (
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
                    {patientDetails.patientProfile.allergies.map((allergy: string, index: number) => (
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
                  {patientDocs.map((doc: PatientDocument) => (
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