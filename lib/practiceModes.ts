/**
 * Whether a physiotherapist outside a clinic is a Rehabify physio (Rehabify sends them Rehabify
 * Care patients) or an independent physio (their own private patients only). One or the other:
 * chosen in the application (or, for older accounts, on the dashboard) and changed any time in
 * Settings > How you work. Stored as physiotherapistProfiles.practiceMode, "network" or
 * "independent"; "both" was offered before and counts as a Rehabify physio. See
 * servesRehabifyNetwork in convex/physioSetup.ts.
 *
 * The rules follow the patient and the service, not the physio: a Rehabify physio who also sees
 * private patients of their own treats each patient under that patient's rules.
 */

export type PracticeMode = 'network' | 'independent' | 'both';
/** What a physio can choose. */
export type PracticeChoice = 'network' | 'independent';

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
];

/** The choice a saved mode shows as; "both" (offered before) counts as a Rehabify physio. */
export function choiceOf(mode: PracticeMode | null | undefined): PracticeChoice | null {
    if (!mode) return null;
    return mode === 'independent' ? 'independent' : 'network';
}

export const PRACTICE_MODE_LABEL: Record<PracticeMode, string> = {
    network: 'Rehabify Care patients',
    independent: 'Own patients only',
    both: 'Rehabify Care and own patients',
};
