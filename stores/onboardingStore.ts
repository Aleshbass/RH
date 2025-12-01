import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'physiotherapist' | 'clinic_owner' | 'patient' | 'family_member' | 'admin';

type PhysiotherapistData = {
  // Step 1: Personal & Contact Info
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  dateOfBirth?: string;
  age?: number;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';

  // Step 2: Professional Details
  specializations: string[];
  yearsOfExperience: number;
  bio: string;
  licenseNumber: string;
  location?: string; // Added location field
  languagesSpoken: string[];
  operatingHours: any;

  // Step 3: License & Credentials
  licenseDocument?: File;
  additionalCertificates?: File[];
  certificationBoard?: string;
  certificationYear?: number;
  licenseExpiryDate?: string;
  termsAccepted?: boolean;
  referralSource?: string;
  onboardingCompleted?: boolean;

  // Step 4: Clinic Association
  hasClinic: boolean;
  clinicId?: string;
  clinicName?: string;
};

type ClinicOwnerData = {
  // Step 1: Personal & Contact Info
  firstName: string;
  lastName: string;
  email: string; // Personal Email
  phoneNumber: string; // Personal Phone
  profilePhotoUrl?: string;
  isOwner: boolean;
  positionIfNotOwner?: string;
  yearsInBusiness?: number;

  // Step 2: Clinic Details
  clinicName: string;
  clinicLocation?: string; // For LocationSearch result
  clinicImageOutside?: File;
  clinicImageInside?: File;
  registrationNumber: string;
  clinicType: string;
  address: string; // Renamed from clinicAddress, matches schema
  city: string;
  state: string;
  clinicPhone: string; // Maps to form's phoneNumber field for the clinic
  clinicEmail: string; // Maps to form's email field for the clinic
  website?: string;
  yearEstablished: number;
  staffSize: number;

  // Step 3: Services & Facilities
  services: string[];
  specialties: string[];
  facilities: string[];
  equipmentAvailable: string[];
  operatingHours: any;
  additionalNotes: string;

  // Step 4: Verification Documents
  businessLicense: string[];
  taxRegistration: string[];
  insuranceProof: string[];
  ownerIdentification: string[];
  additionalDocuments?: string[];
  comments?: string;
  acceptTerms: boolean;
  referralSource?: string;
  onboardingCompleted?: boolean;
};

export type PatientData = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  dateOfBirth?: string;
  age?: number;
  gender?: "male" | "female" | "other" | "prefer_not_to_say";
  therapyFor?: string;
  location?: string;
  preferredLanguage?: string;
};

import { Id } from '@/convex/_generated/dataModel'; // Ensure Id is imported

type OnboardingData = {
  role?: UserRole;
  currentStep: number;
  currentOnboardingId?: string;
  invitationCode?: string;
  actualClinicId?: Id<"clinics">; // New field for the real Convex clinic ID
  physiotherapistData: PhysiotherapistData;
  clinicOwnerData: ClinicOwnerData;
  patientData: PatientData;
};

type OnboardingStore = {
  data: OnboardingData;
  setRole: (role: UserRole) => void;
  setCurrentStep: (step: number) => void;
  setRoleAndStep: (role: UserRole, step: number) => void;
  setCurrentOnboardingId: (id: string) => void;
  setActualClinicId: (id: Id<"clinics"> | undefined) => void; // New setter
  updatePhysiotherapistData: (data: Partial<PhysiotherapistData>) => void;
  updateClinicOwnerData: (data: Partial<ClinicOwnerData>) => void;
  updatePatientData: (data: Partial<PatientData>) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  nextStep: (role: UserRole) => void;
};

const initialState: OnboardingData = {
  role: undefined,
  currentStep: 1,
  physiotherapistData: {
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    specializations: [],
    yearsOfExperience: 0,
    bio: '',
    licenseNumber: '',
    languagesSpoken: [],
    operatingHours: {},
    certificationBoard: '',
    certificationYear: new Date().getFullYear(),
    licenseExpiryDate: '',
    termsAccepted: false,
    referralSource: '',
    onboardingCompleted: false,
    hasClinic: false
  },
  clinicOwnerData: {
    // Step 1: Personal & Contact Info
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    profilePhotoUrl: undefined,
    isOwner: true, // Default to true, user can change it
    positionIfNotOwner: undefined,

    // Step 2: Clinic Details
    clinicName: '',
    registrationNumber: '',
    clinicType: '',
    address: '', // Renamed from clinicAddress
    city: '',
    state: '',
    clinicPhone: '',
    clinicEmail: '',
    website: '',
    yearEstablished: new Date().getFullYear(),
    staffSize: 0,

    // Step 3: Services & Facilities
    services: [],
    specialties: [],
    facilities: [],
    equipmentAvailable: [],
    operatingHours: '',
    additionalNotes: '',

    // Step 4: Verification Documents
    businessLicense: [],
    taxRegistration: [],
    insuranceProof: [],
    ownerIdentification: [],
    additionalDocuments: [],
    comments: '',
    acceptTerms: false,
    referralSource: '',
    onboardingCompleted: false
  },
  patientData: {
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    therapyFor: '',
    location: '',
    preferredLanguage: ''
  }
};

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      data: initialState,

      setRole: (role) =>
        set((state) => ({
          data: { ...state.data, role }
        })),

      setCurrentStep: (step) =>
        set((state) => ({
          data: { ...state.data, currentStep: step }
        })),

      setRoleAndStep: (role, step) =>
        set((state) => ({
          data: { ...state.data, role, currentStep: step }
        })),

      setCurrentOnboardingId: (id) =>
        set((state) => ({
          data: { ...state.data, currentOnboardingId: id }
        })),

      setActualClinicId: (id) =>  // Implement the new setter
        set((state) => ({
          data: { ...state.data, actualClinicId: id }
        })),

      nextStep: (role) =>
        set((state) => {
          const nextStep = state.data.currentStep + 1;
          return { data: { ...state.data, currentStep: nextStep } };
        }),

      updatePhysiotherapistData: (data) =>
        set((state) => ({
          data: {
            ...state.data,
            physiotherapistData: {
              ...state.data.physiotherapistData,
              ...data
            }
          }
        })),

      updateClinicOwnerData: (data) =>
        set((state) => ({
          data: {
            ...state.data,
            clinicOwnerData: {
              ...state.data.clinicOwnerData,
              ...data
            }
          }
        })),

      updatePatientData: (data) =>
        set((state) => ({
          data: {
            ...state.data,
            patientData: {
              ...state.data.patientData,
              ...data
            }
          }
        })),

      completeOnboarding: () =>
        set((state) => {
          if (state.data.role === 'physiotherapist') {
            return {
              data: {
                ...state.data,
                physiotherapistData: {
                  ...state.data.physiotherapistData,
                  onboardingCompleted: true
                }
              }
            };
          } else if (state.data.role === 'clinic_owner') {
            return {
              data: {
                ...state.data,
                clinicOwnerData: {
                  ...state.data.clinicOwnerData,
                  onboardingCompleted: true
                }
              }
            };
          } else if (state.data.role === 'patient') {
            return {
              data: {
                ...state.data,
                patientData: {
                  ...state.data.patientData,
                  onboardingCompleted: true
                }
              }
            };
          }
          return state;
        }),

      resetOnboarding: () =>
        set({ data: initialState }),
    }),
    {
      name: 'rehabify-onboarding-storage',
    }
  )
);
