/**
 * When a video session can be joined. One rule, used by Home, the Schedule, the appointment
 * drawer, the patient page, the top-bar banner and Video sessions, so they always agree:
 * Join opens 15 minutes before the start and stays open until the session ends.
 */

export const JOIN_OPENS_BEFORE_MS = 15 * 60 * 1000;

export type JoinWindow =
    /** Too early: Join opens at `opensAt`. */
    | { phase: 'before'; opensAt: number }
    /** Join is open (from 15 minutes before the start until the end). */
    | { phase: 'open'; live: boolean }
    /** The session has ended. */
    | { phase: 'over' };

export function joinWindow(startTime: number, endTime: number, now: number): JoinWindow {
    if (now > endTime) return { phase: 'over' };
    const opensAt = startTime - JOIN_OPENS_BEFORE_MS;
    if (now < opensAt) return { phase: 'before', opensAt };
    return { phase: 'open', live: now >= startTime };
}

/** True while an online session is about to start (within 15 minutes) or in progress. */
export function isJoinOpen(startTime: number, endTime: number, now: number): boolean {
    return joinWindow(startTime, endTime, now).phase === 'open';
}

/**
 * Where a Join button goes. Rehabify's own video rooms (/video-call/<id>) are made relative, so
 * they open on whatever domain the dashboard is on, in the same tab. Other links (Google Meet,
 * a link the physio added) open in a new tab.
 */
export function joinTarget(link: string): { href: string; external: boolean } {
    const inApp = link.indexOf('/video-call/');
    if (inApp !== -1) return { href: link.slice(inApp), external: false };
    return { href: link, external: true };
}
