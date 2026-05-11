'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuth } from '@clerk/nextjs';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Loader2, ArrowLeft, Calendar, FileText, Phone, Mail, User, Heart, Pill, AlertTriangle, Plus, Download, Edit, CreditCard, Video, Package, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { Id } from '@/convex/_generated/dataModel';
import { InteractiveTreatmentPlan } from '@/components/dashboard/physiotherapist/treatment/InteractiveTreatmentPlan';
import EditPatientModal from '@/components/dashboard/physiotherapist/EditPatientModal';
import { CreateInvoiceModal } from '@/components/dashboard/physiotherapist/modals/CreateInvoiceModal';
import { CreateVideoCallModal } from '@/components/dashboard/physiotherapist/modals/CreateVideoCallModal';
import { StartConversationModal } from '@/components/dashboard/physiotherapist/modals/StartConversationModal';
import { UploadDocumentModal } from '@/components/dashboard/physiotherapist/modals/UploadDocumentModal';
import { SessionLogModal } from '@/components/dashboard/physiotherapist/SessionLogModal';
import SchedulePatientAppointmentModal from '@/components/dashboard/physiotherapist/modals/SchedulePatientAppointmentModal';
import { toast } from 'sonner';
import { TourGuide } from '@/components/shared/TourGuide';

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
  referralSource?: string;
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
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isVideoCallModalOpen, setIsVideoCallModalOpen] = useState(false);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

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
      referralSource?: string;
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

  // Active package booking for this patient
  const activePackage = useQuery(
    api.patients.getActivePackageBooking,
    patientId ? { patientId: patientId as Id<'users'> } : 'skip'
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex-1 min-w-0" id="patient-detail-header">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
            {patientDetails.firstName} {patientDetails.lastName}
          </h1>
          <p className="text-sm sm:text-base text-gray-600">Patient Details & Treatment History</p>
        </div>
        <Button id="schedule-appointment-btn" className="flex items-center gap-2 w-full sm:w-auto" onClick={() => setIsScheduleModalOpen(true)}>
          <Calendar className="h-4 w-4" />
          <span className="sm:inline">Schedule Appointment</span>
        </Button>
      </div>

      {/* Patient Overview */}
      <Card id="patient-info-card">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
            <Avatar className="h-16 w-16 sm:h-20 sm:w-20">
              <AvatarImage
                src={patientDetails.imageUrl}
                alt={`${patientDetails.firstName} ${patientDetails.lastName}`}
              />
              <AvatarFallback className="text-base sm:text-lg">
                {getInitials(patientDetails.firstName, patientDetails.lastName)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 w-full min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
                  {patientDetails.firstName} {patientDetails.lastName}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {patientDetails.relationship.isPrimaryPhysiotherapist && (
                    <Badge variant="secondary" className="text-xs">Primary Therapist</Badge>
                  )}
                  <Badge className="bg-green-100 text-green-800 text-xs">
                    {patientDetails.relationship.status}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditModalOpen(true)}
                    className="ml-auto sm:ml-2"
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
                <div className="flex items-center gap-2 text-gray-600 min-w-0">
                  <Mail className="h-4 w-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm truncate">{patientDetails.email}</span>
                </div>
                {patientDetails.phoneNumber && (
                  <div className="flex items-center gap-2 text-gray-600 min-w-0">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <span className="text-xs sm:text-sm truncate">{patientDetails.phoneNumber}</span>
                  </div>
                )}
                {patientDetails.patientProfile?.gender && (
                  <div className="flex items-center gap-2 text-gray-600 min-w-0">
                    <User className="h-4 w-4 flex-shrink-0" />
                    <span className="text-xs sm:text-sm truncate capitalize">
                      {patientDetails.patientProfile.gender === 'prefer_not_to_say'
                        ? 'Prefer not to say'
                        : patientDetails.patientProfile.gender}
                    </span>
                  </div>
                )}
                {patientDetails.patientProfile?.dateOfBirth && (
                  <div className="flex items-center gap-2 text-gray-600 min-w-0">
                    <Calendar className="h-4 w-4 flex-shrink-0" />
                    <span className="text-xs sm:text-sm truncate">
                      Born: {format(new Date(patientDetails.patientProfile.dateOfBirth), 'MMM dd, yyyy')}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-gray-600 min-w-0">
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm truncate">
                    Since: {format(new Date(patientDetails.relationship.startDate), 'MMM dd, yyyy')}
                  </span>
                </div>
                {patientDetails.patientProfile?.referralSource && (
                  <div className="flex items-center gap-2 text-gray-600 min-w-0">
                    <User className="h-4 w-4 flex-shrink-0" />
                    <span className="text-xs sm:text-sm truncate">
                      Referral: {patientDetails.patientProfile.referralSource}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Active Package Card ── */}
      {activePackage && (
        <Card className="border-l-4 border-l-teal-500 bg-teal-50/40">
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {/* Icon + title */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                  <Package className="h-5 w-5 text-teal-700" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide">Active Package</p>
                  <p className="text-sm font-bold text-gray-900 truncate">
                    {activePackage.conditionLabel} — {activePackage.packageSessions}-Session Package
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {activePackage.packageDiscountPercent > 0 && `${activePackage.packageDiscountPercent}% discount · `}
                    Paid {activePackage.paidAt ? new Date(activePackage.paidAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </p>
                </div>
              </div>

              {/* Progress */}
              <div className="flex-shrink-0 w-full sm:w-52">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Sessions remaining</span>
                  <span className="font-semibold">{activePackage.sessionsRemaining} / {activePackage.packageSessions}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all"
                    style={{ width: `${Math.round(((activePackage.packageSessions - activePackage.sessionsRemaining) / activePackage.packageSessions) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {activePackage.packageSessions - activePackage.sessionsRemaining} of {activePackage.packageSessions} sessions used
                </p>
              </div>

              {/* CTA */}
              {activePackage.treatmentPlanId && (
                <div className="flex-shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-teal-500 inline mr-1" />
                  <span className="text-xs text-teal-700 font-medium">Plan created</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Information Tabs */}
      <Tabs defaultValue="appointments" className="space-y-4" id="patient-sections-tabs">
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <TabsList className="inline-flex min-w-max gap-1 bg-gray-100/50 p-1 rounded-xl h-auto">
            <TabsTrigger id="tab-appointments" value="appointments" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#005b57] px-3 py-2 text-sm whitespace-nowrap">Appointments</TabsTrigger>
            <TabsTrigger id="tab-clinical" value="clinical" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#005b57] px-3 py-2 text-sm whitespace-nowrap">Clinical</TabsTrigger>
            <TabsTrigger id="tab-treatment" value="treatment" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#005b57] px-3 py-2 text-sm whitespace-nowrap">Treatment</TabsTrigger>
            <TabsTrigger id="tab-communication" value="communication" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#005b57] px-3 py-2 text-sm whitespace-nowrap">Communication</TabsTrigger>
            <TabsTrigger id="tab-billing" value="billing" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#005b57] px-3 py-2 text-sm whitespace-nowrap">Billing</TabsTrigger>
            <TabsTrigger id="tab-documents" value="documents" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#005b57] px-3 py-2 text-sm whitespace-nowrap">Documents</TabsTrigger>
          </TabsList>
        </div>

        {/* Appointments Tab */}
        <TabsContent value="appointments" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Appointment History</h3>
            <Button className="bg-[#005b57] hover:bg-[#00443e]">
              <Plus className="h-4 w-4 mr-2" />
              New Appointment
            </Button>
          </div>
          <div className="space-y-3">
            {patientDetails.appointments.length > 0 ? (
              patientDetails.appointments.map((appointment: Appointment) => (
                <Card key={appointment._id} className="border-l-4 border-l-[#005b57] shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <p className="font-semibold text-gray-900">
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
                          <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-2 rounded">
                            <strong>Notes:</strong> {appointment.notesForTherapist}
                          </p>
                        )}
                      </div>
                      <Button variant="ghost" size="sm">
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed">
                <Calendar className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">No appointments recorded</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Clinical Tab (Assessments, Reports, Medical History) */}
        <TabsContent value="clinical" className="space-y-6">
          <Tabs defaultValue="assessments" className="w-full">
            <div className="flex items-center justify-between mb-4">
              <TabsList className="bg-transparent p-0 gap-4 border-b w-full justify-start rounded-none h-auto">
                <TabsTrigger value="assessments" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-[#005b57] data-[state=active]:shadow-none rounded-none px-1 pb-2 data-[state=active]:text-[#005b57]">Assessments</TabsTrigger>
                <TabsTrigger value="reports" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-[#005b57] data-[state=active]:shadow-none rounded-none px-1 pb-2 data-[state=active]:text-[#005b57]">Reports</TabsTrigger>
                <TabsTrigger value="medical" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-[#005b57] data-[state=active]:shadow-none rounded-none px-1 pb-2 data-[state=active]:text-[#005b57]">Medical History</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="assessments" className="space-y-4">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="bg-[#005b57] hover:bg-[#00443e]"
                  onClick={() => setIsAssessmentModalOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Assessment
                </Button>
              </div>
              <div className="space-y-4">
                {patientDetails.sessionLogs.length > 0 ? (
                  patientDetails.sessionLogs.map((session: SessionLog) => (
                    <Card key={session._id} className="overflow-hidden">
                      <CardHeader className="bg-gray-50 py-3 border-b">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-base font-medium flex items-center gap-2">
                            <FileText className="h-4 w-4 text-[#005b57]" />
                            Assessment - {format(new Date(session.sessionDate), 'PPP')}
                          </CardTitle>
                          <Button variant="ghost" size="sm" className="h-8">Edit</Button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {session.subjectiveAssessment && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Subjective</p>
                              <p className="text-sm text-gray-700 bg-gray-50/50 p-3 rounded-lg">{session.subjectiveAssessment}</p>
                            </div>
                          )}
                          {session.objectiveAssessment && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Objective</p>
                              <p className="text-sm text-gray-700 bg-gray-50/50 p-3 rounded-lg">{session.objectiveAssessment}</p>
                            </div>
                          )}
                        </div>
                        {(session.treatmentAdministered || session.planForNextSession) && (
                          <div className="pt-2 border-t mt-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                              {session.treatmentAdministered && (
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Treatment</p>
                                  <p className="text-sm text-gray-700">{session.treatmentAdministered}</p>
                                </div>
                              )}
                              {session.planForNextSession && (
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Plan</p>
                                  <p className="text-sm text-gray-700">{session.planForNextSession}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed">
                    <FileText className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">No assessments recorded</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="reports" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Clinical Reports</h3>
                <Button
                  className="bg-[#005b57] hover:bg-[#00443e]"
                  onClick={() => toast.info("Report generation coming soon!")}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Generate Report
                </Button>
              </div>
              <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed">
                <FileText className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">No reports generated yet</p>
                <p className="text-xs text-gray-400 mt-1">Create progress reports, discharge summaries, and insurance letters here.</p>
              </div>
            </TabsContent>

            <TabsContent value="medical" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="py-3 bg-red-50/50 border-b">
                    <CardTitle className="text-base flex items-center gap-2 text-red-700">
                      <Heart className="h-4 w-4" /> Medical History
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {patientDetails.patientProfile?.medicalHistory && patientDetails.patientProfile.medicalHistory.length > 0 ? (
                      <ul className="space-y-2">
                        {patientDetails.patientProfile.medicalHistory.map((condition: string, index: number) => (
                          <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="text-red-400 mt-1.5">•</span>
                            {condition}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No medical history recorded</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3 bg-blue-50/50 border-b">
                    <CardTitle className="text-base flex items-center gap-2 text-blue-700">
                      <Pill className="h-4 w-4" /> Current Medications
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {patientDetails.patientProfile?.currentMedications && patientDetails.patientProfile.currentMedications.length > 0 ? (
                      <ul className="space-y-2">
                        {patientDetails.patientProfile.currentMedications.map((medication: string, index: number) => (
                          <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="text-blue-400 mt-1.5">•</span>
                            {medication}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No medications recorded</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3 bg-orange-50/50 border-b">
                    <CardTitle className="text-base flex items-center gap-2 text-orange-700">
                      <AlertTriangle className="h-4 w-4" /> Allergies
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {patientDetails.patientProfile?.allergies && patientDetails.patientProfile.allergies.length > 0 ? (
                      <ul className="space-y-2">
                        {patientDetails.patientProfile.allergies.map((allergy: string, index: number) => (
                          <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="text-orange-400 mt-1.5">•</span>
                            {allergy}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No allergies recorded</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3 bg-green-50/50 border-b">
                    <CardTitle className="text-base flex items-center gap-2 text-green-700">
                      <Phone className="h-4 w-4" /> Emergency Contact
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {patientDetails.patientProfile?.emergencyContact ? (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Name:</span> {patientDetails.patientProfile.emergencyContact.name}
                        </p>
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Phone:</span> {patientDetails.patientProfile.emergencyContact.phone}
                        </p>
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Relationship:</span> {patientDetails.patientProfile.emergencyContact.relationship}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No emergency contact recorded</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Treatment Tab (Plans, Templates) */}
        <TabsContent value="treatment" className="space-y-6">
          <Tabs defaultValue="plans" className="w-full">
            <div className="flex items-center justify-between mb-4">
              <TabsList className="bg-transparent p-0 gap-4 border-b w-full justify-start rounded-none h-auto">
                <TabsTrigger value="plans" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-[#005b57] data-[state=active]:shadow-none rounded-none px-1 pb-2 data-[state=active]:text-[#005b57]">Active Plans</TabsTrigger>
                <TabsTrigger value="templates" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-[#005b57] data-[state=active]:shadow-none rounded-none px-1 pb-2 data-[state=active]:text-[#005b57]">Templates</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="plans" className="space-y-4">
              <InteractiveTreatmentPlan patientId={patientId} />
            </TabsContent>

            <TabsContent value="templates" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Treatment Templates</h3>
                <Button
                  className="bg-[#005b57] hover:bg-[#00443e]"
                  onClick={() => toast.info("Template application coming soon!")}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Apply Template
                </Button>
              </div>
              <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed">
                <FileText className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">No templates applied</p>
                <p className="text-xs text-gray-400 mt-1">Apply pre-made treatment templates to this patient.</p>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Communication Tab (Messages, Video) */}
        <TabsContent value="communication" className="space-y-6">
          <Tabs defaultValue="messages" className="w-full">
            <div className="flex items-center justify-between mb-4">
              <TabsList className="bg-transparent p-0 gap-4 border-b w-full justify-start rounded-none h-auto">
                <TabsTrigger value="messages" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-[#005b57] data-[state=active]:shadow-none rounded-none px-1 pb-2 data-[state=active]:text-[#005b57]">Messages</TabsTrigger>
                <TabsTrigger value="video" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-[#005b57] data-[state=active]:shadow-none rounded-none px-1 pb-2 data-[state=active]:text-[#005b57]">Video Calls</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="messages" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Secure Messaging</h3>
                <Button
                  className="bg-[#005b57] hover:bg-[#00443e]"
                  onClick={() => setIsMessageModalOpen(true)}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  New Message
                </Button>
              </div>
              <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed">
                <Mail className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">No messages yet</p>
                <p className="text-xs text-gray-400 mt-1">Start a secure conversation with your patient.</p>
              </div>
            </TabsContent>

            <TabsContent value="video" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Telehealth Sessions</h3>
                <Button
                  className="bg-[#005b57] hover:bg-[#00443e]"
                  onClick={() => setIsVideoCallModalOpen(true)}
                >
                  <Video className="h-4 w-4 mr-2" />
                  Start Call
                </Button>
              </div>
              <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed">
                <Video className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">No past video sessions</p>
                <p className="text-xs text-gray-400 mt-1">Launch a video call directly from here.</p>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Billing & Invoices</h3>
            <Button
              className="bg-[#005b57] hover:bg-[#00443e]"
              onClick={() => setIsInvoiceModalOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Invoice
            </Button>
          </div>
          <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed">
            <CreditCard className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No invoices found</p>
            <p className="text-xs text-gray-400 mt-1">Manage patient billing and insurance claims.</p>
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Patient Files</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsUploadModalOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" /> Upload File
              </Button>
            </CardHeader>
            <CardContent>
              {patientDocs && patientDocs.length > 0 ? (
                <ul className="space-y-2">
                  {patientDocs.map((doc: PatientDocument) => (
                    <li key={doc._id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{doc.fileName}</p>
                          <p className="text-xs text-gray-500">{doc.documentType} • {(doc.fileSize / 1024).toFixed(2)} KB</p>
                        </div>
                      </div>
                      <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">No documents uploaded.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Patient Modal */}
      <EditPatientModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        patientId={patientId}
        currentData={{
          firstName: patientDetails.firstName,
          lastName: patientDetails.lastName,
          phoneNumber: patientDetails.phoneNumber,
        }}
        onSuccess={() => {
          // The query will automatically refetch due to Convex reactivity
          setIsEditModalOpen(false)
        }}
      />

      {/* Action Modals */}


      <TourGuide
        tourId="patient-detail-tour"
        steps={[
          {
            target: "#patient-detail-header",
            title: "Patient Profile",
            content: "View the patient's name and key details here.",
            position: "bottom",
          },
          {
            target: "#patient-info-card",
            title: "Overview & Contact",
            content: "Access contact information, medical history summary, and emergency contacts.",
            position: "bottom",
          },
          {
            target: "#tab-appointments",
            title: "Appointments",
            content: "Schedule sessions, view upcoming visits, and track attendance history.",
            position: "bottom",
          },
          {
            target: "#tab-clinical",
            title: "Clinical Records",
            content: "Document assessments, SOAP notes, and view comprehensive medical history.",
            position: "bottom",
          },
          {
            target: "#tab-treatment",
            title: "Treatment Plans",
            content: "Create and manage interactive treatment plans, goals, and exercise templates.",
            position: "bottom",
          },
          {
            target: "#tab-communication",
            title: "Communication",
            content: "Securely message patients and conduct telehealth video sessions.",
            position: "bottom",
          },
          {
            target: "#tab-billing",
            title: "Billing & Invoices",
            content: "Generate invoices, track payments, and manage insurance claims.",
            position: "bottom",
          },
          {
            target: "#tab-documents",
            title: "Documents",
            content: "Upload and organize patient files, referrals, and imaging reports.",
            position: "bottom",
          },
          {
            target: "#schedule-appointment-btn",
            title: "Quick Actions",
            content: "Easily schedule new appointments or perform other actions from here.",
            position: "left",
          },
        ]}
      />

      <CreateInvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        preselectedPatientId={patientId}
      />

      <CreateVideoCallModal
        isOpen={isVideoCallModalOpen}
        onClose={() => setIsVideoCallModalOpen(false)}
        preselectedPatientId={patientId}
      />

      <StartConversationModal
        isOpen={isMessageModalOpen}
        onClose={() => setIsMessageModalOpen(false)}
        preselectedPatientId={patientId}
      />

      <UploadDocumentModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        patientId={patientId}
      />

      <SessionLogModal
        isOpen={isAssessmentModalOpen}
        onClose={() => setIsAssessmentModalOpen(false)}
        patientId={patientId as Id<"users">}
      />

      {currentUser && (
        <SchedulePatientAppointmentModal
          open={isScheduleModalOpen}
          onOpenChange={setIsScheduleModalOpen}
          patientId={patientId as Id<"users">}
          patientName={`${patientDetails.firstName} ${patientDetails.lastName}`}
          physiotherapistId={currentUser._id as Id<"users">}
          physiotherapistName={`${currentUser.firstName} ${currentUser.lastName}`}
          physiotherapistImage={currentUser.imageUrl}
        />
      )}
    </div>
  );
} 