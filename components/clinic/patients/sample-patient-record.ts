import type { FunctionReturnType } from 'convex/server'
import type { api } from '@/convex/_generated/api'

type PatientRecord = NonNullable<FunctionReturnType<typeof api.clinicTools.getClinicPatientFullRecord>>

const DAY = 24 * 60 * 60 * 1000

// Matches the sample rows returned by clinics.getClinicPatients for preview visitors
const SAMPLE_PATIENTS: Record<string, { first: string; last: string; phone: string; email: string; gender: string; condition: string }> = {
  prev_p1: { first: 'Folake', last: 'Adebayo', phone: '+234 803 123 4567', email: 'folake.adebayo@example.com', gender: 'female', condition: 'Right ACL reconstruction (6 weeks post-op)' },
  prev_p2: { first: 'Chukwudi', last: 'Eze', phone: '+234 802 987 6543', email: 'chukwudi.eze@example.com', gender: 'male', condition: 'Lumbar disc herniation (L4-L5)' },
  prev_p3: { first: 'Fatima', last: 'Aliyu', phone: '+234 814 555 1212', email: 'fatima.aliyu@example.com', gender: 'female', condition: 'Neck pain with cervicogenic headache' },
}

/**
 * A read-only record for preview visitors, so they can see every tab of a real
 * patient record. Every write in the drawer is blocked in preview.
 */
export function samplePatientRecord(patientId: string): PatientRecord {
  const p = SAMPLE_PATIENTS[patientId] ?? SAMPLE_PATIENTS.prev_p1
  const now = Date.now()
  const clinician = { _id: 'prev_doc1', firstName: 'Kunle', lastName: 'Balogun', email: 'kunle@example.com' }

  const sessionLogs = [
    {
      _id: 'prev_log2',
      _creationTime: now - 3 * DAY,
      sessionDate: now - 3 * DAY,
      noteType: 'treatment_note',
      noteTypeLabel: 'Treatment note',
      clinicianName: 'Kunle Balogun',
      subjectiveAssessment: 'Pain 3/10 on stairs, sleeping better.',
      objectiveAssessment: 'Knee bend 0-115°. Mild swelling.',
      treatmentAdministered: 'Quad sets, mini squats, balance work. Ice after.',
      planForNextSession: 'Add step-ups. Recheck knee bend.',
    },
    {
      _id: 'prev_log1',
      _creationTime: now - 14 * DAY,
      sessionDate: now - 14 * DAY,
      noteType: 'initial_assessment',
      noteTypeLabel: 'Initial assessment',
      clinicianName: 'Kunle Balogun',
      diagnosis: p.condition,
      goals: 'Walk without a limp in 4 weeks. Return to light jogging in 12 weeks.',
      subjectiveAssessment: 'Referred after surgery. Pain 6/10 on walking.',
      objectiveAssessment: 'Knee bend 0-90°. Quad lag present.',
      planForNextSession: 'Twice weekly for 6 weeks with a home programme.',
    },
    {
      _id: 'prev_log3',
      _creationTime: now - 1 * DAY,
      sessionDate: now - 1 * DAY,
      noteType: 'follow_up_outreach',
      noteTypeLabel: 'Check-in',
      clinicianName: 'Kunle Balogun',
      subjectiveAssessment: 'Check-in: Continuing care',
      treatmentAdministered: 'Called patient. Doing exercises daily, booked next visit.',
    },
  ]

  const treatmentPlans = [
    {
      _id: 'prev_plan1',
      _creationTime: now - 14 * DAY,
      clinicId: 'prev_clinic_1',
      title: 'Knee strengthening',
      status: 'active',
      startDate: now - 14 * DAY,
      goals: [
        { description: 'Walk without a limp', targetValue: '', timeline: '', measurable: false },
        { description: 'Climb stairs without pain', targetValue: '', timeline: '', measurable: false },
      ],
      phases: [
        {
          name: 'Home programme',
          description: '',
          duration: '4 weeks',
          order: 1,
          exercises: [
            { exerciseId: 'prev_ex1', name: 'Quad sets', sets: 3, reps: 10, frequency: 'Twice daily', instructions: 'Tighten the thigh, hold for 5 seconds.' },
            { exerciseId: 'prev_ex2', name: 'Straight leg raise', sets: 3, reps: 12, frequency: 'Daily', instructions: 'Keep the knee straight, lift slowly.' },
            { exerciseId: 'prev_ex3', name: 'Mini squats', sets: 2, reps: 10, frequency: 'Daily', instructions: 'Hold a counter for balance. Stop if painful.' },
          ],
        },
      ],
    },
  ]

  const timeline = [
    { id: 'prev_t5', date: now - 1 * DAY, type: 'clinical_note', title: 'Check-in', description: 'Called patient. Doing exercises daily.', badge: 'Note' },
    { id: 'prev_t4', date: now - 3 * DAY, type: 'clinical_note', title: 'Treatment note', description: 'Quad sets, mini squats, balance work.', badge: 'Note' },
    { id: 'prev_t3', date: now - 3 * DAY, type: 'appointment', title: 'Clinic visit', description: 'Follow-up session', badge: 'Attended' },
    { id: 'prev_t2', date: now - 14 * DAY, type: 'treatment_plan', title: 'Home programme: Knee strengthening', description: '3 exercises', badge: 'Active' },
    { id: 'prev_t1', date: now - 14 * DAY, type: 'clinical_note', title: 'Initial assessment', description: 'Knee bend 0-90°. Quad lag present.', diagnosis: p.condition, badge: 'Note' },
    { id: 'prev_t0', date: now - 15 * DAY, type: 'registration', title: 'Added to clinic', description: 'Registered by the clinic', badge: 'Intake' },
  ]

  return {
    patient: {
      _id: patientId,
      firstName: p.first,
      lastName: p.last,
      email: p.email,
      phoneNumber: p.phone,
      imageUrl: undefined,
      _creationTime: now - 15 * DAY,
    },
    profile: {
      _id: 'prev_profile',
      dateOfBirth: '1990-04-12',
      gender: p.gender,
      address: '12 Admiralty Way, Lekki',
      city: 'Lagos',
      medicalHistorySummary: p.condition,
      emergencyContact: { name: 'Tunde Adebayo', relationship: 'Brother', phone: '+234 805 000 1111' },
    },
    primaryClinician: clinician,
    careStatus: 'active',
    nextCheckInAt: now + 5 * DAY,
    sessionLogs,
    documents: [],
    treatmentPlans,
    appointments: [],
    timeline,
  } as unknown as PatientRecord
}
