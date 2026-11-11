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
 * Pages that mount their own toast container: video pages, the clinic portal (ClinicTheme) and the
 * shared dashboard shell (DashboardChrome). Every other page uses the one in app/providers.tsx;
 * without it, toasts (saves, errors, the "new version" prompt) would never show.
 */
export function hasOwnToaster(pathname: string) {
  // The physio portal sits in ClinicThemeProvider, which has its own toast container too
  if (
    pathname.startsWith('/v/') ||
    pathname.startsWith('/video-call/') ||
    pathname.startsWith('/dashboard/clinic') ||
    pathname.startsWith('/dashboard/physiotherapist')
  ) {
    return true;
  }
  return pathname.startsWith('/dashboard') && !hasOwnPortalShell(pathname);
}
