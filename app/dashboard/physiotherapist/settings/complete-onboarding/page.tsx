import { redirect } from 'next/navigation';

/** Retired: remaining setup now lives in the checklist on Home (convex/physioSetup.ts). */
export default function Page() {
  redirect('/dashboard/physiotherapist');
}
