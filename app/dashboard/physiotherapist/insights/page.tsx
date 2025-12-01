import { getCachedPhysiotherapistStats } from '@/actions/get-cached-stats';
import InsightsClient from './insights-client';

export default async function PhysiotherapistInsightsPage() {
    // Fetch cached stats on the server (Redis first, then Convex)
    const stats = await getCachedPhysiotherapistStats();

    return <InsightsClient initialStats={stats} />;
}


