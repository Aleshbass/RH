/**
 * A Joy dashboard link (/go/<code>) opened in claim mode: the patient has no login yet,
 * so they sign up and SyncUserWithConvex hands the code to storeUserFromClerk, which
 * attaches their Joy booking record to the new account.
 */
const KEY = "rh_dashboard_claim";

export function rememberDashboardClaim(code: string) {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // Storage blocked: the record can still be claimed by a fresh link from Joy
  }
}

export function readDashboardClaim(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function clearDashboardClaim() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear
  }
}
