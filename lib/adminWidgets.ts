/**
 * "My page" widgets (Admin › My page, owner 2026-11-17): each admin ticks what they want to track
 * every day. A widget needs its page: admins limited to some pages only see widgets for those.
 * Server: convex/adminMyPage.ts (summary).
 */

const A = '/dashboard/admin'

export type AdminWidgetGroup = 'Clinics & growth' | 'People' | 'Care' | 'Money' | 'Platform'

export type AdminWidget = {
  key: AdminWidgetKey
  title: string
  hint: string
  group: AdminWidgetGroup
  /** The admin page it opens, and needs (any of these) */
  pages: string[]
}

export type AdminWidgetKey =
  | 'clinicPlans'
  | 'clinicSignups'
  | 'outreach'
  | 'emails'
  | 'inquiries'
  | 'signups'
  | 'approvals'
  | 'contacts'
  | 'sessions'
  | 'journeys'
  | 'careQueue'
  | 'safety'
  | 'reports'
  | 'accessApplications'
  | 'physioPro'
  | 'payouts'
  | 'refunds'
  | 'bankTransfers'
  | 'agreements'
  | 'awadoc'

export const ADMIN_WIDGETS: AdminWidget[] = [
  { key: 'clinicPlans', title: 'Clinic plans', hint: 'Clinics on a plan, past due, read-only and what they owe', group: 'Clinics & growth', pages: [`${A}/clinics`] },
  { key: 'clinicSignups', title: 'New clinics', hint: 'Clinics that joined this week, with their owners', group: 'Clinics & growth', pages: [`${A}/clinics`] },
  { key: 'outreach', title: 'Clinic outreach', hint: 'Replies waiting, emails sent today, sending on or off', group: 'Clinics & growth', pages: [`${A}/outreach`] },
  { key: 'emails', title: 'Email campaigns', hint: 'The latest campaigns: sent and opened', group: 'Clinics & growth', pages: [`${A}/emails`] },
  { key: 'inquiries', title: 'Demo requests', hint: 'Demo requests and inquiries nobody has contacted yet', group: 'Clinics & growth', pages: [`${A}/partnerships?tab=inquiries`] },
  { key: 'signups', title: 'New sign-ups', hint: 'Physios, patients and clinics this week', group: 'People', pages: [`${A}/users`] },
  { key: 'approvals', title: 'Physios to approve', hint: 'Applications waiting for review', group: 'People', pages: [`${A}/approvals`] },
  { key: 'contacts', title: 'Quick contact', hint: 'Find a physio or clinic and call, WhatsApp or email them', group: 'People', pages: [`${A}/physiotherapists`, `${A}/clinics`, `${A}/users`] },
  { key: 'sessions', title: 'Sessions', hint: 'Completed and upcoming, and past ones never marked', group: 'Care', pages: [`${A}/analytics`, `${A}/journeys`] },
  { key: 'journeys', title: 'Patient journeys', hint: 'Patients stuck between booked, treated, paid and physio paid', group: 'Care', pages: [`${A}/journeys`] },
  { key: 'careQueue', title: 'Patients looking for care', hint: 'Waiting for a physio or for payment', group: 'Care', pages: [`${A}/care-queue`] },
  { key: 'safety', title: 'Visit safety', hint: 'Open home-visit alerts', group: 'Care', pages: [`${A}/safety`] },
  { key: 'reports', title: 'Reports', hint: 'Reports about physios to look at', group: 'Care', pages: [`${A}/marketplace-reports`] },
  { key: 'accessApplications', title: 'Rehabify Access', hint: 'Applications for reduced fees', group: 'Care', pages: [`${A}/rehabify-access`] },
  { key: 'physioPro', title: 'Individual Pro', hint: 'Physios on Pro, locked in and past due', group: 'Money', pages: [`${A}/physio-plans`] },
  { key: 'payouts', title: 'Payouts', hint: 'Physio and clinic earnings waiting or failed', group: 'Money', pages: [`${A}/payouts`] },
  { key: 'refunds', title: 'Refunds to decide', hint: 'Refund requests waiting for an admin', group: 'Money', pages: [`${A}/refunds`] },
  { key: 'bankTransfers', title: 'Bank transfers', hint: 'Transfers to confirm', group: 'Money', pages: [`${A}/bank-transfers`] },
  { key: 'agreements', title: 'Agreements', hint: 'Signed and waiting for our countersignature', group: 'Platform', pages: [`${A}/agreements`] },
  { key: 'awadoc', title: 'AwaDoc', hint: 'Calls to and from AwaDoc that failed in the last day', group: 'Platform', pages: [`${A}/awadoc`] },
]

export const ADMIN_WIDGET_KEYS = ADMIN_WIDGETS.map((w) => w.key)

/** A new admin's page: what most admins look at first (only those they can open are shown). */
export const DEFAULT_ADMIN_WIDGETS: AdminWidgetKey[] = ['sessions', 'signups', 'clinicPlans', 'outreach', 'emails', 'approvals', 'careQueue', 'contacts']

export function widgetAllowed(widget: Pick<AdminWidget, 'pages'>, access: { full: boolean; pages: string[] }) {
  return access.full || widget.pages.some((p) => access.pages.includes(p))
}
