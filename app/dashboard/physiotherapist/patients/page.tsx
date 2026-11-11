'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryUntyped } from '@/lib/convexUntyped';
import { format, formatDistanceToNow } from 'date-fns';
import { ChevronRight, Search, Star, UserPlus, Users, WhatsApp } from '@/components/icons';
import { api } from '@/convex/_generated/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import AddPatientModal from '@/components/dashboard/physiotherapist/AddPatientModal';
import { PendingInvitations } from '@/components/physio/PendingInvitations';
import { EmptyState, PageContainer, PageHeader, Panel, StatusBadge, primaryButtonClass } from '@/components/physio/ui';
import { OUTCOME_LABELS, type Outcome } from '@/components/physio/workspace/shared';
import { RehabifyId } from '@/components/shared/RehabifyId';
import { matchesRehabifyId } from '@/convex/helpers/rehabifyIdFormat';
import { cn } from '@/lib/utils';
import { JoinStatusChip, needsInvite } from '@/components/patient-join/JoinStatusChip';
import { useSendJoinLink } from '@/components/patient-join/useSendJoinLink';
import type { PatientJoinState } from '@/components/patient-join/refs';

/** The generated api types sit at TypeScript's depth limit, so this page reads its functions untyped. */
const patientsApi = api as unknown as Record<string, Record<string, unknown>>;

type ActivePatient = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  imageUrl?: string;
  phoneNumber?: string;
  patientNumber?: string;
  join?: PatientJoinState;
  relationship: { status: string; startDate: number; source?: string; referredBy?: string };
  stats?: { appointmentCount?: number; lastSessionDate?: number };
};

type CompletedPatient = {
  episodeId: string;
  patientId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  imageUrl?: string;
  patientNumber?: string;
  completedAt?: number;
  outcome?: Outcome;
  followUpRating?: number;
};

const SOURCE_BADGE: Record<string, string> = {
  referred: 'Referred',
  rehabify_referral: 'Referred',
  existing_patient: 'Existing patient',
  marketplace: 'Marketplace',
  booking_link: 'Booking link',
  invite: 'Invited',
  clinic_direct: 'Clinic',
  joy_whatsapp: 'Joy · WhatsApp',
  physio_link: 'Your patient link',
};

const BASE = '/dashboard/physiotherapist/patients';
const initials = (p: { firstName?: string; lastName?: string }) =>
  `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() || 'P';
const nameOf = (p: { firstName?: string; lastName?: string }) => [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unnamed patient';

// Avatar tints cycle through the brand's soft colours so the list feels friendly
const AVATAR_TINTS = [
  'bg-rh-honeydew text-rh-ink',
  'bg-pt-violet-bg text-pt-violet-fg',
  'bg-rh-blush text-[#be3a5f]',
  'bg-rh-honeydew text-rh-ink',
];
const tintFor = (id: string) => AVATAR_TINTS[id.charCodeAt(id.length - 1) % AVATAR_TINTS.length];

export default function PatientsPage() {
  const active = useQueryUntyped(patientsApi.patients.getMyPatients, { limit: 200 }) as ActivePatient[] | undefined;
  const completed = useQueryUntyped(patientsApi.physioCare.getCompletedCare, {}) as CompletedPatient[] | undefined;
  const [view, setView] = useState<'active' | 'completed'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  // "Not joined yet": patients who still need their WhatsApp link, or a reminder
  const [waitingOnly, setWaitingOnly] = useState(false);
  const sendLink = useSendJoinLink();
  const waitingCount = (active ?? []).filter((p) => needsInvite(p.join)).length;

  const term = searchTerm.trim().toLowerCase();
  const filteredActive = useMemo(
    () =>
      (active ?? []).filter(
        (p) =>
          (!waitingOnly || needsInvite(p.join)) &&
          (!term
            ? true
            : [p.firstName, p.lastName, p.email, p.phoneNumber].filter(Boolean).join(' ').toLowerCase().includes(term) ||
              matchesRehabifyId(p.patientNumber, term))
      ),
    [active, term, waitingOnly]
  );
  const filteredCompleted = useMemo(
    () =>
      (completed ?? []).filter((p) =>
        !term
          ? true
          : [p.firstName, p.lastName, p.email].filter(Boolean).join(' ').toLowerCase().includes(term) ||
            matchesRehabifyId(p.patientNumber, term)
      ),
    [completed, term]
  );

  const tabs = [
    { id: 'active' as const, label: 'In treatment', count: active?.length },
    { id: 'completed' as const, label: 'Care completed', count: completed?.length },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Patients"
        description="Everyone you’re treating, and everyone you’ve finished with."
        info="Open a patient to see their care plan, notes, check-ins, files and payments in one place. When you finish a course of care they move to Care completed, and you can start a new course any time."
        actions={
          <AddPatientModal
            trigger={
              <Button className={primaryButtonClass}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add patient
              </Button>
            }
          />
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-2xl bg-white p-1 shadow-soft dark:bg-rh-ink-2" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={view === t.id}
              onClick={() => setView(t.id)}
              className={cn(
                'rounded-xl px-4 py-2 text-sm transition-all active:scale-[0.97]',
                view === t.id
                  ? 'bg-rh-lime font-semibold text-rh-ink shadow-sm dark:bg-rh-lime dark:text-rh-ink'
                  : 'text-neutral-600 hover:text-rh-ink dark:text-neutral-400 dark:hover:text-white'
              )}
            >
              {t.label}
              {t.count !== undefined && <span className={cn('ml-1.5 tabular-nums', view === t.id ? 'opacity-80' : 'text-neutral-400')}>{t.count}</span>}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Search by name, email, phone or patient ID"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 rounded-xl border-0 bg-white pl-9 shadow-soft dark:bg-rh-ink-2"
            aria-label="Search patients"
          />
        </div>
      </div>

      {view === 'active' && <PendingInvitations />}

      {view === 'active' && (waitingCount > 0 || waitingOnly) && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWaitingOnly((on) => !on)}
            aria-pressed={waitingOnly}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-all active:scale-[0.97]',
              waitingOnly
                ? 'bg-rh-ink font-semibold text-white dark:bg-white dark:text-rh-ink'
                : 'bg-white text-neutral-700 shadow-soft hover:text-rh-ink dark:bg-rh-ink-2 dark:text-neutral-300'
            )}
          >
            Not joined yet
            <span className="tabular-nums opacity-70">{waitingCount}</span>
          </button>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            They haven’t opened Rehabify yet. Tap WhatsApp to send their link, or a reminder.
          </p>
        </div>
      )}

      {view === 'active' ? (
        <Panel>
          {active === undefined ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-2xl" />
              ))}
            </div>
          ) : filteredActive.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title={term ? 'No patients match that search' : 'No patients yet'}
              description={term ? 'Check the spelling, or search by email, phone or patient ID.' : 'Invite a patient, or share your booking link so they can book you.'}
            />
          ) : (
            <ul className="p-2">
              {filteredActive.map((patient) => {
                const count = patient.stats?.appointmentCount ?? 0;
                const lastSeen = patient.stats?.lastSessionDate;
                const source = patient.relationship.source ? SOURCE_BADGE[patient.relationship.source] : undefined;
                const waiting = needsInvite(patient.join);
                return (
                  <li key={patient._id} className="flex items-center gap-1">
                    <Link
                      href={`${BASE}/${patient._id}`}
                      className="group flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-rh-canvas dark:hover:bg-white/[0.03]"
                    >
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarImage src={patient.imageUrl} alt="" />
                        <AvatarFallback className={cn('text-sm font-semibold', tintFor(patient._id))}>{initials(patient)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{nameOf(patient)}</p>
                          <RehabifyId value={patient.patientNumber} copyable={false} />
                          <JoinStatusChip join={patient.join} />
                          {source && (
                            <StatusBadge tone="teal" className="hidden sm:inline-flex">
                              {source}
                              {patient.relationship.referredBy ? ` · ${patient.relationship.referredBy}` : ''}
                            </StatusBadge>
                          )}
                        </div>
                        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {[patient.email, patient.phoneNumber].filter(Boolean).join(' · ') || 'No contact details'}
                        </p>
                      </div>
                      <div className="hidden shrink-0 text-right text-xs text-neutral-500 dark:text-neutral-400 md:block">
                        <p className="tabular-nums">
                          {count} {count === 1 ? 'session' : 'sessions'}
                        </p>
                        <p>{lastSeen ? `Seen ${formatDistanceToNow(lastSeen, { addSuffix: true })}` : `Since ${format(patient.relationship.startDate, 'MMM yyyy')}`}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 dark:text-neutral-600" />
                    </Link>
                    {waiting && (
                      <button
                        type="button"
                        disabled={sendLink.busy}
                        onClick={() => void sendLink.send(patient._id, patient.firstName)}
                        aria-label={`Send ${nameOf(patient)} their link on WhatsApp`}
                        title={patient.join?.status === 'invited' ? 'Send a reminder on WhatsApp' : 'Send their link on WhatsApp'}
                        className="mr-1 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-rh-lime px-3 text-sm font-semibold text-rh-ink transition hover:bg-rh-lime-deep active:scale-[0.97] disabled:opacity-60"
                      >
                        <WhatsApp className="h-4 w-4" />
                        <span className="hidden sm:inline">{patient.join?.status === 'invited' ? 'Remind' : 'Send link'}</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      ) : (
        <Panel>
          {completed === undefined ? (
            <div className="space-y-3 p-5">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-14 rounded-2xl" />
              ))}
            </div>
          ) : filteredCompleted.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title={term ? 'No patients match that search' : 'No completed care yet'}
              description="When you complete a patient’s care from their workspace, they move here with their outcome and feedback."
            />
          ) : (
            <ul className="p-2">
              {filteredCompleted.map((patient) => (
                <li key={patient.episodeId}>
                  <Link
                    href={`${BASE}/${patient.patientId}`}
                    className="group flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-rh-canvas dark:hover:bg-white/[0.03]"
                  >
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarImage src={patient.imageUrl} alt="" />
                      <AvatarFallback className={cn('text-sm font-semibold', tintFor(patient.patientId))}>{initials(patient)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{nameOf(patient)}</p>
                        <RehabifyId value={patient.patientNumber} copyable={false} />
                      </div>
                      <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {patient.completedAt ? `Completed ${format(patient.completedAt, 'd MMM yyyy')}` : 'Completed'}
                      </p>
                    </div>
                    {patient.outcome && <StatusBadge tone={patient.outcome === 'goals_met' ? 'green' : 'neutral'}>{OUTCOME_LABELS[patient.outcome]}</StatusBadge>}
                    {patient.followUpRating && (
                      <span className="hidden shrink-0 items-center gap-0.5 text-xs font-semibold text-rh-ink dark:text-white sm:inline-flex">
                        <Star className="h-3.5 w-3.5 fill-rh-amber text-rh-amber" />
                        {patient.followUpRating}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </PageContainer>
  );
}
