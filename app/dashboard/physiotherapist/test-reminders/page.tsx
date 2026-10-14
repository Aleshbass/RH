import { redirect } from 'next/navigation';

/** Retired: admin-only debug page that should not be reachable by physiotherapists. */
export default function Page() {
  redirect('/dashboard/physiotherapist');
}
