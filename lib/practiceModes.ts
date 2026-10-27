/**
 * Which patients a physiotherapist outside a clinic sees on Rehabify: Rehabify Care patients,
 * their own private patients, or both. Chosen in the application and changed any time in
 * Settings > How you work. Stored as physiotherapistProfiles.practiceMode ("network",
 * "independent" or "both"); see servesRehabifyNetwork in convex/physioSetup.ts.
 *
 * The rules follow the patient and the service, not the physio: someone who does both treats
 * each patient under that patient's rules.
 */

export type PracticeMode = 'network' | 'independent' | 'both';
export type PatientSource = 'rehabify' | 'own';

export const PATIENT_SOURCES: { id: PatientSource; title: string; summary: string; points: string[] }[] = [
    {
        id: 'rehabify',
        title: 'Rehabify Care patients',
        summary: 'Patients come to Rehabify and we match them with you. Rehabify sets the prices and pays you a fixed amount per session.',
        points: ['Listed on Find a Physio and matched by Joy', 'Patients pay Rehabify, not you', 'A fixed payout for every completed session'],
    },
    {
        id: 'own',
        title: 'My own patients',
        summary: 'Use Rehabify with your private patients, at your own prices.',
        points: ['Assessments, care plans and exercise programmes', 'Invoice your patients at your own rates', 'Follow-ups and progress between sessions'],
    },
];

export function sourcesOf(mode: PracticeMode | null | undefined): PatientSource[] {
    if (mode === 'independent') return ['own'];
    if (mode === 'both') return ['rehabify', 'own'];
    return mode === 'network' ? ['rehabify'] : [];
}

export function modeFrom(sources: PatientSource[]): PracticeMode | null {
    const rehabify = sources.includes('rehabify');
    const own = sources.includes('own');
    if (rehabify && own) return 'both';
    if (rehabify) return 'network';
    if (own) return 'independent';
    return null;
}

export const PRACTICE_MODE_LABEL: Record<PracticeMode, string> = {
    network: 'Rehabify Care patients',
    independent: 'Own patients only',
    both: 'Rehabify Care and own patients',
};
