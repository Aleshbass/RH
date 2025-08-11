// Health monitoring types - keeping simple to avoid deep instantiation
export interface VitalSigns {
  _id: string;
  patientId: string;
  heartRate?: number;
  bloodPressure?: {
    systolic: number;
    diastolic: number;
  };
  temperature?: number;
  oxygenSaturation?: number;
  weight?: number;
  height?: number;
  recordedAt: number;
  source: 'manual' | 'fitbit' | 'device';
}

export interface Medication {
  _id: string;
  patientId: string;
  name: string;
  dosage: string;
  frequency: string;
  startDate: number;
  endDate?: number;
  instructions?: string;
  isActive: boolean;
}

export interface MedicationLog {
  _id: string;
  medicationId: string;
  patientId: string;
  takenAt: number;
  status: 'taken' | 'missed' | 'delayed';
  notes?: string;
}

export interface SymptomLog {
  _id: string;
  patientId: string;
  symptomType: string;
  severity: number; // 1-10 scale
  description?: string;
  triggers?: string[];
  loggedAt: number;
}

export interface PainLog {
  _id: string;
  patientId: string;
  painLevel: number; // 1-10 scale
  location: string;
  description?: string;
  activities?: string[];
  loggedAt: number;
}

export interface FitbitData {
  _id: string;
  patientId: string;
  steps: number;
  distance: number;
  caloriesBurned: number;
  activeMinutes: number;
  heartRateZones?: {
    fatBurn: number;
    cardio: number;
    peak: number;
  };
  sleepData?: {
    totalMinutes: number;
    efficiency: number;
    stages: {
      deep: number;
      light: number;
      rem: number;
      wake: number;
    };
  };
  syncedAt: number;
  date: string; // YYYY-MM-DD format
}

export interface HealthGoal {
  _id: string;
  patientId: string;
  type: 'steps' | 'weight' | 'pain_reduction' | 'medication_adherence';
  target: number;
  current: number;
  unit: string;
  deadline?: number;
  isActive: boolean;
}
