'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  MessageSquare,
  MoreHorizontal,
  RotateCcw,
  Users,
} from '@/components/icons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import EditPatientModal from '@/components/dashboard/physiotherapist/EditPatientModal';
import { CreateVideoCallModal } from '@/components/dashboard/physiotherapist/modals/CreateVideoCallModal';
import SchedulePatientAppointmentModal from '@/components/dashboard/physiotherapist/modals/SchedulePatientAppointmentModal';
import { EmptyState, PageContainer, Panel } from '@/components/physio/ui';
import { OverviewTab } from '@/components/physio/workspace/OverviewTab';
import { CarePlanTab } from '@/components/physio/workspace/CarePlanTab';
import { CheckInsTab, FilesTab, NotesTab, PaymentsTab } from '@/components/physio/workspace/RecordTabs';
import { CompleteCareDialog, EpisodeDialog } from '@/components/physio/workspace/CareDialogs';
import { SOURCE_LABELS, fullName, type Workspace } from '@/components/physio/workspace/shared';
import { RehabifyId } from '@/components/shared/RehabifyId';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'plan', label: 'Care plan' },
  { id: 'notes', label: 'Clinical notes' },
  { id: 'checkins', label: 'Check-ins' },
  { id: 'files', label: 'Files' },
  { id: 'payments', label: 'Payments' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function PatientWorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const patientId = params.patientId as Id<'users'>;

  const currentUser = useQuery(api.users.getMyUser);
  // A fixed "now" (to 5 minutes) keeps the query's arguments stable, so Convex can cache it
  const [workspaceNow] = useState(() => Math.floor(Date.now() / 300_000) * 300_000);
  const workspace = useQuery(api.physioCare.getPatientWorkspace, patientId ? { patientId, now: workspaceNow } : 'skip') as
    | Workspace
    | null
    | undefined;
  const startNewEpisode = useMutation(api.physioCare.startNewEpisode);

  const initialTab = (searchParams.get('tab') as TabId | null) ?? 'overview';
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? initialTab : 'overview');
  const [composing, setComposing] = useState(false);
  const [dialog, setDialog] = useState<'episode' | 'complete' | 'edit' | 'video' | 'schedule' | null>(null);

  useEffect(() => {
    const fromUrl = searchParams.get('tab') as TabId | null;
    if (fromUrl && TABS.some((t) => t.id === fromUrl)) setTab(fromUrl);
  }, [searchParams]);

  const go = (next: TabId) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url.toString());
  };

  if (workspace === undefined) {
    return (
      <PageContainer>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-10 w-full max-w-xl rounded-xl" />
        <div className="grid gap-5 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-60 rounded-2xl" />
          ))}
        </div>
      </PageContainer>
    );
  }

  if (workspace === null) {
    return (
      <PageContainer>
        <Panel>
          <EmptyState
            icon={<Users />}
            title="Patient not found"
            description="This patient isn’t on your list."
            action={
              <Button asChild variant="outline" size="sm" className="rounded-xl">
                <Link href="/dashboard/physiotherapist/patients">Back to patients</Link>
              </Button>
            }
          />
        </Panel>
      </PageContainer>
    );
  }

  const { patient, episode } = workspace;
  const name = fullName(patient);
  const initials = `${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`.toUpperCase() || 'P';
  const isActive = episode.status === 'active';

  const reopen = async () => {
    try {
      await startNewEpisode({ patientId });
      toast.success(`New course of care started with ${patient.firstName ?? 'this patient'}`);
    } catch (error) {
      toast.error((error as Error).message || 'Couldn’t start a new course of care');
    }
  };

  return (
    <PageContainer>
      <Link
        href="/dashboard/physiotherapist/patients"
        className="inline-flex items-center text-sm font-medium text-neutral-500 hover:text-rh-night dark:text-neutral-400 dark:hover:text-white"
      >
        <ChevronLeft className="mr-0.5 h-4 w-4" />
        Patients
      </Link>

      {/* Patient header */}
      <section className="relative overflow-hidden rounded-3xl bg-rh-teal p-5 text-white shadow-lift dark:bg-rh-night sm:p-7">
        {/* Soft brand shapes */}
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/[0.07]" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-rh-mint/10" />

        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="h-16 w-16 shrink-0 ring-4 ring-white/15 sm:h-20 sm:w-20">
              <AvatarImage src={patient.imageUrl} alt="" />
              <AvatarFallback className="bg-rh-mint text-xl font-semibold text-rh-teal">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
              <p className="truncate text-sm text-white/70">
                {[patient.email, patient.phoneNumber].filter(Boolean).join(' · ') || 'No contact details'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <RehabifyId value={patient.patientNumber} tone="onDark" className="rounded-full px-2.5 text-xs" />
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', isActive ? 'bg-rh-mint text-rh-teal' : 'bg-white/15 text-white')}>
                  {isActive ? 'In treatment' : `Care completed${episode.completedAt ? ` · ${format(episode.completedAt, 'd MMM yyyy')}` : ''}`}
                </span>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">
                  {SOURCE_LABELS[episode.source]}
                  {episode.source === 'referred' && episode.referredBy ? ` by ${episode.referredBy}` : ''}
                </span>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">
                  Since {format(workspace.relationship.startDate, 'MMM yyyy')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild className="rounded-xl bg-white/15 text-white hover:bg-white/25" variant="ghost">
              <Link href={`/dashboard/physiotherapist/messages?with=${patientId}`}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Message
              </Link>
            </Button>
            {isActive ? (
              <Button
                onClick={() => setDialog('schedule')}
                disabled={!currentUser}
                className="rounded-xl bg-white text-rh-teal shadow-sm hover:bg-rh-cream active:scale-[0.98]"
              >
                <CalendarPlus className="mr-2 h-4 w-4" />
                Book session
              </Button>
            ) : (
              <Button onClick={reopen} className="rounded-xl bg-white text-rh-teal shadow-sm hover:bg-rh-cream">
                <RotateCcw className="mr-2 h-4 w-4" />
                Start new course
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="rounded-xl bg-white/15 text-white hover:bg-white/25" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-xl">
                {isActive && (
                  <>
                    <DropdownMenuItem onClick={() => { go('notes'); setComposing(true); }}>Write an assessment or note</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => go('plan')}>{workspace.plan ? 'Revise care plan' : 'Create care plan'}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDialog('video')}>Schedule a video session</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => go('payments')}>Request payment</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => go('files')}>Upload a file</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDialog('episode')}>Care details and source</DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onClick={() => setDialog('edit')}>Edit contact details</DropdownMenuItem>
                {isActive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setDialog('complete')} className="font-medium text-rh-teal focus:text-rh-teal dark:text-rh-aqua">
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Complete care
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex gap-1 rounded-2xl bg-white p-1 shadow-soft dark:bg-rh-ink-2" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => go(t.id)}
              className={cn(
                'whitespace-nowrap rounded-xl px-3.5 py-2 text-sm transition-all active:scale-[0.97]',
                tab === t.id
                  ? 'bg-rh-teal font-semibold text-white shadow-sm dark:bg-rh-aqua dark:text-rh-night'
                  : 'text-neutral-600 hover:bg-rh-canvas hover:text-rh-night dark:text-neutral-400 dark:hover:bg-white/[0.04] dark:hover:text-white'
              )}
            >
              {t.label}
              {t.id === 'checkins' &&
                (workspace.checkIns.some((c) => c.flagged && !c.reviewedAt) ||
                  (workspace.exerciseLogs ?? []).some((l) => l.painScore !== null && l.painScore >= 7 && !l.reviewedAt)) && (
                <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-rose-400 align-middle" aria-label="needs review" />
              )}
            </button>
          ))}
        </div>
      </div>

      {isActive && !workspace.plan && tab === 'overview' && (
        <button
          type="button"
          onClick={() => go('plan')}
          className="flex w-full items-center justify-between gap-3 rounded-2xl bg-rh-peach px-5 py-3 text-left text-sm text-[#7c4a0a] transition-all hover:brightness-[0.98] dark:bg-amber-400/10 dark:text-amber-200"
        >
          <span>
            <span className="font-semibold">No care plan yet.</span> Set goals, frequency, a review date and precautions.
          </span>
          <span className="shrink-0 font-semibold">Create plan →</span>
        </button>
      )}

      {tab === 'overview' && (
        <OverviewTab
          workspace={workspace}
          onEditEpisode={() => setDialog('episode')}
          onOpenPlan={() => go('plan')}
          onSchedule={() => setDialog('schedule')}
        />
      )}
      {tab === 'plan' && <CarePlanTab workspace={workspace} />}
      {tab === 'notes' && <NotesTab workspace={workspace} composing={composing} setComposing={setComposing} />}
      {tab === 'checkins' && <CheckInsTab workspace={workspace} />}
      {tab === 'files' && <FilesTab workspace={workspace} />}
      {tab === 'payments' && <PaymentsTab workspace={workspace} />}

      {workspace.pastEpisodes.length > 0 && tab === 'overview' && (
        <Panel title="Earlier courses of care">
          <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
            {workspace.pastEpisodes.map((e) => (
              <li key={e._id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="truncate text-rh-night dark:text-white">{e.condition || 'Course of care'}</span>
                <span className="shrink-0 text-neutral-500 dark:text-neutral-400">
                  {format(e.startedAt, 'MMM yyyy')} – {e.completedAt ? format(e.completedAt, 'MMM yyyy') : 'now'}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <EpisodeDialog open={dialog === 'episode'} onOpenChange={(open) => setDialog(open ? 'episode' : null)} workspace={workspace} />
      <CompleteCareDialog open={dialog === 'complete'} onOpenChange={(open) => setDialog(open ? 'complete' : null)} workspace={workspace} />
      <EditPatientModal
        isOpen={dialog === 'edit'}
        onClose={() => setDialog(null)}
        patientId={patientId}
        currentData={{
          firstName: patient.firstName ?? '',
          lastName: patient.lastName ?? '',
          email: patient.email,
          phoneNumber: patient.phoneNumber,
          dateOfBirth: workspace.profile?.dateOfBirth,
          gender: workspace.profile?.gender,
        }}
        onSuccess={() => setDialog(null)}
      />
      <CreateVideoCallModal isOpen={dialog === 'video'} onClose={() => setDialog(null)} preselectedPatientId={patientId} />
      {currentUser && (
        <SchedulePatientAppointmentModal
          open={dialog === 'schedule'}
          onOpenChange={(open) => setDialog(open ? 'schedule' : null)}
          patientId={patientId}
          patientName={name}
          physiotherapistId={currentUser._id as Id<'users'>}
          physiotherapistName={fullName(currentUser)}
          physiotherapistImage={currentUser.imageUrl}
        />
      )}
    </PageContainer>
  );
}
