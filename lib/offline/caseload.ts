'use client';

/**
 * A physio's most recent patients, kept on the phone ahead of time (offline use on, PIN set):
 * each record's page and the answers its tabs show (only queries allowed on the phone:
 * lib/offline/offlineQueries.ts), encrypted like everything else. Runs after the PIN is set and at
 * most every 12 hours after that, a patient at a time. It only reads: nothing is marked as seen
 * and no "record opened" is logged. Skipped with Data Saver on, and it stops as soon as the phone
 * goes offline, the vault locks or someone else is signed in.
 */
import type { Value } from 'convex/values';
import { offlineModeOn } from '@/lib/pwa';
import { offlineRuleFor } from './offlineQueries';
import { keepAnswer } from './savedAnswers';
import { vaultOpenFor, vaultState } from './vault';

/** How many recent patients are kept ahead of time */
export const CASELOAD_SIZE = 30;
/** Notes the record's Notes tab loads first (components/physio/workspace/RecordTabs.tsx uses this) */
export const RECORD_NOTES_PAGE = 30;
const EVERY_MS = 12 * 60 * 60 * 1000;
/** A short pause between patients, so the page in use stays quick */
const PAUSE_MS = 250;
const lastRunKey = (userId: string) => `rh_caseload_at_${userId}`;

/** The app's Convex client (lib/offline/convexClient.ts), as far as this needs it */
export type CaseloadClient = {
  liveQuery(name: string, args: Record<string, Value>): Promise<unknown>;
  signedInUser(): string | null;
};

type PatientRow = { _id: string; relationship?: { startDate?: number }; stats?: { lastSessionDate?: number } };

export function patientRecordPath(patientId: string) {
  return `/dashboard/physiotherapist/patients/${patientId}`;
}

/**
 * The queries a patient's record opens with, with their arguments exactly as its tabs ask
 * (saved answers are found by them): keep in step with the record (page, OverviewTab,
 * RecordTabs, CarePlanTab, WorkspaceDrawers, OutcomesCard, QuestionnairesPanel, ExerciseProgramsPanel).
 */
function recordQueries(patientId: string, episodeId: string | null): [string, Record<string, Value>][] {
  const queries: [string, Record<string, Value>][] = [
    ['physioCare:getClinicalNotes', { patientId, limit: RECORD_NOTES_PAGE + 1 }], // Notes tab
    ['physioCare:getClinicalNotes', { patientId }], // the note drawer
    ['physioCare:getClinicalNoteMeasures', { patientId }],
    ['physioCare:getCarePlanHistory', { patientId }],
    ['careCircle:getPatientCareCircleForStaff', { patientId }],
    ['questionnaires:forPatient', { patientId }],
    ['exercisePrograms:listForPatient', { patientId }],
  ];
  if (episodeId) queries.push(['outcomes:getPatientOutcomes', { patientId, episodeId }]);
  return queries;
}

/** Most recent first: the last session with them, else when care started. */
const recency = (patient: PatientRow) => Math.max(patient.stats?.lastSessionDate ?? 0, patient.relationship?.startDate ?? 0);

let running = false;

export async function downloadCaseload(client: CaseloadClient): Promise<void> {
  if (running || typeof window === 'undefined') return;
  const userId = vaultState().userId;
  if (!userId) return;
  const stillOk = () => offlineModeOn() && navigator.onLine && vaultOpenFor(userId) && client.signedInUser() === userId;
  if (!stillOk()) return;
  // Data Saver on: only what the person opens is kept
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  try {
    if (Date.now() - Number(localStorage.getItem(lastRunKey(userId)) ?? 0) < EVERY_MS) return;
  } catch {
    return;
  }

  /** A live answer, kept for this person (only queries allowed on the phone, only while it's still them). */
  const keep = async (name: string, args: Record<string, Value>): Promise<unknown> => {
    const rule = offlineRuleFor(name);
    if (!rule) return undefined;
    const value = await client.liveQuery(name, args);
    if (value !== undefined && stillOk()) keepAnswer(userId, name, rule.key ? rule.key(args) : args, value as Value);
    return value;
  };

  running = true;
  try {
    // The same list the Patients page shows (its saved answer is refreshed too)
    const patients = await keep('patients:getMyPatients', { limit: 200 }).catch(() => null);
    if (!Array.isArray(patients)) return;
    // What "Send exercises" and "Create plan" need for any patient: the exercise library, who's
    // sending, and the physio's care plan templates
    await Promise.all(
      (['exerciseLibrary:listLibrary', 'queries:getCurrentUser', 'physioCare:listCarePlanTemplates'] as const).map((name) =>
        keep(name, {}).catch(() => undefined)
      )
    );
    const recent = (patients as PatientRow[])
      .filter((patient) => typeof patient?._id === 'string')
      .sort((a, b) => recency(b) - recency(a))
      .slice(0, CASELOAD_SIZE);
    const paths: string[] = [];
    for (const patient of recent) {
      if (!stillOk()) return;
      try {
        // "now" is left out of the saved key (offlineQueries: withoutNow)
        const workspace = (await keep('physioCare:getPatientWorkspace', { patientId: patient._id, now: Math.floor(Date.now() / 300_000) * 300_000 })) as {
          episode?: { _id?: string } | null;
        } | null;
        if (!workspace) continue;
        await Promise.all(
          recordQueries(patient._id, workspace.episode?._id ?? null).map(([name, args]) => keep(name, args).catch(() => undefined))
        );
        paths.push(patientRecordPath(patient._id));
      } catch {
        // One patient failing doesn't stop the rest
      }
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
    if (!stillOk()) return;
    // Their pages too, so each record opens offline (app/sw.ts stores them like a visit would)
    const registration = await Promise.race([
      navigator.serviceWorker?.ready ?? Promise.resolve(undefined),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 15_000)),
    ]);
    registration?.active?.postMessage({ type: 'rehabify:store-pages', paths });
    localStorage.setItem(lastRunKey(userId), String(Date.now()));
  } finally {
    running = false;
  }
}
