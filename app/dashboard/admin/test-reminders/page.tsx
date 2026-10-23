'use client';

import { useState, type ComponentType } from 'react';
import { notFound } from 'next/navigation';
import { useAction } from 'convex/react';
import { AlertTriangle, Bell, Calendar, CheckCircle2, Database, FileText, Loader2, Play, XCircle } from '@/components/icons';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { playSound } from '@/lib/sounds';
import { devToolsEnabled } from '@/components/admin/shell/adminNav';
import {
  AdminPage,
  IconChip,
  PageHeader,
  Panel,
  StatTile,
  StatusBadge,
  cardClass,
  primaryButtonClass,
  softButtonClass,
} from '@/components/admin/ui';

type TestRun = {
  error?: string;
  timestamp?: string | number;
  tests?: { name: string; status: string; details?: unknown; error?: string }[];
  summary: { total: number; passed: number; failed: number };
};

type DataCheck = {
  error?: string;
  activePlans?: number;
  unpaidInvoices?: number;
  upcomingAppointments?: number;
  recommendations?: string[];
};

type SingleResult = { success: boolean; result?: unknown; error?: string };

type Busy = 'data' | 'all' | 'exercise' | 'invoice' | 'appointment' | null;

const INDIVIDUAL: { id: 'exercise' | 'invoice' | 'appointment'; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'exercise', label: 'Exercise reminders', icon: Bell },
  { id: 'invoice', label: 'Invoice reminders', icon: FileText },
  { id: 'appointment', label: 'Appointment reminders', icon: Calendar },
];

const passed = (status: string) => status.includes('PASSED');

function ReminderTests() {
  const [testResults, setTestResults] = useState<TestRun | null>(null);
  const [dataCheck, setDataCheck] = useState<DataCheck | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const runAllTests = useAction(api.test_reminders.testAllReminders);
  const checkData = useAction(api.test_reminders.checkTestData);
  const testExercise = useAction(api.test_reminders.testExerciseReminders);
  const testInvoice = useAction(api.test_reminders.testInvoiceReminders);
  const testAppointment = useAction(api.test_reminders.testAppointmentReminders);

  const finish = (run: TestRun) => {
    setTestResults(run);
    playSound(run.error || run.summary.failed > 0 ? 'error' : 'success');
  };

  const handleRunAllTests = async () => {
    setBusy('all');
    setTestResults(null);
    try {
      finish((await runAllTests()) as TestRun);
    } catch (e) {
      finish({ error: (e as Error).message, summary: { total: 0, passed: 0, failed: 0 } });
    } finally {
      setBusy(null);
    }
  };

  const handleCheckData = async () => {
    setBusy('data');
    setDataCheck(null);
    try {
      setDataCheck((await checkData()) as DataCheck);
    } catch (e) {
      playSound('error');
      setDataCheck({ error: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const handleIndividualTest = async (testType: 'exercise' | 'invoice' | 'appointment') => {
    setBusy(testType);
    setTestResults(null);
    try {
      const run = testType === 'exercise' ? testExercise : testType === 'invoice' ? testInvoice : testAppointment;
      const result = (await run()) as SingleResult;
      finish({
        tests: [{ name: testType, status: result.success ? 'PASSED' : 'FAILED', details: result.result || result.error }],
        summary: { total: 1, passed: result.success ? 1 : 0, failed: result.success ? 0 : 1 },
      });
    } catch (e) {
      finish({ error: (e as Error).message, summary: { total: 1, passed: 0, failed: 1 } });
    } finally {
      setBusy(null);
    }
  };

  const spinner = <Loader2 className="mr-2 h-4 w-4 animate-spin" />;

  return (
    <AdminPage className="max-w-5xl">
      <PageHeader eyebrow="Developer" title="Reminder tests" description="Check that every reminder system is wired correctly." />

      <p className="flex items-start gap-2 rounded-2xl bg-rh-peach px-4 py-3 text-sm text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>These tests send real notifications</strong> when matching data exists. Run them in a test environment first.
        </span>
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Check test data" description="See whether the database has data the tests can use" bodyClassName="p-5 pt-3">
          <Button onClick={handleCheckData} disabled={busy !== null} className={cn(softButtonClass, 'w-full')}>
            {busy === 'data' ? spinner : <Database className="mr-2 h-4 w-4" />}
            Check data availability
          </Button>
        </Panel>
        <Panel title="Run all tests" description="Test every reminder system at once" bodyClassName="p-5 pt-3">
          <Button onClick={handleRunAllTests} disabled={busy !== null} className={cn(primaryButtonClass, 'w-full')}>
            {busy === 'all' ? spinner : <Play className="mr-2 h-4 w-4" />}
            Run all tests
          </Button>
        </Panel>
      </div>

      <Panel title="Individual tests" description="Test each reminder system on its own" bodyClassName="grid grid-cols-1 gap-3 p-5 pt-3 sm:grid-cols-3">
        {INDIVIDUAL.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleIndividualTest(id)}
            disabled={busy !== null}
            className={cn(
              cardClass,
              'flex flex-col items-center gap-2 px-4 py-5 text-sm font-medium text-rh-night transition hover:-translate-y-0.5 hover:shadow-lift disabled:pointer-events-none disabled:opacity-60 dark:text-white'
            )}
          >
            {busy === id ? <Loader2 className="h-6 w-6 animate-spin text-rh-teal dark:text-rh-aqua" /> : <IconChip icon={Icon} />}
            {label}
          </button>
        ))}
      </Panel>

      {dataCheck && (
        <Panel title="Data availability" bodyClassName="space-y-4 p-5 pt-3">
          {dataCheck.error ? (
            <p className="flex items-start gap-2 rounded-xl bg-rh-blush px-3 py-2 text-sm text-[#be123c] dark:bg-rose-400/10 dark:text-rose-300">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {dataCheck.error}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile label="Active plans" value={dataCheck.activePlans ?? 0} />
                <StatTile label="Unpaid invoices" value={dataCheck.unpaidInvoices ?? 0} tone="peach" />
                <StatTile label="Upcoming appointments" value={dataCheck.upcomingAppointments ?? 0} tone="mint" />
              </div>
              {dataCheck.recommendations && dataCheck.recommendations.length > 0 && (
                <div className="rounded-xl bg-rh-canvas px-4 py-3 dark:bg-white/[0.04]">
                  <p className="mb-1.5 text-sm font-semibold text-rh-night dark:text-white">Recommendations</p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
                    {dataCheck.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Panel>
      )}

      {testResults && (
        <Panel
          title="Test results"
          description={testResults.timestamp ? `Run at ${new Date(testResults.timestamp).toLocaleString()}` : undefined}
          bodyClassName="space-y-4 p-5 pt-3"
        >
          {testResults.error ? (
            <p className="flex items-start gap-2 rounded-xl bg-rh-blush px-3 py-2 text-sm text-[#be123c] dark:bg-rose-400/10 dark:text-rose-300">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {testResults.error}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatTile label="Total" value={testResults.summary.total} tone="neutral" />
                <StatTile label="Passed" value={testResults.summary.passed} tone="mint" />
                <StatTile label="Failed" value={testResults.summary.failed} tone={testResults.summary.failed > 0 ? 'rose' : 'neutral'} />
              </div>

              <ul className="space-y-3">
                {testResults.tests?.map((test, i) => (
                  <li key={i} className="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        {passed(test.status) ? (
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                        ) : (
                          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-300" />
                        )}
                        <div className="min-w-0">
                          <h4 className="font-semibold capitalize text-rh-night dark:text-white">{test.name}</h4>
                          {test.details !== undefined && test.details !== null && (
                            <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-rh-canvas p-2 text-xs text-neutral-700 dark:bg-rh-ink dark:text-neutral-300">
                              {JSON.stringify(test.details, null, 2)}
                            </pre>
                          )}
                          {test.error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">Error: {test.error}</p>}
                        </div>
                      </div>
                      <StatusBadge tone={passed(test.status) ? 'green' : 'red'}>{passed(test.status) ? 'Passed' : 'Failed'}</StatusBadge>
                    </div>
                  </li>
                ))}
              </ul>

              {testResults.summary.failed === 0 ? (
                <p className="flex items-center gap-2 rounded-xl bg-rh-mint px-3 py-2 text-sm text-[#047857] dark:bg-emerald-400/10 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>All tests passed.</strong> The reminder system is wired correctly.
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-2 rounded-xl bg-rh-blush px-3 py-2 text-sm text-[#be123c] dark:bg-rose-400/10 dark:text-rose-300">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>Some tests failed.</strong> Check the errors above and verify your setup.
                  </span>
                </p>
              )}
            </>
          )}
        </Panel>
      )}
    </AdminPage>
  );
}

/** Developer tool: hidden in production unless NEXT_PUBLIC_ADMIN_DEV_TOOLS=true. */
export default function TestRemindersPage() {
  if (!devToolsEnabled()) notFound();
  return <ReminderTests />;
}
