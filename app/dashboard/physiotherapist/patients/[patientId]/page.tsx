'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Dumbbell,
  MessageSquare,
  MoreHorizontal,
  NotebookPen,
  Receipt,
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
import { SendProgramDialog } from '@/components/exercise-programs/SendProgramDialog';
import type { LibraryEntry } from '@/components/exercise-programs/types';
import { ScribeNextSteps, type ScribeNextStepsData } from '@/components/physio/notes/scribe/ScribeNextSteps';
import { suggestedDate } from '@/components/physio/notes/scribe/scribeTools';
import { ShareLinkDialog } from '@/components/exercise-programs/ShareLinkDialog';
import { PatientPlanBadge } from '@/components/exercise-programs/PatientPlanBadge';
import { useBooking } from '@/components/physio/schedule/BookingDrawer';
import { JoinVideoButton } from '@/components/physio/schedule/JoinVideoButton';
import { needsMyAnswer, useNow, useTodaysVisits, videoJoin } from '@/components/physio/schedule/shared';
import {
  cardClass,
  EmptyState,
  InfoTip,
  PageContainer,
  Panel,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
} from '@/components/physio/ui';
import { OverviewTab } from '@/components/physio/workspace/OverviewTab';
import { CarePlanTab } from '@/components/physio/workspace/CarePlanTab';
import { CheckInsTab, FilesTab, NotesTab, PaymentsTab } from '@/components/physio/workspace/RecordTabs';
import { CompleteCareDialog, EpisodeDialog } from '@/components/physio/workspace/CareDialogs';
import { CarePlanDrawer, NoteDrawer, RequestPaymentDrawer, SaveTemplateDrawer } from '@/components/physio/workspace/WorkspaceDrawers';
import { SOURCE_LABELS, fullName, type Workspace } from '@/components/physio/workspace/shared';
import { RehabifyId } from '@/components/shared/RehabifyId';
import { useMutationUntyped, useQueryUntyped } from '@/lib/convexUntyped';
import { cn } from '@/lib/utils';

const careApi = (api as unknown as Record<string, Record<string, unknown>>).physioCare;

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'plan', label: 'Care plan' },
  { id: 'notes', label: 'Clinical notes' },
  { id: 'checkins', label: 'Check-ins' },
  { id: 'files', label: 'Files' },
  { id: 'payments', label: 'Payments' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Every drawer the workspace can open; one at a time. */
type DrawerId = 'episode' | 'complete' | 'edit' | 'note' | 'plan' | 'template' | 'payment' | 'exercises';

/**
 * "Join video call" in the header when this patient has an online session today: live from 15
 * minutes before the start until the end, greyed out with the time it opens before that.
 */
function TodaysVideoJoin({ patientId }: { patientId: string }) {
  const today = useTodaysVisits();
  const now = useNow(30_000);
  const join = useMemo(() => {
    const rows = (today ?? [])
      .filter((visit) => visit.patientId === patientId && !needsMyAnswer(visit, now))
      .map((visit) => ({ start: visit.startTime, join: videoJoin(visit, now) }))
      .filter((row) => row.join.kind !== 'none')
      .sort((a, b) => a.start - b.start);
    return (rows.find((row) => row.join.kind === 'open') ?? rows[0])?.join ?? null;
  }, [today, now, patientId]);
  if (!join) return null;
  return <JoinVideoButton join={join} size="md" label="Join video call" />;
}

export default function PatientWorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const patientId = params.patientId as Id<'users'>;

  // A fixed "now" (to 5 minutes) keeps the query's arguments stable, so Convex can cache it
  const [workspaceNow] = useState(() => Math.floor(Date.now() / 300_000) * 300_000);
  const workspace = useQueryUntyped(careApi.getPatientWorkspace, patientId ? { patientId, now: workspaceNow } : 'skip') as
    | Workspace
    | null
    | undefined;
  const startNewEpisode = useMutationUntyped(careApi.startNewEpisode);

  const initialTab = (searchParams.get('tab') as TabId | null) ?? 'overview';
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? initialTab : 'overview');
  const [drawer, setDrawer] = useState<DrawerId | null>(null);
  const [shareFor, setShareFor] = useState<Id<'exercisePrograms'> | null>(null);
  const openBooking = useBooking();
  // A new note opened for a visit (?note=new&appointment=…), e.g. after a video call with the AI scribe
  const [noteAppointment, setNoteAppointment] = useState<Id<'appointments'> | undefined>(undefined);
  // After an AI-drafted note is signed: the exercises and follow-up the session mentioned
  const [nextSteps, setNextSteps] = useState<ScribeNextStepsData | null>(null);
  const [programInitial, setProgramInitial] = useState<LibraryEntry[] | undefined>(undefined);

  useEffect(() => {
    if (searchParams.get('note') !== 'new') return;
    setNoteAppointment((searchParams.get('appointment') as Id<'appointments'> | null) ?? undefined);
    setTab('notes');
    setDrawer('note');
    const url = new URL(window.location.href);
    url.searchParams.delete('note');
    url.searchParams.delete('appointment');
    url.searchParams.set('tab', 'notes');
    window.history.replaceState(null, '', url.toString());
  }, [searchParams]);

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
  const drawerProps = (id: DrawerId) => ({ open: drawer === id, onOpenChange: (open: boolean) => setDrawer(open ? id : null) });

  if (workspace === undefined) {
    return (
      <PageContainer>
        <Skeleton className="h-5 w-24 bg-pt-sunken" />
        <Skeleton className="h-44 rounded-3xl bg-pt-sunken" />
        <Skeleton className="h-10 w-full max-w-xl rounded-2xl bg-pt-sunken" />
        <div className="grid gap-5 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-60 rounded-3xl bg-pt-sunken" />
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
              <Button asChild className={secondaryButtonClass}>
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
  const needsReview =
    workspace.checkIns.some((c) => c.flagged && !c.reviewedAt) ||
    (workspace.exerciseLogs ?? []).some((l) => l.painScore !== null && l.painScore >= 7 && !l.reviewedAt);

  const reopen = async () => {
    try {
      await startNewEpisode({ patientId });
      toast.success(`New course of care started with ${patient.firstName ?? 'this patient'}`);
    } catch (error) {
      toast.error((error as Error).message || 'Couldn’t start a new course of care');
    }
  };

  const quickActions = [
    { id: 'note' as const, label: 'Write a note', icon: NotebookPen },
    { id: 'exercises' as const, label: 'Send exercises', icon: Dumbbell },
    { id: 'plan' as const, label: workspace.plan ? 'Revise plan' : 'Create plan', icon: ClipboardList },
    { id: 'payment' as const, label: 'Request payment', icon: Receipt },
  ];

  return (
    <PageContainer>
      <Link href="/dashboard/physiotherapist/patients" className="inline-flex items-center text-sm font-medium text-pt-muted transition-colors hover:text-pt-ink">
        <ChevronLeft className="mr-0.5 h-4 w-4" />
        Patients
      </Link>

      {/* Patient header */}
      <section className={cn(cardClass, 'p-5 sm:p-6')}>
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="h-16 w-16 shrink-0 sm:h-[72px] sm:w-[72px]">
              <AvatarImage src={patient.imageUrl} alt="" />
              <AvatarFallback className="bg-pt-sunken text-xl font-semibold text-pt-ink">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-pt-ink sm:text-[28px]">{name}</h1>
              <p className="truncate text-sm text-pt-muted">{[patient.email, patient.phoneNumber].filter(Boolean).join(' · ') || 'No contact details'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <RehabifyId value={patient.patientNumber} className="rounded-full px-2.5 text-xs" />
                <StatusBadge tone={isActive ? 'green' : 'neutral'}>
                  {isActive ? 'In treatment' : `Care completed${episode.completedAt ? ` · ${format(episode.completedAt, 'd MMM yyyy')}` : ''}`}
                </StatusBadge>
                <StatusBadge>
                  {SOURCE_LABELS[episode.source]}
                  {episode.source === 'referred' && episode.referredBy ? ` by ${episode.referredBy}` : ''}
                </StatusBadge>
                <StatusBadge>Since {format(workspace.relationship.startDate, 'MMM yyyy')}</StatusBadge>
                {/* Flex / Flex Max, for an independent physio's own patients only */}
                <PatientPlanBadge patientId={patientId} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TodaysVideoJoin patientId={patientId} />
            <Button asChild className={cn(secondaryButtonClass, 'h-10')}>
              <Link href={`/dashboard/physiotherapist/messages?with=${patientId}`}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Message
              </Link>
            </Button>
            {isActive ? (
              <Button onClick={() => openBooking({ patient: { id: patientId, name } })} className={cn(primaryButtonClass, 'h-10')}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                Book session
              </Button>
            ) : (
              <Button onClick={reopen} className={cn(primaryButtonClass, 'h-10')}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Start new course
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" className={cn(secondaryButtonClass, 'h-10 w-10')} aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                {isActive && (
                  <>
                    <DropdownMenuItem onClick={() => openBooking({ patient: { id: patientId, name }, mode: 'telehealth' })}>Book a video session</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => go('files')}>Upload a file</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDrawer('episode')}>Care details and source</DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onClick={() => setDrawer('edit')}>Edit contact details</DropdownMenuItem>
                {isActive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setDrawer('complete')} className="font-medium">
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Complete care
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* The four things you do most, one tap each */}
        {isActive && (
          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-pt-line pt-4 sm:grid-cols-4">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => setDrawer(action.id)}
                className="flex items-center gap-2.5 rounded-2xl bg-pt-sunken px-3 py-2.5 text-left text-sm font-medium text-pt-ink transition hover:bg-pt-hover active:scale-[0.98]"
              >
                <action.icon className="h-4 w-4 shrink-0 text-pt-muted" />
                <span className="truncate">{action.label}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Tabs */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex items-center gap-1 rounded-2xl bg-pt-sunken p-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => go(t.id)}
              className={cn(
                'whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition',
                tab === t.id ? 'bg-pt-surface text-pt-ink shadow-pt dark:shadow-none' : 'text-pt-muted hover:text-pt-ink'
              )}
            >
              {t.label}
              {t.id === 'checkins' && needsReview && (
                <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-pt-rose-fg align-middle" aria-label="needs review" />
              )}
            </button>
          ))}
          <InfoTip label="About these tabs" className="mx-1">
            Everything about this patient in one place. A rose dot on Check-ins means high pain or a flag you haven’t reviewed yet.
          </InfoTip>
        </div>
      </div>

      {isActive && !workspace.plan && tab === 'overview' && (
        <button
          type="button"
          onClick={() => setDrawer('plan')}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-pt-line-strong bg-pt-surface px-5 py-3.5 text-left text-sm text-pt-muted transition-colors hover:border-pt-ink/40"
        >
          <span className="flex items-center gap-3">
            <ClipboardList className="h-5 w-5 shrink-0 text-pt-ink" />
            <span>
              <span className="font-semibold text-pt-ink">No care plan yet.</span> Set goals, frequency, a review date and precautions, or start from a template.
            </span>
          </span>
          <span className="shrink-0 font-semibold text-pt-ink">Create plan →</span>
        </button>
      )}

      {tab === 'overview' && (
        <OverviewTab
          workspace={workspace}
          onEditEpisode={() => setDrawer('episode')}
          onOpenPlan={() => go('plan')}
          onSchedule={() => openBooking({ patient: { id: patientId, name } })}
        />
      )}
      {tab === 'plan' && <CarePlanTab workspace={workspace} onEditPlan={() => setDrawer('plan')} onSaveTemplate={() => setDrawer('template')} />}
      {tab === 'notes' && <NotesTab workspace={workspace} onWrite={() => setDrawer('note')} />}
      {tab === 'checkins' && <CheckInsTab workspace={workspace} />}
      {tab === 'files' && <FilesTab workspace={workspace} />}
      {tab === 'payments' && <PaymentsTab workspace={workspace} onRequest={() => setDrawer('payment')} />}

      {workspace.pastEpisodes.length > 0 && tab === 'overview' && (
        <Panel title="Earlier courses of care">
          <ul className="divide-y divide-pt-line">
            {workspace.pastEpisodes.map((e) => (
              <li key={e._id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="truncate text-pt-ink">{e.condition || 'Course of care'}</span>
                <span className="shrink-0 text-pt-muted">
                  {format(e.startedAt, 'MMM yyyy')} – {e.completedAt ? format(e.completedAt, 'MMM yyyy') : 'now'}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <NoteDrawer
        workspace={workspace}
        open={drawer === 'note'}
        onOpenChange={(open) => {
          setDrawer(open ? 'note' : null);
          if (!open) setNoteAppointment(undefined);
        }}
        appointmentId={noteAppointment}
        onScribeSigned={setNextSteps}
      />
      <ScribeNextSteps
        steps={nextSteps}
        patientFirstName={patient.firstName || 'your patient'}
        onClose={() => setNextSteps(null)}
        onSendExercises={(entries) => {
          setProgramInitial(entries.length ? entries : undefined);
          setDrawer('exercises');
        }}
        onBookFollowUp={(followUp) =>
          openBooking({
            patient: { id: patientId, name },
            suggestedDate: followUp.inDays ? suggestedDate(followUp.inDays) : undefined,
            hint: `From your note: ${followUp.text}`,
          })
        }
      />
      <CarePlanDrawer workspace={workspace} {...drawerProps('plan')} />
      {workspace.plan && <SaveTemplateDrawer plan={workspace.plan} {...drawerProps('template')} />}
      <RequestPaymentDrawer workspace={workspace} {...drawerProps('payment')} />
      <EpisodeDialog workspace={workspace} {...drawerProps('episode')} />
      <CompleteCareDialog workspace={workspace} {...drawerProps('complete')} />
      <SendProgramDialog
        patientId={patientId}
        patientName={patient.firstName || 'your patient'}
        mode="send"
        program={null}
        initial={programInitial}
        open={drawer === 'exercises'}
        onOpenChange={(open) => {
          setDrawer(open ? 'exercises' : null);
          if (!open) setProgramInitial(undefined);
        }}
        onSent={(programId) => setShareFor(programId)}
      />
      <ShareLinkDialog
        programId={shareFor}
        patientName={patient.firstName || 'your patient'}
        hasPhone={Boolean(patient.phoneNumber?.replace(/\D/g, '').length)}
        open={Boolean(shareFor)}
        onOpenChange={(open) => !open && setShareFor(null)}
      />
      <EditPatientModal
        isOpen={drawer === 'edit'}
        onClose={() => setDrawer(null)}
        patientId={patientId}
        currentData={{
          firstName: patient.firstName ?? '',
          lastName: patient.lastName ?? '',
          email: patient.email,
          phoneNumber: patient.phoneNumber,
          dateOfBirth: workspace.profile?.dateOfBirth,
          gender: workspace.profile?.gender,
        }}
        onSuccess={() => setDrawer(null)}
      />
    </PageContainer>
  );
}
