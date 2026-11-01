/**
 * The only Convex queries whose answers may be saved on a phone for offline use (encrypted,
 * lib/offline/vault.ts). Anything not listed is never saved. Keep it to what people need offline:
 * who they are, their patients and records, appointments and programmes. Never money, chat,
 * notifications or admin data.
 *
 * `key` picks the arguments that identify the answer when others change with time (e.g. "now"
 * rounded to the hour), so the saved copy is still found later offline.
 */
type Args = Record<string, unknown>;
export type OfflineQueryRule = { key?: (args: Args) => Args };

const same: OfflineQueryRule = {};
const withoutNow: OfflineQueryRule = {
  key: (args) => Object.fromEntries(Object.entries(args).filter(([name]) => name !== 'now')),
};

export const OFFLINE_QUERIES: Record<string, OfflineQueryRule> = {
  // Who you are and what you may open (portal gates)
  'users:getMyUser': same,
  'physioSetup:getMySetupStatus': same,
  'clinicTools:getMyClinicAccess': same,
  'accountApproval:getStatus': same,
  'users:myPolicyConsents': same,
  'patients:getMyCareHome': same,

  // Physio: home
  'clinics:getMyClinicInfo': same,
  'patients:getDashboardStats': same,
  'patients:getMyPatients': same,
  'physioCare:getNeedsAttention': withoutNow,
  'physioCare:getRecentCheckIns': same,
  'appointments:getMyAppointments': same,
  'rehabifyFollowUps:getMyBookingRequests': same,

  // Physio: patients and a patient's record
  'physioCare:getCompletedCare': same,
  'patientInvitations:getMyPatientInvitations': same,
  'physioCare:getPatientWorkspace': withoutNow,
  'physioCare:getClinicalNotes': same,
  'physioCare:getClinicalNoteMeasures': same,
  'exercisePrograms:patientPlanForCareTeam': same,
  'careCircle:getPatientCareCircleForStaff': same,
  'outcomes:getPatientOutcomes': same,
  'questionnaires:forPatient': same,
  'questionnaires:seriesForPatient': same,

  // Physio: appointments
  'patients:getMyPatientOptions': same,
  'recurringAppointments:getRecurringSeries': same,

  // Clinic portal
  'clinicTools:getClinicConsolidatedDashboard': same,
  'clinicTools:getClinicFollowUpQueue': same,
  'clinicTools:getClinicNavCounts': same,
  'clinicTools:getClinicSetupProgress': same,
  'clinicInventory:getInventoryAlerts': same,
  'clinics:getClinicPatients': same,
  'clinicTools:getClinicRehabifyReferrals': same,
  'clinicTools:getClinicClinicianOptions': same,
  'clinics:getClinicAppointments': same,
  'clinicTools:getClinicSetupDetails': same,
  'clinicTools:getClinicBookingRequests': same,

  // Patient portal
  'exercisePrograms:listMine': same,
  'treatmentPlans:getPatientActivePlan': same,
  'treatmentPlans:getExerciseCompletionMap': same,
  'appointments:getPatientAppointments': same,
  'rehabifyFollowUps:getMyBookingsAwaitingPhysio': same,
};

export function offlineRuleFor(functionName: string): OfflineQueryRule | undefined {
  return Object.prototype.hasOwnProperty.call(OFFLINE_QUERIES, functionName) ? OFFLINE_QUERIES[functionName] : undefined;
}
