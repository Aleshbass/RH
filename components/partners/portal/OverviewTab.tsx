"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Activity, CheckCircle2, Clock, HeartPulse, Users, Webhook } from "@/components/icons";
import {
  DASH,
  EmptyState,
  KpiCard,
  LoadingBlock,
  StatusBadge,
  cardCls,
  fmtDate,
  formatMs,
  formatNumber,
  formatPercent,
  selectCls,
  tdCls,
  thCls,
  type PortalContext,
} from "./shared";
import type { TabId } from "./PartnerDashboard";

type Analytics = {
  rangeDays: number;
  timeseries: Array<{ date: string; referrals: number; contacted: number; booked: number; completed: number }>;
  funnel: Array<{ stage: string; count: number }>;
  careModes: Array<{ mode: string; label: string; count: number }>;
};

type Health = {
  windowHours: number;
  api: { requests: number; serverErrors: number; clientErrors: number; successRate: number | null; avgLatencyMs: number | null; truncated: boolean };
  webhooks: {
    endpointConfigured: boolean;
    endpointUrl: string | null;
    events: number;
    delivered: number;
    failed: number;
    retrying: number;
    skipped: number;
    successRate: number | null;
    avgLatencyMs: number | null;
  };
};

export function OverviewTab({
  ctx,
  overview,
  onNavigate,
}: {
  ctx: PortalContext;
  overview: { metrics: any; recentReferrals: any[] } | undefined;
  onNavigate: (tab: TabId) => void;
}) {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const analytics = useQuery(api.partners.getPartnerAnalyticsTimeseries, {
    partnerCode: ctx.partnerCode,
    environment: ctx.environment,
    range,
  }) as Analytics | undefined;
  const health = useQuery(api.partners.getIntegrationHealth, { partnerCode: ctx.partnerCode, environment: ctx.environment }) as
    | Health
    | undefined;

  if (!overview) return <LoadingBlock />;
  const m = overview.metrics as {
    totalReferrals: number;
    activeInTreatment: number;
    completed: number;
    pending: number;
    countIsCapped: boolean;
  };
  const hasData = m.totalReferrals > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="Referrals" value={formatNumber(m.totalReferrals)} hint={m.countIsCapped ? "Showing the latest 2,000" : `In ${ctx.environment}`} icon={<Users className="w-4 h-4" />} />
        <KpiCard label="Awaiting / contacted" value={formatNumber(m.pending)} hint="Received or in intake" icon={<Clock className="w-4 h-4" />} tone="amber" />
        <KpiCard label="Booked / in treatment" value={formatNumber(m.activeInTreatment)} hint="Active care episodes" icon={<HeartPulse className="w-4 h-4" />} />
        <KpiCard label="Completed" value={formatNumber(m.completed)} hint="Care episodes completed" icon={<CheckCircle2 className="w-4 h-4" />} tone="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${cardCls} p-5 lg:col-span-2 min-w-0`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold">Referral activity</h3>
              <p className="text-[11px] text-[#52706e]">New referrals and the day each one reached a milestone</p>
            </div>
            <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} className={selectCls} aria-label="Date range">
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>
          {!analytics ? (
            <LoadingBlock />
          ) : !hasData ? (
            <EmptyState
              icon={<Activity className="w-8 h-8" />}
              title="No referrals yet"
              body={
                ctx.environment === "sandbox"
                  ? "Create a test referral (Referrals tab) or call POST /v1/partners/referrals with a sandbox key."
                  : "Live referrals will appear here once you start sending patients."
              }
            />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.timeseries} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#002e2c14" />
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 10, fill: "#52706e" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#52706e" }} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="referrals" name="Referrals" stroke="#005b57" fill="#005b5722" />
                  <Area type="monotone" dataKey="booked" name="Booked" stroke="#F59E0B" fill="#F59E0B22" />
                  <Area type="monotone" dataKey="completed" name="Completed" stroke="#10B981" fill="#10B98122" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className={`${cardCls} p-5 min-w-0`}>
          <h3 className="text-sm font-semibold">Conversion funnel</h3>
          <p className="text-[11px] text-[#52706e] mb-4">Referrals created in the selected range</p>
          {!analytics ? (
            <LoadingBlock />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.funnel} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis type="category" dataKey="stage" width={90} tick={{ fontSize: 10, fill: "#52706e" }} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12 }} />
                  <Bar dataKey="count" name="Referrals" fill="#005b57" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className={`${cardCls} p-5`}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold">Integration health (last 24 h)</h3>
            <p className="text-[11px] text-[#52706e]">Measured from your real API requests and webhook deliveries</p>
          </div>
          <button type="button" onClick={() => onNavigate("developers")} className="text-xs font-semibold text-[#005b57] hover:underline">
            Developer tools →
          </button>
        </div>
        {!health ? (
          <LoadingBlock />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="API requests" value={formatNumber(health.api.requests)} hint={`${formatNumber(health.api.serverErrors)} server errors`} />
            <KpiCard label="API success rate" value={formatPercent(health.api.successRate)} hint={`Avg latency ${formatMs(health.api.avgLatencyMs)}`} />
            <KpiCard
              label="Webhooks delivered"
              value={health.webhooks.endpointConfigured ? `${formatNumber(health.webhooks.delivered)}/${formatNumber(health.webhooks.events)}` : DASH}
              hint={health.webhooks.endpointConfigured ? `${formatNumber(health.webhooks.retrying)} retrying · ${formatNumber(health.webhooks.failed)} failed` : "No endpoint configured"}
              icon={<Webhook className="w-4 h-4" />}
            />
            <KpiCard
              label="Webhook success rate"
              value={formatPercent(health.webhooks.successRate)}
              hint={`Avg latency ${formatMs(health.webhooks.avgLatencyMs)}`}
              tone={health.webhooks.failed > 0 ? "red" : "default"}
            />
          </div>
        )}
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <div className="p-5 flex items-center justify-between gap-3 border-b border-[#002e2c]/10">
          <h3 className="text-sm font-semibold">Recent referrals</h3>
          <button type="button" onClick={() => onNavigate("referrals")} className="text-xs font-semibold text-[#005b57] hover:underline">
            View all →
          </button>
        </div>
        {overview.recentReferrals.length === 0 ? (
          <EmptyState title="No referrals in this environment yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[#52706e] bg-[#FAF6E7]/60">
                <tr>
                  <th className={thCls}>Tracking code</th>
                  <th className={thCls}>Your reference</th>
                  <th className={thCls}>Patient</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#002e2c]/5">
                {overview.recentReferrals.map((r: any) => (
                  <tr key={r.referralId}>
                    <td className={`${tdCls} font-mono font-semibold`}>{r.trackingCode || DASH}</td>
                    <td className={`${tdCls} font-mono`}>{r.partnerExternalId || DASH}</td>
                    <td className={tdCls}>{r.patientName || DASH}</td>
                    <td className={tdCls}>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
