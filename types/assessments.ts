// Standardized Assessment Tools for Physiotherapy
export interface AssessmentBase {
  _id: string;
  patientId: string;
  physiotherapistId: string;
  assessmentType: AssessmentType;
  dateCompleted: Date;
  totalScore: number;
  interpretation: string;
  notes?: string;
}

export enum AssessmentType {
  OSWESTRY = 'oswestry',
  DASH = 'dash',
  ROLAND_MORRIS = 'roland_morris',
  NECK_DISABILITY = 'neck_disability',
  KNEE_INJURY = 'knee_injury'
}

// Oswestry Disability Index
export interface OswestryAssessment extends AssessmentBase {
  assessmentType: AssessmentType.OSWESTRY;
  responses: {
    painIntensity: number; // 0-5
    personalCare: number;  // 0-5
    lifting: number;       // 0-5
    walking: number;       // 0-5
    sitting: number;       // 0-5
    standing: number;      // 0-5
    sleeping: number;      // 0-5
    sexLife: number;       // 0-5
    socialLife: number;    // 0-5
    traveling: number;     // 0-5
  };
}

// DASH (Disabilities of the Arm, Shoulder and Hand)
export interface DashAssessment extends AssessmentBase {
  assessmentType: AssessmentType.DASH;
  responses: {
    openingTightJar: number;           // 1-5
    householdChores: number;          // 1-5
    carryingHeavyObjects: number;     // 1-5
    changingOverheadLight: number;    // 1-5
    washingBack: number;              // 1-5
    recreationalActivities: number;   // 1-5
    [key: string]: number;
  };
  workModule?: DashWorkModule;
  sportsModule?: DashSportsModule;
}

export interface DashWorkModule {
  difficultyWork: number;    // 1-5
  interfereWork: number;     // 1-5
}

export interface DashSportsModule {
  difficultySports: number;  // 1-5
  interfereSports: number;   // 1-5
}

// Assessment Questions and Scoring
export interface AssessmentQuestion {
  id: string;
  question: string;
  options: AssessmentOption[];
  category?: string;
}

export interface AssessmentOption {
  value: number;
  label: string;
  description?: string;
}

// Exercise Integration
export interface Exercise {
  _id: string;
  name: string;
  description: string;
  instructions: string[];
  targetMuscles: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  equipment: string[];
  videoUrl?: string;
  imageUrl?: string;
  exerciseDbId?: string;
  sets: number;
  reps: number;
  holdTime?: number; // seconds
  restTime?: number; // seconds
  frequency: string;
  precautions: string[];
}

export interface TreatmentExercise extends Exercise {
  patientId: string;
  assignedDate: Date;
  prescribedBy: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  notes?: string;
  completionHistory: ExerciseCompletion[];
}

export interface ExerciseCompletion {
  date: Date;
  completed: boolean;
  painLevel?: number; // 0-10
  notes?: string;
  setsCompleted?: number;
  repsCompleted?: number;
}

// Treatment Plan
export interface InteractiveTreatmentPlan {
  _id: string;
  patientId: string;
  physiotherapistId: string;
  title: string;
  description: string;
  startDate: Date;
  targetEndDate?: Date;
  status: 'active' | 'completed' | 'on_hold' | 'cancelled';
  goals: TreatmentGoal[];
  exercises: TreatmentExercise[];
  assessments: AssessmentBase[];
  progressNotes: ProgressNote[];
  nextReviewDate?: Date;
}

export interface TreatmentGoal {
  id: string;
  description: string;
  target: string;
  currentValue: string;
  targetValue: string;
  deadline?: Date;
  achieved: boolean;
  priority: 'high' | 'medium' | 'low';
}

export interface ProgressNote {
  id: string;
  date: Date;
  note: string;
  author: string;
  type: 'session' | 'assessment' | 'exercise' | 'general';
}
