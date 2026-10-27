import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PolicyPage } from '@/components/legal/PolicyPage';
import { AGREEMENTS, filledAgreement } from '@/lib/agreements';

/** Read-only copies of Rehabify's agreements, so people can read them before they sign up. */
const BY_SLUG = Object.fromEntries(Object.values(AGREEMENTS).map((spec) => [spec.href.split('/').pop()!, spec]));

export function generateStaticParams() {
  return Object.keys(BY_SLUG).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const spec = BY_SLUG[(await params).slug];
  if (!spec) return {};
  return {
    title: `${spec.title} | Rehabify`,
    description: `The ${spec.title} between Rehabify and ${spec.party === 'clinic' ? 'clinics' : 'physiotherapists'}, effective ${spec.effectiveDate}.`,
    alternates: { canonical: spec.href },
  };
}

export default async function AgreementPage({ params }: { params: Promise<{ slug: string }> }) {
  const spec = BY_SLUG[(await params).slug];
  if (!spec) notFound();
  // Blanks where the other party's details go
  const doc = filledAgreement(spec.id, {}, Date.now(), { template: true });
  const signHref = spec.party === 'clinic' ? '/dashboard/clinic/agreement' : '/dashboard/physiotherapist/settings/agreements';

  return (
    <PolicyPage doc={doc}>
      <div className="mt-12 rounded-2xl bg-rh-canvas p-6">
        <p className="text-[15px] leading-7 text-rh-ink/75">
          {spec.party === 'clinic' ? 'Clinic owners' : 'Physiotherapists'} sign this agreement online from their Rehabify dashboard, with their
          details filled in, and can download a signed copy straight away.
        </p>
        <Link
          href={signHref}
          className="mt-4 inline-flex h-11 items-center rounded-full bg-rh-lime px-5 text-sm font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep"
        >
          Sign in to sign
        </Link>
      </div>
    </PolicyPage>
  );
}
