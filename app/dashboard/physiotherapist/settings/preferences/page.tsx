import { redirect } from 'next/navigation';

/** Retired: language, timezone and format choices were saved but nothing used them. */
export default function Page() {
  redirect('/dashboard/physiotherapist/settings/profile');
}
