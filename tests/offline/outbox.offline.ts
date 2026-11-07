/**
 * Saving offline (Phase 3): changes made without internet are kept on the phone, encrypted, and
 * reach the server exactly once when the phone is back online; a note edit that met another change
 * is reviewed, never silently overwritten. Offline steps stop the local website and cut the page's
 * own connection (Convex too).
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

const PIN = '135790';

async function turnOnOffline(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Use Rehabify without internet' });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await dialog.getByLabel('New PIN').fill(PIN);
  await dialog.getByLabel('Type it again').fill(PIN);
  await dialog.getByRole('button', { name: 'Turn on' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
}

/** Unsent changes on this phone (encrypted rows; only their count is readable). */
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

/** Really offline: the page's own connection (Clerk, Convex) is cut first, then the local website. */
async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine), { timeout: 10_000 }).toBe(false);
  stopWebsite();
}

/** Offline after more than 5 minutes unused, the saved data is locked: open it with the PIN. */
async function unlockIfAsked(page: Page, ready: ReturnType<Page['getByRole']>) {
  const pin = page.getByLabel('PIN', { exact: true });
  await expect(ready.or(pin).first()).toBeVisible({ timeout: 60_000 });
  if (await pin.isVisible()) {
    await pin.fill(PIN);
    await page.getByRole('button', { name: 'Unlock' }).click();
  }
  await expect(ready).toBeVisible({ timeout: 60_000 });
}

/** Back online: the page that opened offline never loaded sign-in, so it's opened again (as tapping the pill does). */
async function backOnline(page: Page) {
  await startWebsite();
  await page.context().setOffline(false);
}

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
  await startWebsite();
});

test('the server saves each change from a phone once, dated when it was made, on the right exercise', async () => {
  const { patientId, programId } = seedTestPatient();
  const now = Date.now();

  // A note sent twice (an answer lost on the way back): one note
  const noteArgs = { patientId, noteType: 'treatment_note', subjectiveAssessment: 'Sent twice from a phone', clientId: 'testnoteclient01', occurredAt: now - 60 * 60 * 1000 };
  const first = JSON.parse(convexRunAs(PHYSIO_ID, 'physioCare:addClinicalNote', noteArgs));
  const second = JSON.parse(convexRunAs(PHYSIO_ID, 'physioCare:addClinicalNote', noteArgs));
  expect(second.noteId).toBe(first.noteId);

  // A check-in made 3 hours ago, sent twice: one check-in, dated 3 hours ago
  const checkIn = { painScore: 3, exercisesDone: 'all', clientId: 'testcheckinclient1', occurredAt: now - 3 * 60 * 60 * 1000 };
  convexRunAs(PATIENT_ID, 'physioCare:submitCheckIn', checkIn);
  convexRunAs(PATIENT_ID, 'physioCare:submitCheckIn', checkIn);

  // The physio reorders the programme while the patient is offline; the patient's log names
  // "Straight leg raise" by its key and its old position (0): it lands on its new position (1)
  convexRunAs(PHYSIO_ID, 'exercisePrograms:updateProgram', {
    programId,
    title: 'Knee programme (test)',
    items: [
      { name: 'Heel slides', sets: 2, reps: 12, frequency: 'Once a day', fromIndex: 1 },
      { name: 'Straight leg raise', sets: 3, reps: 10, frequency: 'Once a day', fromIndex: 0 },
    ],
  });
  const log = { programId, itemIndex: 0, itemKey: 'testitemslr00001', painScore: 2, clientId: 'testlogclient0001', occurredAt: now - 2 * 60 * 60 * 1000 };
  convexRunAs(PATIENT_ID, 'exercisePrograms:logExercise', log);
  convexRunAs(PATIENT_ID, 'exercisePrograms:logExercise', log);

  const saved = offlineWrites();
  expect(saved.notes.filter((n) => n.clientId === 'testnoteclient01')).toHaveLength(1);
  const checkIns = saved.checkIns.filter((c) => c.clientId === 'testcheckinclient1');
  expect(checkIns).toHaveLength(1);
  expect(checkIns[0].createdAt).toBe(checkIn.occurredAt);
  expect(checkIns[0].syncedAt).not.toBeNull();
  const logs = saved.logs.filter((l) => l.clientId === 'testlogclient0001');
  expect(logs).toHaveLength(1);
  expect(logs[0].itemIndex).toBe(1);
  expect(logs[0].itemKey).toBe('testitemslr00001');
});

/** Midnight in Lagos (UTC+1), as the server counts "today" */
function startOfLagosDay(now: number) {
  const day = 86_400_000;
  return now - ((now + 3_600_000) % day);
}

test('a session done offline yesterday and sent today counts for yesterday, once', async () => {
  const { programId } = seedTestPatient();
  const day = 86_400_000;
  const yesterdayNoon = startOfLagosDay(Date.now()) - day + 11 * 60 * 60 * 1000;

  // Offline yesterday: one exercise logged, the reading ticked off, then "Done for today".
  // Each is sent twice (an answer lost on the way back), oldest first as the phone sends them.
  const log = { programId, itemIndex: 0, itemKey: 'testitemslr00001', clientId: 'testlogyesterday1', occurredAt: yesterdayNoon };
  const tick = { programId, itemIndex: 2, itemKey: 'testitemedu00003', clientId: 'testtickyesterday', occurredAt: yesterdayNoon + 60_000 };
  const finish = { programId, clientId: 'testfinishyestrdy', occurredAt: yesterdayNoon + 120_000 };
  for (const [fn, args] of [
    ['exercisePrograms:logExercise', log],
    ['exercisePrograms:markItemDone', tick],
    ['exercisePrograms:finishProgramToday', finish],
  ] as const) {
    convexRunAs(PATIENT_ID, fn, args);
    convexRunAs(PATIENT_ID, fn, args);
  }

  const saved = offlineWrites();
  expect(saved.logs.filter((l) => l.clientId === 'testlogyesterday1')).toHaveLength(1);
  const items = saved.ticks.filter((t) => t.kind === 'item');
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ itemIndex: 2, createdAt: tick.occurredAt });
  const finishes = saved.ticks.filter((t) => t.kind === 'finish');
  expect(finishes).toHaveLength(1);
  // Yesterday's count (the log and the reading), dated when it was pressed
  expect(finishes[0]).toMatchObject({ doneCount: 2, total: 3, createdAt: finish.occurredAt });
  // The physio is told it was yesterday's session, sent late
  expect(saved.finishedAlert?.title).toMatch(/finished their programme on \d+ \w{3}$/);
  expect(saved.finishedAlert?.body).toContain('back online');

  // Today is untouched: pressing "Done for today" now has nothing to send
  expect(() => convexRunAs(PATIENT_ID, 'exercisePrograms:finishProgramToday', { programId })).toThrow(/Tick off what you've done first/);
});

test('physio: a note written offline is sent once; an offline edit that met another change is reviewed', async ({ page }) => {
  clearTestDevices(PHYSIO_ID);
  const { patientId } = seedTestPatient();
  // A note to edit later (written "from a phone", so the next run clears it)
  const existing = JSON.parse(
    convexRunAs(PHYSIO_ID, 'physioCare:addClinicalNote', {
      patientId,
      noteType: 'treatment_note',
      subjectiveAssessment: 'Original wording',
      clientId: `testexisting${Date.now()}`,
    })
  ) as { noteId: string };

  await snoozeAppSetup(page);
  await signIn(page, PHYSIO_ID);
  const notesPage = `/dashboard/physiotherapist/patients/${patientId}?tab=notes`;
  await page.goto(notesPage);
  await turnOnOffline(page);
  await visitAndStore(page, notesPage);
  const write = page.getByRole('button', { name: /Write a clinical note for today/ });
  await expect(write).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Original wording')).toBeVisible({ timeout: 60_000 });

  // Offline: write a new note and edit the existing one
  await goOffline(page);
  await page.reload();
  await unlockIfAsked(page, write);
  await write.click();
  await page.getByRole('textbox', { name: 'Subjective' }).fill('Written offline at the bedside');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('Waiting to send', { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByRole('textbox', { name: 'Subjective' }).fill('Edited offline');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Your edit is waiting to send')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Offline · 2 waiting to send/ })).toBeVisible();
  expect(await outboxCount(page)).toBe(2);
  // Nothing readable in the phone's store
  const raw = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('rehabify-vault');
      request.onsuccess = () => resolve(request.result);
    });
    const rows = await new Promise<unknown[]>((resolve) => {
      const all = db.transaction('outbox').objectStore('outbox').getAll();
      all.onsuccess = () => resolve(all.result);
    });
    db.close();
    return JSON.stringify(rows, (_key, value) => (value instanceof ArrayBuffer ? new TextDecoder('latin1').decode(value) : value));
  });
  expect(raw).not.toContain('bedside');
  expect(raw).not.toContain('Edited offline');

  // Meanwhile the same note is changed elsewhere (another device)
  convexRunAs(PHYSIO_ID, 'physioCare:updateClinicalNote', { noteId: existing.noteId, subjectiveAssessment: 'Changed on another device' });

  // Back online: the new note goes; the edit is held for review
  await backOnline(page);
  await page.reload();
  await expect(page.getByText('Waiting to send', { exact: true })).toBeHidden({ timeout: 90_000 });
  const pill = page.getByRole('button', { name: /couldn’t be sent/ });
  await expect(pill).toBeVisible({ timeout: 90_000 });
  let saved = offlineWrites();
  expect(saved.notes.filter((n) => n.subjective === 'Written offline at the bedside')).toHaveLength(1);
  expect(saved.notes.find((n) => n._id === existing.noteId)?.subjective).toBe('Changed on another device');

  await pill.click();
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('dialog').getByText('Changed on another device')).toBeVisible();
  await page.getByRole('button', { name: 'Keep my edit' }).click();
  await expect.poll(() => offlineWrites().notes.find((n) => n._id === existing.noteId)?.subjective, { timeout: 90_000 }).toBe('Edited offline');
  await expect.poll(() => outboxCount(page), { timeout: 30_000 }).toBe(0);
  saved = offlineWrites();
  expect(saved.notes.filter((n) => n.subjective === 'Written offline at the bedside')).toHaveLength(1);
});

test('patient: a check-in and an exercise log made offline are each sent once when back online', async ({ page }) => {
  clearTestDevices(PATIENT_ID);
  seedTestPatient();
  await snoozeAppSetup(page);
  await signIn(page, PATIENT_ID);
  await page.goto('/dashboard/patient');
  // A new test patient accepts the terms once (the PIN offer waits its turn behind it)
  const terms = page.getByRole('dialog', { name: 'Before you continue' });
  if (await terms.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false)) {
    await terms.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(terms).toBeHidden({ timeout: 30_000 });
  }
  await turnOnOffline(page);
  // The home page (with the check-in card) saves the check-ins answer; offline the app opens on
  // the care plan, which is stored
  await expect(page.getByRole('heading', { name: 'How are you today?' })).toBeVisible({ timeout: 60_000 });
  await visitAndStore(page, '/dashboard/patient/treatment-plans');
  await expect(page.getByRole('button', { name: 'I did it' })).toBeVisible({ timeout: 60_000 });

  await goOffline(page);
  // Opening the app offline: the home page needs internet, so it opens the stored care plan
  await page.goto('/dashboard/patient');
  const checkInHeading = page.getByRole('heading', { name: 'How are you today?' });
  await unlockIfAsked(page, checkInHeading);
  await page.getByRole('radio', { name: /^4,/ }).or(page.getByRole('button', { name: /^4,/ })).first().click();
  await page.getByText('All of them', { exact: true }).click();
  await page.getByRole('button', { name: 'Send check-in' }).click();
  await expect(page.getByText(/Saved on this phone/).first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'I did it' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Logged. Nice work!')).toBeVisible({ timeout: 30_000 });
  expect(await outboxCount(page)).toBe(2);
  await expect(page.getByRole('button', { name: /Offline · 2 waiting to send/ })).toBeVisible();

  // The reading is ticked off, then "Done for today": both kept on the phone
  await page.getByRole('button', { name: /Knee care: what to expect/ }).click();
  await page.getByRole('button', { name: 'Mark as done' }).click();
  await expect(page.getByText('Done today', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Done for today' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send to my physio' }).click();
  await expect(page.getByText(/It goes to .+ when you’re back online/).first()).toBeVisible({ timeout: 30_000 });
  // The card shows once on a phone (a copy for wide screens is hidden)
  await expect(page.getByText(/Waiting to send to/).filter({ visible: true })).toBeVisible();
  expect(await outboxCount(page)).toBe(4);
  await expect(page.getByRole('button', { name: /Offline · 4 waiting to send/ })).toBeVisible();

  await backOnline(page);
  await page.reload();
  await expect.poll(() => outboxCount(page), { timeout: 90_000 }).toBe(0);
  const saved = offlineWrites();
  const checkIns = saved.checkIns.filter((c) => c.clientId);
  expect(checkIns).toHaveLength(1);
  expect(checkIns[0].painScore).toBe(4);
  const logs = saved.logs.filter((l) => l.clientId);
  expect(logs).toHaveLength(1);
  expect(logs[0].itemKey).toBe('testitemslr00001');
  // The reading and "Done for today" arrived after the log (oldest first), so the count is right
  expect(saved.ticks.filter((t) => t.kind === 'item')).toMatchObject([{ itemIndex: 2 }]);
  expect(saved.ticks.filter((t) => t.kind === 'finish')).toMatchObject([{ doneCount: 2, total: 3 }]);
  expect(saved.finishedAlert?.title).toMatch(/finished today's programme$/);
  // Once sent, the card says so
  await expect(page.getByText(/Sent to .+ today/).filter({ visible: true })).toBeVisible({ timeout: 60_000 });
});
