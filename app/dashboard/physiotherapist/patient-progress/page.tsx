import { redirect } from 'next/navigation';

/** Retired: progress lives on each patient's page; this page's export was a placeholder. */
export default function Page() {
  redirect('/dashboard/physiotherapist/patients');
}
