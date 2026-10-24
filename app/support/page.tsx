import { permanentRedirect } from 'next/navigation';

/** Old support link: the contact page lists every way to reach us. */
export default function SupportPage() {
  permanentRedirect('/contact');
}
