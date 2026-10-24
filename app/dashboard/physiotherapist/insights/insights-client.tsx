'use client';

import { useQuery } from 'convex/react';
import { format } from 'date-fns';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/convex/_generated/api';
import { Skeleton } from '@/components/ui/skeleton';
import { useClinicTheme } from '@/components/clinic/ClinicTheme';
import { EmptyState, PageContainer, PageHeader, Panel, StatTile, formatNaira } from '@/components/physio/ui';

type Stats = {
  earnings: { total: number; pending: number; paid: number; chartData: { date: string; amount: number }[] };
  appointments: { total: number; completed: number; upcoming: number; cancelled: number };
  profileViews: number;
};

/** Chart ink per theme: one brand hue for data, quiet neutrals for everything else. */
const CHART = {
  light: { data: '#00cd0f', grid: '#e5e5e5', axis: '#737373', surface: '#ffffff', border: '#e5e5e5', text: '#171717' },
  dark: { data: '#00cd0f', grid: '#262626', axis: '#a3a3a3', surface: '#171717', border: '#262626', text: '#fafafa' },
};

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number);
  return format(new Date(year, (month || 1) - 1, 1), 'MMM yy');
}

export default function InsightsClient({ initialStats }: { initialStats: Stats | null }) {
  const liveStats = useQuery(api.analytics.getPhysiotherapistStats) as Stats | null | undefined;
  const stats = liveStats ?? initialStats;
  const { theme } = useClinicTheme();
  const ink = CHART[theme];

  if (!stats) {
    return (
      <PageContainer>
        <Skeleton className="h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </PageContainer>
    );
  }

  const earningsData = stats.earnings.chartData.map((point) => ({ ...point, label: monthLabel(point.date) }));
  const outcomeData = [
    { name: 'Completed', value: stats.appointments.completed },
    { name: 'Upcoming', value: stats.appointments.upcoming },
    { name: 'Cancelled', value: stats.appointments.cancelled },
  ];
  const finished = stats.appointments.completed + stats.appointments.cancelled;
  const completionRate = finished > 0 ? Math.round((stats.appointments.completed / finished) * 100) : null;

  const tooltipStyle = {
    background: ink.surface,
    border: `1px solid ${ink.border}`,
    borderRadius: 8,
    color: ink.text,
    fontSize: 12,
    boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)',
  };
  const axisTick = { fill: ink.axis, fontSize: 12 };

  return (
    <PageContainer>
      <PageHeader title="Insights" description="How your practice is doing." />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Received" value={formatNaira(stats.earnings.paid)} hint="from paid invoices" />
        <StatTile label="Waiting for payment" value={formatNaira(stats.earnings.pending)} hint="sent, not paid yet" />
        <StatTile label="Sessions completed" value={stats.appointments.completed} hint={`${stats.appointments.upcoming} coming up`} />
        <StatTile
          label="Completion rate"
          value={completionRate === null ? '–' : `${completionRate}%`}
          hint="of sessions that weren’t cancelled"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Money received" description="Paid invoices by month">
          {earningsData.length === 0 ? (
            <EmptyState title="No payments yet" description="Paid invoices show up here by month." />
          ) : (
            <div className="h-72 p-4" role="img" aria-label="Money received by month">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={earningsData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={ink.grid} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} dy={8} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={axisTick}
                    width={72}
                    tickFormatter={(value: number) => formatNaira(value)}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: ink.axis }}
                    cursor={{ stroke: ink.axis, strokeDasharray: '3 3' }}
                    formatter={(value: number) => [formatNaira(value), 'Received']}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke={ink.data}
                    strokeWidth={2}
                    fill={ink.data}
                    fillOpacity={0.08}
                    dot={false}
                    activeDot={{ r: 4, stroke: ink.surface, strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <table className="sr-only">
            <caption>Money received by month</caption>
            <tbody>
              {earningsData.map((point) => (
                <tr key={point.date}>
                  <th scope="row">{point.label}</th>
                  <td>{formatNaira(point.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Sessions" description="All appointments by outcome">
          {stats.appointments.total === 0 ? (
            <EmptyState title="No appointments yet" />
          ) : (
            <div className="h-72 p-4" role="img" aria-label="Appointments by outcome">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={outcomeData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={ink.grid} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTick} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={axisTick} allowDecimals={false} width={32} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: ink.grid, opacity: 0.5 }} formatter={(value: number) => [value, 'Appointments']} />
                  <Bar dataKey="value" fill={ink.data} radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <table className="sr-only">
            <caption>Appointments by outcome</caption>
            <tbody>
              {outcomeData.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </PageContainer>
  );
}
