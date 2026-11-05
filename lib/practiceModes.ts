/**
 * How a physiotherapist outside a clinic works with Rehabify: a Rehabify physio (Rehabify sends them
 * Rehabify Care patients), an independent physio (their own private patients only), or both.
 * Chosen in the application (or, for older accounts, on the dashboard) and changed any time in
 * Settings > How you work. Stored as physiotherapistProfiles.practiceMode. "both" serves the
 * Rehabify network too (servesRehabifyNetwork in convex/physioSetup.ts).
 *
 * The rules follow the patient and the service, not the physio: a Rehabify physio who also sees
 * private patients of their own treats each patient under that patient's rules.
 */

export type PracticeMode = 'network' | 'independent' | 'both';
/** What a physio can choose. */
export type PracticeChoice = PracticeMode;

export const PRACTICE_CHOICES: { id: PracticeChoice; title: string; summary: string; points: string[] }[] = [
    {
        id: 'network',
        title: 'Rehabify physio',
        summary: 'Rehabify sends you patients (Rehabify Care). We set the prices and pay you a fixed amount per session.',
        points: ['Listed on Find a Physio and matched by Joy', 'Patients pay Rehabify, not you', 'A fixed payout for every completed session'],
    },
    {
        id: 'independent',
        title: 'Independent physio',
        summary: 'Bring your own private patients and run your practice on Rehabify, at your own prices.',
        points: ['Free to use, and your invoices are all yours', 'Assessments, care plans and exercise programmes', 'Invoice your patients at your own rates'],
    },
    {
        id: 'both',
        title: 'Both',
        summary: 'Take Rehabify Care patients and see your own private patients too. Each patient follows their own rules.',
        points: ['Listed on Find a Physio and matched by Joy', 'Rehabify patients pay Rehabify; you get a fixed payout', 'Your own patients pay you, at your own prices'],
    },
];

/** The choice a saved mode shows as. */
export function choiceOf(mode: PracticeMode | null | undefined): PracticeChoice | null {
    return mode ?? null;
}

export const PRACTICE_MODE_LABEL: Record<PracticeMode, string> = {
    network: 'Rehabify Care patients',
    independent: 'Own patients only',
    both: 'Rehabify Care and own patients',
};
