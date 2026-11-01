/**
 * The offline vault: PIN set-up online, data readable offline only with the PIN, nothing readable
 * in the phone's storage, auto-lock after 5 minutes, wipe after 10 wrong PINs and on sign-out.
 * Offline steps stop the local website too (Playwright's offline switch misses the service worker).
 */
import { expect, test, type Page } from '@playwright/test';
import { CLINIC_OWNER_ID, PHYSIO_ID, clearTestDevices, shows, signIn, snoozeAppSetup, startWebsite, stopWebsite, visitAndStore, websiteUp } from './helpers';

const PIN = '135790';

/** Online: answers the "Use Rehabify without internet" prompt. */
async function turnOnOffline(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Use Rehabify without internet' });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await dialog.getByLabel('New PIN').fill(PIN);
  await dialog.getByLabel('Type it again').fill(PIN);
  await dialog.getByRole('button', { name: 'Turn on' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
}

/** Everything in the phone's offline store and local storage, as text, to search for plain data. */
async function rawDeviceText(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const asText = (value: unknown): string => {
      if (value instanceof ArrayBuffer) return new TextDecoder('latin1').decode(new Uint8Array(value));
      if (ArrayBuffer.isView(value)) return new TextDecoder('latin1').decode(value as Uint8Array);
      if (value && typeof value === 'object') return Object.values(value).map(asText).join(' ');
      return String(value);
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('rehabify-vault');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const parts: string[] = [];
    for (const store of Array.from(db.objectStoreNames)) {
      const rows = await new Promise<unknown[]>((resolve) => {
        const all = db.transaction(store).objectStore(store).getAll();
        all.onsuccess = () => resolve(all.result);
        all.onerror = () => resolve([]);
      });
      parts.push(...rows.map(asText));
    }
    db.close();
    for (let i = 0; i < localStorage.length; i++) parts.push(localStorage.getItem(localStorage.key(i)!) ?? '');
    return parts.join('\n');
  });
}

async function savedAnswerCount(page: Page): Promise<number> {
  return page
    .evaluate(
    () =>
      new Promise<number>((resolve) => {
        const request = indexedDB.open('rehabify-vault');
        request.onsuccess = () => {
          try {
            const count = request.result.transaction('queries').objectStore('queries').count();
            count.onsuccess = () => resolve(count.result);
            count.onerror = () => resolve(-1);
          } catch {
            resolve(0);
          }
        };
        request.onerror = () => resolve(-1);
      })
    )
    .catch(() => -1); // mid-navigation (e.g. sign-out redirects): ask again
}

/** As if 5 minutes passed without use: the vault no longer stays open across page loads. */
async function expireUnlock(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.open('rehabify-vault');
        request.onsuccess = () => {
          const db = request.result;
          try {
            const tx = db.transaction('unlocked', 'readwrite');
            tx.objectStore('unlocked').clear();
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              db.close();
              resolve();
            };
          } catch {
            db.close();
            resolve();
          }
        };
        request.onerror = () => resolve();
      })
  );
}

async function goOffline(page: Page) {
  await page.context().setOffline(true);
  stopWebsite();
  expect(await websiteUp(), 'website must really be down').toBe(false);
}

async function goOnline(page: Page) {
  await startWebsite();
  await page.context().setOffline(false);
}

async function unlock(page: Page, pin: string) {
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Unlock' }).click();
}

test('physio: PIN, encrypted on the phone, opens offline with patient names', async ({ page }) => {
  clearTestDevices(PHYSIO_ID);
  await snoozeAppSetup(page);
  await signIn(page, PHYSIO_ID);
  await page.goto('/dashboard/physiotherapist');
  await turnOnOffline(page);
  await visitAndStore(page, '/dashboard/physiotherapist');
  await visitAndStore(page, '/dashboard/physiotherapist/patients');
  await expect(page.getByText(/Testpatient/).filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => savedAnswerCount(page), { timeout: 30_000 }).toBeGreaterThan(3);

  // Nothing readable on the phone: no patient names, ids or the PIN
  const raw = await rawDeviceText(page);
  expect(raw).not.toMatch(/Testpatient|RH-P-9000|offline-physio|135790/);

  await expireUnlock(page);
  await goOffline(page);
  try {
    await page.goto('/dashboard/physiotherapist/patients');
    await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible({ timeout: 30_000 });
    await unlock(page, '000000');
    await expect(page.getByText('That PIN isn’t right.')).toBeVisible({ timeout: 30_000 });
    await unlock(page, PIN);
    expect(await shows(page.getByText(/Testpatient/).filter({ visible: true }).first(), 30_000), 'patient names offline').toBe(true);

    // The app launched offline (start page /dashboard) goes to the physio portal
    await page.goto('/dashboard?source=pwa');
    await expect(page).toHaveURL(/\/dashboard\/physiotherapist/, { timeout: 30_000 });
  } finally {
    await goOnline(page);
  }

  // Signing out wipes this person's offline data
  await page.goto('/dashboard/physiotherapist');
  await page.waitForFunction(() => (window as any).Clerk?.loaded === true, null, { timeout: 90_000 });
  // Not awaited inside the page: signing out navigates away
  await page.evaluate(() => {
    void (window as any).Clerk.signOut();
  });
  await expect.poll(() => savedAnswerCount(page), { timeout: 30_000 }).toBe(0);
});

test('clinic owner: opens offline with the clinic and its patients', async ({ page }) => {
  clearTestDevices(CLINIC_OWNER_ID);
  await snoozeAppSetup(page);
  await signIn(page, CLINIC_OWNER_ID);
  await page.goto('/dashboard/clinic');
  await turnOnOffline(page);
  await visitAndStore(page, '/dashboard/clinic');
  await visitAndStore(page, '/dashboard/clinic/patients');
  await expect(page.getByText(/Clinicpatient/).filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 });
  expect(await rawDeviceText(page)).not.toMatch(/Clinicpatient|Test Clinic \(fake\)|RH-P-9001/);

  await expireUnlock(page);
  await goOffline(page);
  try {
    await page.goto('/dashboard/clinic/patients');
    await unlock(page, PIN);
    expect(await shows(page.getByText(/Clinicpatient/).filter({ visible: true }).first(), 30_000)).toBe(true);
    // Moving to another page offline (a full page load) doesn't ask for the PIN again
    await page.goto('/dashboard/clinic');
    expect(await shows(page.getByText('Test Clinic (fake)').filter({ visible: true }).first(), 30_000)).toBe(true);
    await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeHidden();
  } finally {
    await goOnline(page);
  }
});

test('locks after 5 minutes unused, and 10 wrong PINs wipe the saved data', async ({ page }) => {
  clearTestDevices(PHYSIO_ID);
  await snoozeAppSetup(page);
  await signIn(page, PHYSIO_ID);
  await page.goto('/dashboard/physiotherapist');
  await turnOnOffline(page);
  await visitAndStore(page, '/dashboard/physiotherapist');

  await expireUnlock(page);
  await goOffline(page);
  try {
    // A controllable clock for the offline part only (online sign-in needs real timers)
    await page.clock.install();
    await page.goto('/dashboard/physiotherapist');
    await unlock(page, PIN);
    await expect(page.getByRole('link', { name: /patients/i }).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });

    // Five minutes without use: locked again
    await page.clock.fastForward('05:31');
    await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible({ timeout: 30_000 });

    for (let attempt = 1; attempt <= 10; attempt++) {
      await unlock(page, '000000');
      if (attempt < 10) await expect(page.getByText('That PIN isn’t right.')).toBeVisible({ timeout: 30_000 });
    }
    await expect(page.getByRole('heading', { name: 'Offline data removed' })).toBeVisible({ timeout: 30_000 });
    expect(await savedAnswerCount(page)).toBe(0);
  } finally {
    await goOnline(page);
  }
});
