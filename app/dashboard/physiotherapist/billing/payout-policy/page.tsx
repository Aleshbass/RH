import { redirect } from 'next/navigation';

/** One payout policy: the public page, so patients, physios and the dashboard all read the same terms. */
export default function Page() {
  redirect('/payout-policy');
}
