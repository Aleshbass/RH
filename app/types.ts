import { Id } from "../convex/_generated/dataModel";

export interface User {
  _id: Id<"users">;
  _creationTime: number;
  clerkId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  imageUrl?: string;
  phoneNumber?: string;
  /** Optional plain phone field used in some components */
  phone?: string;
  /** Indicates if the user is currently active (online) */
  isActive?: boolean;
  role?: "physiotherapist" | "clinic_owner" | "patient" | "family_member" | "admin" | "doctor";
  onboarded: boolean;
  physiotherapistProfileId?: Id<"physiotherapistProfiles">;
  patientProfileId?: Id<"patientProfiles">;
  clinicOwnerProfileId?: Id<"clinicOwnerProfiles">;
  doctorProfileId?: Id<"referringDoctorProfiles">;
  lastLoginAt?: number;
  onboardingComplete?: boolean;
  status?: "active" | "inactive" | "pending_review" | "declined" | "pending";
}

export interface ApprovalStatus {
  _id: Id<"accountApprovalStatus">;
  _creationTime: number;
  userId: Id<"users">;
  status: "pending_review" | "approved" | "declined";
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: Id<"users">;
  comments?: string;
  requiredDocuments?: string[];
}

export interface Notification {
  _id: Id<"notifications">;
  _creationTime: number;
  userId: Id<"users">;
  type: string;
  priority: "urgent" | "high" | "medium" | "low";
  status: "pending" | "delivered" | "read" | "failed" | "retrying";
  payload: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    link?: string;
  };
  createdAt: number;
  readAt?: number;
  deliveredAt?: number;
  failedAt?: number;
  retryCount?: number;
  title: string;
  message: string;
  read: boolean;
}

export interface ClinicData {
  _id: Id<"clinics">;
  _creationTime: number;
  name: string;
  ownerName?: string;
  city?: string;
  country?: string;
}

export interface PhysiotherapistProfile {
  _id: Id<"physiotherapistProfiles">;
  _creationTime: number;
  userId: Id<"users">;
  clinicId: Id<"clinics"> | null;
  specializations: string[];
  bio: string;
  licenseNumber: string;
  yearsOfExperience: number;
  languagesSpoken: string[];
}

export interface Patient {
  _id: Id<"users">;
  firstName?: string;
  lastName?: string;
  email?: string;
  imageUrl?: string;
  // Add other patient fields as needed
}

export interface Appointment {
  _id: Id<"appointments">;
  _creationTime: number;
  patientId: Id<"users">;
  physiotherapistId: Id<"users">;
  clinicId?: Id<"clinics">;
  startTime: number;
  endTime: number;
  serviceType: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled_by_patient" | "cancelled_by_therapist" | "no_show";
  notesForPatient?: string;
  notesForTherapist?: string;
  cancellationReason?: string;
  rescheduledFromAppointmentId?: Id<"appointments">;
  appointmentType?: "in-person" | "telehealth";
  googleMeetLink?: string;
  date: number;
  time: string;
  type: string;
  physiotherapistName: string;
  patient: {
    _id: Id<"users">;
    firstName?: string;
    lastName?: string;
    email?: string;
    imageUrl?: string;
    phoneNumber?: string;
  } | null;
}

export interface SessionLog {
  _id: Id<"sessionLogs">;
  _creationTime: number;
  appointmentId: Id<"appointments">;
  patientId: Id<"users">;
  physiotherapistId: Id<"users">;
  clinicId?: Id<"clinics">;
  sessionDate: number;
  subjectiveAssessment?: string;
  objectiveAssessment?: string;
  treatmentAdministered?: string;
  planForNextSession?: string;
  voiceNoteUrl?: string;
  attachments?: Id<"_storage">[];
  patient?: {
    firstName: string;
    lastName: string;
  };
  appointment?: Appointment | null;
}

export interface Session {
  _id: Id<"sessionLogs">;
  sessionDate: number;
  patient?: {
    firstName: string;
    lastName: string;
  };
  appointment?: Appointment | null;
  patientId: Id<"users">;
  physiotherapistId: Id<"users">;
  clinicId?: Id<"clinics">;
  subjectiveAssessment?: string;
  objectiveAssessment?: string;
  treatmentAdministered?: string;
  planForNextSession?: string;
  voiceNoteUrl?: string;
  attachments?: Id<"_storage">[];
}

export interface PatientDocument {
  _id: Id<"patientDocuments">;
  _creationTime: number;
  patientProfileId: Id<"patientProfiles">;
  storageId: Id<"_storage">;
  documentType: "referralLetter" | "medicalRecord" | "insuranceCard" | "otherDocument";
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: number;
  title: string;
  type: string;
  url: string;
}

export type PatientDocumentType = "referralLetter" | "medicalRecord" | "insuranceCard" | "otherDocument"; 