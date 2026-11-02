import type { Metadata } from 'next';
import { cache } from 'react';
import { getConvexClient } from '@/lib/convex-client';
import { careersApi, jobMeta, type JobDetail } from '@/lib/careers';
import { pageMetadata, truncateDescription } from '@/lib/seo/utils';

/**
 * Server-side metadata for one role, so a shared /careers/<slug> link previews that role
 * instead of the /careers listing. The page itself is a client component (useQuery) and is
 * rendered unchanged.
 */

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

const CONVEX_TIMEOUT_MS = 5000;

/** The role, `null` when it does not exist or is a draft, `undefined` when Convex could not be reached in time. */
const loadJob = cache(async (slug: string): Promise<JobDetail | null | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const query = getConvexClient().query(careersApi.getJobBySlug, { slug });
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), CONVEX_TIMEOUT_MS);
    });
    return await Promise.race([query, timeout]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
});

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { slug } = await params;
  const path = `/careers/${slug}`;
  const job = await loadJob(slug);

  if (job === null) {
    return {
      title: 'Role not found',
      alternates: { canonical: path },
      robots: { index: false, follow: true },
    };
  }

  if (!job) {
    // Convex unavailable: neutral metadata
    return pageMetadata({
      title: 'Careers at Rehabify',
      description: 'See this open role at Rehabify Health and apply online.',
      path,
    });
  }

  return pageMetadata({
    title: `${job.title} · Careers`,
    description: truncateDescription(`${jobMeta(job).join(' · ')}. ${job.summary}`, 160),
    path,
    // Closed roles still open (the page says so) but drop out of search
    noIndex: !job.isOpen,
  });
}

export default function CareerRoleLayout({ children }: Props) {
  return children;
}
