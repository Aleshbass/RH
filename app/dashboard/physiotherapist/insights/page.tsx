import InsightsClient from './insights-client';

// The page renders straight away; the live Convex query fills it in (no server round trip first)
export default function PhysiotherapistInsightsPage() {
    return <InsightsClient initialStats={null} />;
}
