import type { Metadata } from 'next';
import { privateLinkMetadata } from '@/lib/seo/utils';

type Props = { children: React.ReactNode; params: Promise<{ id: string }> };

// The tracker shows only a status timeline, and its preview names nobody either
export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { id } = await params;
  return privateLinkMetadata({
    title: 'Your referral status',
    description: 'See where your referral is in the care process. No personal details are shown.',
    path: `/track/${id}`,
  });
}

export default function TrackStatusLayout({ children }: Props) {
  return children;
}
