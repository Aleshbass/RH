/** Portals that render their own shell, theme and access rules (not DashboardChrome). */
export function hasOwnPortalShell(pathname: string) {
  return (
    pathname.startsWith('/dashboard/clinic') ||
    pathname.startsWith('/dashboard/physiotherapist') ||
    pathname.startsWith('/dashboard/admin') ||
    pathname.startsWith('/dashboard/patient') ||
    pathname.startsWith('/dashboard/family')
  );
}

/**
 * Pages that mount their own toast container: video pages, every portal with its own shell
 * (clinic, physio, admin, patient and family all sit in ClinicThemeProvider, which has one) and
 * the rest of /dashboard (DashboardChrome has one). Every other page uses the one in
 * app/providers.tsx; without it, toasts (saves, errors, the "new version" prompt) would never
 * show, and with two, every toast shows twice.
 */
export function hasOwnToaster(pathname: string) {
  return pathname.startsWith('/v/') || pathname.startsWith('/video-call/') || pathname.startsWith('/dashboard');
}
