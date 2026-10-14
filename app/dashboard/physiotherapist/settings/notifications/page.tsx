import { redirect } from 'next/navigation';

/** Retired: these preferences were saved but nothing used them. */
export default function Page() {
  redirect('/dashboard/physiotherapist/settings/profile');
}
