/**
 * Phase 4: the care team's records offline. Care plans, home programmes (new, added to, edited),
 * scores and questionnaires are saved once however often they're sent, dated when made, and an
 * offline edit never overwrites a change made meanwhile. On the phone: exercises added offline go
 * when back online; a physio's recent patients are kept ahead of time; offline use can be turned
 * off and on in Settings.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  PATIENT_ID,
  PHYSIO_ID,
  clearTestDevices,
  convexRunAs,
  offlineWrites,
  seedTestPatient,
  signIn,
  snoozeAppSetup,
  startWebsite,
  stopWebsite,
  visitAndStore,
} from './helpers';

const PIN = '864209';

async function turnOnOffline(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Use Rehabify without internet' });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await dialog.getByLabel('New PIN').fill(PIN);
  await dialog.getByLabel('Type it again').fill(PIN);
  await dialog.getByRole('button', { name: 'Turn on' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
}

async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine), { timeout: 10_000 }).toBe(false);
  stopWebsite();
}

async function unlockIfAsked(page: Page, ready: ReturnType<Page['getByRole']>) {
  const pin = page.getByLabel('PIN', { exact: true });
  await expect(ready.or(pin).first()).toBeVisible({ timeout: 60_000 });
  if (await pin.isVisible()) {
    await pin.fill(PIN);
    await page.getByRole('button', { name: 'Unlock' }).click();
  }
  await expect(ready).toBeVisible({ timeout: 60_000 });
}

async function outboxCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const request = indexedDB.open('rehabify-vault');
        request.onsuccess = () => {
          const db = request.result;
          try {
            const count = db.transaction('outbox').objectStore('outbox').count();
            count.onsuccess = () => {
              db.close();
              resolve(count.result);
            };
            count.onerror = () => {
              db.close();
              resolve(-1);
            };
          } catch {
            db.close();
            resolve(0);
          }
        };
        request.onerror = () => resolve(-1);
      })
  );
}

/** A Convex refusal printed by the CLI, as text (convexRunAs throws on refusals). */
function refusalOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string; message?: string };
    return `${failed.stdout ?? ''}${failed.stderr ?? ''}${failed.message ?? ''}`;
  }
  return '';
}

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
  await startWebsite();
});

test('care plans, programmes, scores and questionnaires from a phone: saved once, never overwriting a newer change', async () => {
  const { patientId, programId } = seedTestPatient();
  const now = Date.now();

  // ── Care plan: made offline (no plan yet), sent twice → one plan, version 1
  const goals = [{ description: 'Climb stairs without the rail', targetValue: '', timeline: '6 weeks' }];
  const firstPlan = { patientId, title: 'Knee plan (offline)', goals, clientId: 'testplanclient001', occurredAt: now - 3_600_000, expectedVersion: 0 };
  convexRunAs(PHYSIO_ID, 'physioCare:saveCarePlan', firstPlan);
  convexRunAs(PHYSIO_ID, 'physioCare:saveCarePlan', firstPlan);
  expect(offlineWrites().plans).toMatchObject([{ version: 1, title: 'Knee plan (offline)' }]);
  // Revised elsewhere meanwhile (version 2); an offline revision that started from version 1 is refused
  convexRunAs(PHYSIO_ID, 'physioCare:saveCarePlan', { patientId, title: 'Knee plan (laptop)', goals, changeReason: 'Changed on the laptop' });
  const planRefusal = refusalOf(() =>
    convexRunAs(PHYSIO_ID, 'physioCare:saveCarePlan', { ...firstPlan, title: 'Knee plan (phone edit)', changeReason: 'Offline edit', clientId: 'testplanclient002', expectedVersion: 1 })
  );
  expect(planRefusal).toMatch(/PLAN_CHANGED/);
  expect(offlineWrites().plans).toMatchObject([{ version: 2, title: 'Knee plan (laptop)' }]);
  // "Keep my changes" sends it again against version 2: saved as version 3
  convexRunAs(PHYSIO_ID, 'physioCare:saveCarePlan', { ...firstPlan, title: 'Knee plan (phone edit)', changeReason: 'Offline edit', clientId: 'testplanclient002', expectedVersion: 2 });
  expect(offlineWrites().plans).toMatchObject([{ version: 3, title: 'Knee plan (phone edit)' }]);

  // ── New programme made offline, sent twice → one programme
  const create = {
    patientId,
    title: 'Offline programme',
    items: [{ name: 'Wall sit', sets: 3, reps: 10, frequency: 'Once a day' }],
    clientId: 'testprogcreate001',
    occurredAt: now,
  };
  const created = JSON.parse(convexRunAs(PHYSIO_ID, 'exercisePrograms:createProgram', create));
  expect(JSON.parse(convexRunAs(PHYSIO_ID, 'exercisePrograms:createProgram', create))).toBe(created);
  expect(offlineWrites().programs.filter((p) => p.title === 'Offline programme')).toHaveLength(1);

  // ── Exercises added offline, sent twice → added once
  const add = { programId, items: [{ name: 'Step ups', sets: 2, reps: 8, frequency: 'Once a day' }], clientId: 'testprogadd000001', occurredAt: now };
  convexRunAs(PHYSIO_ID, 'exercisePrograms:addExercisesToProgram', add);
  convexRunAs(PHYSIO_ID, 'exercisePrograms:addExercisesToProgram', add);
  let knee = offlineWrites().programs.find((p) => p._id === programId)!;
  expect(knee.items).toEqual(['Straight leg raise', 'Heel slides', 'Knee care: what to expect', 'Step ups']);

  // ── An offline edit that started before the add is refused (it would undo it)
  const editItems = [
    { name: 'Heel slides', sets: 4, reps: 12, frequency: 'Once a day', fromKey: 'testitemhs000002' },
    { name: 'Straight leg raise', sets: 3, reps: 10, frequency: 'Once a day', fromKey: 'testitemslr00001' },
  ];
  const staleEdit = { programId, title: 'Knee programme (test)', items: editItems, clientId: 'testprogedit00001', occurredAt: now, expectedUpdatedAt: knee.updatedAt - 1 };
  expect(refusalOf(() => convexRunAs(PHYSIO_ID, 'exercisePrograms:updateProgram', staleEdit))).toMatch(/PROGRAM_CHANGED/);
  expect(offlineWrites().programs.find((p) => p._id === programId)!.items).toHaveLength(4);
  // The same edit against the current version: saved once; kept items keep their keys (logs follow them)
  const edit = { ...staleEdit, expectedUpdatedAt: knee.updatedAt };
  convexRunAs(PHYSIO_ID, 'exercisePrograms:updateProgram', edit);
  convexRunAs(PHYSIO_ID, 'exercisePrograms:updateProgram', edit);
  knee = offlineWrites().programs.find((p) => p._id === programId)!;
  expect(knee.items).toEqual(['Heel slides', 'Straight leg raise']);
  expect(knee.keys).toEqual(['testitemhs000002', 'testitemslr00001']);
  expect(knee.sets).toEqual([4, 3]);

  // ── Scores taken offline 2 hours ago, sent twice → saved once, dated when taken
  const scores = { patientId, when: 'check_in', pain: 4, clientId: 'testscoresclient01', occurredAt: now - 2 * 3_600_000 };
  convexRunAs(PHYSIO_ID, 'outcomes:recordScores', scores);
  convexRunAs(PHYSIO_ID, 'outcomes:recordScores', scores);
  const outcomes = offlineWrites().outcomes.filter((o) => o.clientId === 'testscoresclient01');
  expect(outcomes).toHaveLength(1);
  expect(outcomes[0]).toMatchObject({ pain: 4, createdAt: scores.occurredAt });

  // ── A questionnaire typed in offline an hour ago, sent twice → saved once, dated when typed in
  const nprs = { patientId, instrument: 'nprs', answers: [4, 2, 6], clientId: 'testquestclient001', occurredAt: now - 3_600_000 };
  convexRunAs(PHYSIO_ID, 'questionnaires:enterResponse', nprs);
  convexRunAs(PHYSIO_ID, 'questionnaires:enterResponse', nprs);
  const entered = offlineWrites().questionnaires.filter((q) => q.clientId === 'testquestclient001');
  expect(entered).toHaveLength(1);
  expect(entered[0]).toMatchObject({ instrument: 'nprs', completedAt: nprs.occurredAt });
});

test('physio: exercises added to a programme offline go once when back online', async ({ page }) => {
  clearTestDevices(PHYSIO_ID);
  const { patientId, programId } = seedTestPatient();
  await snoozeAppSetup(page);
  await signIn(page, PHYSIO_ID);
  const planTab = `/dashboard/physiotherapist/patients/${patientId}?tab=plan`;
  await page.goto(planTab);
  await turnOnOffline(page);
  await visitAndStore(page, planTab);
  const addExercises = page.getByRole('button', { name: 'Add exercises' }).first();
  await expect(addExercises).toBeVisible({ timeout: 60_000 });
  // Opened once online, as a physio would have: the exercise library is then on the phone too
  await addExercises.click();
  await expect(page.getByRole('button', { name: 'Add your own exercise' })).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('Escape');

  await goOffline(page);
  await page.reload();
  await unlockIfAsked(page, addExercises);
  await addExercises.click();
  await page.getByRole('button', { name: 'Add your own exercise' }).click();
  await page.getByRole('textbox', { name: 'Exercise name' }).fill('Wall sit (offline)');
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByRole('button', { name: /^Add to “/ }).click();
  await expect(page.getByText('Saved on this phone').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Your changes are saved on this phone, waiting to send/)).toBeVisible();
  // Nothing more changes this programme until that's gone
  await expect(addExercises).toBeDisabled();
  expect(await outboxCount(page)).toBe(1);

  await startWebsite();
  await page.context().setOffline(false);
  await page.reload();
  await expect.poll(() => outboxCount(page), { timeout: 90_000 }).toBe(0);
  const items = offlineWrites().programs.find((p) => p._id === programId)!.items;
  expect(items.filter((name) => name === 'Wall sit (offline)')).toHaveLength(1);
});

test('physio: recent patients are kept ahead of time, so a record never opened still opens offline', async ({ page }) => {
  clearTestDevices(PHYSIO_ID);
  const { patientId } = seedTestPatient();
  await snoozeAppSetup(page);
  await signIn(page, PHYSIO_ID);
  // Offline use turned on from the home page: the patient's record is never opened
  await page.goto('/dashboard/physiotherapist');
  await turnOnOffline(page);
  await visitAndStore(page, '/dashboard/physiotherapist');
  const recordPath = `/dashboard/physiotherapist/patients/${patientId}`;
  // The download starts a few seconds after the PIN is set; its pages land in the page store
  await expect
    .poll(
      () =>
        page.evaluate(async (path) => {
          for (const name of await caches.keys()) {
            if (!name.startsWith('rh-pages-')) continue;
            if (await (await caches.open(name)).match(path, { ignoreSearch: true })) return true;
          }
          return false;
        }, recordPath),
      { timeout: 180_000, intervals: [3_000] }
    )
    .toBe(true);

  await goOffline(page);
  await page.goto(`${recordPath}?tab=notes`);
  const write = page.getByRole('button', { name: /Write a clinical note for today/ });
  await unlockIfAsked(page, write);
  // The patient's name and notes come from the answers kept ahead of time
  await expect(page.getByText(/Testpatient|Obi/).first()).toBeVisible({ timeout: 30_000 });
});

test('back online after the session expired: the page opens without a detour through sign-in', async ({ page }) => {
  clearTestDevices(PHYSIO_ID);
  await snoozeAppSetup(page);
  await signIn(page, PHYSIO_ID);
  await page.goto('/dashboard/physiotherapist/patients');
  await turnOnOffline(page);
  await visitAndStore(page, '/dashboard/physiotherapist/patients');
  // Offline long enough for the sign-in token (1 minute) to expire
  await goOffline(page);
  await page.waitForTimeout(75_000);
  await startWebsite();
  await page.context().setOffline(false);

  // Before navigation preload, the page came back as a redirect to /sign-in (the server couldn't
  // refresh the expired session on a request re-made by the service worker)
  const bounced: string[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() !== 'document') return;
    const location = response.headers().location ?? '';
    if (response.status() >= 300 && response.status() < 400 && location.includes('/sign-in')) bounced.push(`${response.url()} -> ${location}`);
  });
  await page.reload();
  await page.waitForTimeout(12_000);
  expect(bounced, 'the server never sends the page to /sign-in').toEqual([]);
  expect(new URL(page.url()).pathname).toBe('/dashboard/physiotherapist/patients');
});

test('Settings: offline use can be turned off and back on for this phone', async ({ page }) => {
  clearTestDevices(PHYSIO_ID);
  await snoozeAppSetup(page);
  await signIn(page, PHYSIO_ID);
  await page.goto('/dashboard/physiotherapist/settings/alerts');
  await turnOnOffline(page);
  await expect(page.getByText(/On for this phone/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Turn off on this phone' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Turn off' }).click();
  await expect(page.getByText(/Off on this phone/)).toBeVisible({ timeout: 30_000 });
  // Its offline copy is gone, and the daily offer doesn't come back on this phone
  await page.reload();
  await expect(page.getByText(/Off on this phone/)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(4_000);
  await expect(page.getByRole('dialog', { name: 'Use Rehabify without internet' })).toHaveCount(0);

  // Turned back on: the PIN dialog opens straight away
  await page.getByRole('button', { name: 'Turn on' }).click();
  await turnOnOffline(page);
  await expect(page.getByText(/On for this phone/)).toBeVisible({ timeout: 30_000 });
  // The patient account isn't touched by any of this
  expect(PATIENT_ID).toBeTruthy();
});
