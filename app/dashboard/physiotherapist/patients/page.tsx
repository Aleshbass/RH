'use client';

import { useQuery, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { Loader2, Users, Search, Plus, Calendar, FileText, Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PatientInviteModal } from '@/components/dashboard/clinic-owner/PatientInviteModal';
import AddPatientModal from '@/components/dashboard/physiotherapist/AddPatientModal';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface PatientWithDetails {
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
  appointmentCount: number;
  latestSession?: {
    _id: string;
    sessionDate: number;
    treatmentAdministered?: string;
  };
}

export default function PatientsPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  // Get current user
  const currentUser = useQuery(api.users.getMyUser);
  
  // Memoize query params to keep reference stable and lighten TS inference
  const patientParams = useMemo(() => ({
    limit: 50,
    searchTerm: searchTerm || undefined,
  }), [searchTerm]);

  // Get patients
  const patients = useQuery(api.patients.getMyPatients, patientParams) as PatientWithDetails[] | undefined;

  // Invitation action with email/notification
  const createPatientInvitationWithEmail = useAction(
    api.actions.patients.invitePatient.createPatientInvitationWithNotification
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
  if (!isLoaded || currentUser === undefined || patients === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading patients...</p>
        </div>
      </div>
    );
  }

  const handlePatientClick = (patientId: string): void => {
    router.push(`/dashboard/physiotherapist/patients/${patientId}`);
  };

  const getInitials = (firstName?: string, lastName?: string): string => {
    if (!firstName || !lastName) return '??';
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Patients</h1>
          <p className="text-gray-600">Manage your patient relationships and care</p>
        </div>
        <div className="flex gap-2">
          <AddPatientModal 
            onSuccess={() => {
              // Refresh the patients list
              window.location.reload();
            }}
          />
          <Button onClick={() => setIsInviteModalOpen(true)} variant="outline" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Invite Patient
          </Button>
        </div>
      </div>

      {/* Search and Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-3">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search patients by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Patients</p>
                <p className="text-2xl font-bold text-gray-900">{patients.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Patients List */}
      <div className="space-y-4">
        {patients.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No patients found</h3>
                <p className="text-gray-600 mb-4">
                  {searchTerm 
                    ? 'Try adjusting your search terms'
                    : 'Invite your first patient to get started'
                  }
                </p>
                <Button onClick={() => setIsInviteModalOpen(true)}>
                  Invite Patient
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          patients.map((patient) => (
            <Card key={patient._id} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={patient.imageUrl} alt={`${patient.firstName} ${patient.lastName}`} />
                      <AvatarFallback>
                        {getInitials(patient.firstName, patient.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {patient.firstName} {patient.lastName}
                        </h3>
                        {patient.relationship.isPrimaryPhysiotherapist && (
                          <Badge variant="secondary">Primary Therapist</Badge>
                        )}
                        <Badge className="bg-green-100 text-green-800">
                          {patient.relationship.status}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          <span>{patient.email}</span>
                        </div>
                        {patient.phoneNumber && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            <span>{patient.phoneNumber}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>{patient.appointmentCount} appointments</span>
                        </div>
                        {patient.latestSession && (
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <span>
                              Last session: {format(new Date(patient.latestSession.sessionDate), 'MMM dd, yyyy')}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 text-sm text-gray-600">
                        <p>
                          <strong>Patient since:</strong> {format(new Date(patient.relationship.startDate), 'MMM dd, yyyy')}
                        </p>
                        {patient.patientProfile?.medicalHistory && patient.patientProfile.medicalHistory.length > 0 && (
                          <p className="mt-1">
                            <strong>Conditions:</strong> {patient.patientProfile.medicalHistory.slice(0, 2).join(', ')}
                            {patient.patientProfile.medicalHistory.length > 2 && ' ...'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/dashboard/physiotherapist/appointments?patient=${patient._id}`);
                      }}
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      Schedule
                    </Button>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePatientClick(patient._id);
                      }}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Patient Invite Modal */}
      <PatientInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSubmit={async (formData) => {
          try {
            const result = await createPatientInvitationWithEmail({
              patientEmail: formData.patientEmail,
              patientName: formData.patientName,
              notes: formData.notes,
              sendEmail: true,
            });

            if (result.success) {
              // Smoothly close the modal on success
              setIsInviteModalOpen(false);
              const emailSent = (result as { emailSent?: boolean }).emailSent === true;
              if (emailSent) {
                toast.success(`Invitation email sent to ${formData.patientEmail}`);
              } else {
                toast.success('Invitation created');
                toast.warning('Email delivery failed. Please verify Resend configuration and domain settings.');
              }
              return true;
            }
            throw new Error(result.message || 'Failed to send invitation');
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Failed to send invitation';
            console.error('Error inviting patient:', error);
            toast.error(msg);
            return false;
          }
        }}
      />
    </div>
  );
}