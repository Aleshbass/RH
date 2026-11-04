'use client';

/**
 * Website analytics for admins: Umami (visitors and pages) and PostHog (product events).
 * Both count only people who allowed analytics cookies, and never patients' care pages or
 * private links (lib/analytics/privacy.ts).
 *
 * - Umami: the site's read-only share dashboard, embedded. Umami must allow this site to frame
 *   it (ALLOWED_FRAME_URLS on the Umami deployment); until then use "Open full dashboard".
 * - PostHog: embedded when NEXT_PUBLIC_POSTHOG_SHARED_DASHBOARD_URL holds a shared-dashboard
 *   link (PostHog › dashboard › Share › "Share publicly"); otherwise a link to PostHog.
 */
import { ExternalLink, Info, LineChart, ShieldCheck } from '@/components/icons';
import { AdminPage, PageHeader, Panel, softButtonClass } from '@/components/admin/ui';
import { UMAMI_SHARE_URL } from '@/lib/analytics/umami';
import { cn } from '@/lib/utils';

const POSTHOG_SHARED_DASHBOARD_URL = process.env.NEXT_PUBLIC_POSTHOG_SHARED_DASHBOARD_URL || '';
const POSTHOG_APP_URL = process.env.NEXT_PUBLIC_POSTHOG_APP_URL || 'https://eu.posthog.com';

function OpenLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(softButtonClass, 'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium')}
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

export default function WebAnalyticsPage() {
  return (
    <AdminPage>
      <PageHeader
        eyebrow="Overview"
        title="Website analytics"
        description="Visitors and pages from Umami, and product events from PostHog."
      />

      <div className="flex items-start gap-3 rounded-2xl border border-black/[0.06] bg-white p-4 text-sm text-neutral-600 dark:border-white/[0.08] dark:bg-rh-ink-2 dark:text-neutral-300">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-rh-ink dark:text-rh-lime" />
        <p>
          Both tools count only people who allowed analytics cookies. Patients&apos; care pages, private links
          (/v, /go, /x, /r, /track) and video calls are never recorded, and codes, record ids and page titles are
          removed from every address.
        </p>
      </div>

      <Panel
        title="Visitors (Umami)"
        description="Page views, visitors, where they came from, devices and countries"
        actions={<OpenLink href={UMAMI_SHARE_URL}>Open full dashboard</OpenLink>}
      >
        <div className="px-5 pb-5">
          <iframe
            src={UMAMI_SHARE_URL}
            title="Umami website analytics"
            loading="lazy"
            className="h-[1400px] w-full rounded-xl border border-black/[0.06] bg-white dark:border-white/[0.08]"
          />
          <p className="mt-3 flex items-start gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            If the dashboard above stays blank, Umami isn&apos;t allowing this site to show it yet. In the Umami
            deployment&apos;s settings, add https://physioaroundme.com and https://admin.physioaroundme.com to
            ALLOWED_FRAME_URLS and redeploy Umami. Until then, use &ldquo;Open full dashboard&rdquo;.
          </p>
        </div>
      </Panel>

      <Panel
        title="Product analytics (PostHog)"
        description="Sign-ups, bookings and other product events"
        actions={<OpenLink href={POSTHOG_SHARED_DASHBOARD_URL || POSTHOG_APP_URL}>Open PostHog</OpenLink>}
      >
        <div className="px-5 pb-5">
          {POSTHOG_SHARED_DASHBOARD_URL ? (
            <iframe
              src={POSTHOG_SHARED_DASHBOARD_URL}
              title="PostHog product analytics"
              loading="lazy"
              className="h-[1400px] w-full rounded-xl border border-black/[0.06] bg-white dark:border-white/[0.08]"
            />
          ) : (
            <div className="flex items-start gap-3 rounded-xl bg-rh-canvas p-4 text-sm text-neutral-600 dark:bg-white/[0.04] dark:text-neutral-300">
              <LineChart className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                To show PostHog here, open your dashboard in PostHog, choose Share, turn on public sharing, and
                set the link as NEXT_PUBLIC_POSTHOG_SHARED_DASHBOARD_URL. Until then, use &ldquo;Open PostHog&rdquo;.
              </p>
            </div>
          )}
        </div>
      </Panel>
    </AdminPage>
  );
}
