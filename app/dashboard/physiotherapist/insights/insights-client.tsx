'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, DollarSign, Calendar, TrendingUp, Activity, Users, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface InsightsClientProps {
    initialStats: any; // Using any for now to match existing type looseness, ideally should be typed
}

export default function InsightsClient({ initialStats }: InsightsClientProps) {
    // Subscribe to real-time updates
    // We use the initialStats as fallback while connecting or if query is loading
    const liveStats = useQuery(api.analytics.getPhysiotherapistStats);

    // Use live data if available, otherwise fall back to initial cached data
    const stats = liveStats || initialStats;

    if (!stats) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="space-y-8 p-6 max-w-7xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Analytics & Insights</h1>
                <p className="text-gray-600 mt-2">Track your performance, earnings, and patient engagement.</p>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    title="Total Earnings"
                    value={`₦${stats.earnings.total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    icon={DollarSign}
                    description="Total revenue generated"
                />
                <MetricCard
                    title="Pending Payments"
                    value={`₦${stats.earnings.pending.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    icon={Activity}
                    description="Invoices awaiting payment"
                />
                <MetricCard
                    title="Completed Sessions"
                    value={stats.appointments.completed}
                    icon={Calendar}
                    description="Total appointments conducted"
                />
                <MetricCard
                    title="Completion Rate"
                    value={`${stats.appointments.total ? Math.round((stats.appointments.completed / stats.appointments.total) * 100) : 0}%`}
                    icon={TrendingUp}
                    description="Appointment adherence"
                />
                <MetricCard
                    title="Profile Views"
                    value={stats.profileViews}
                    icon={Users}
                    description="Total profile visits"
                    infoText="The number of times your profile has been viewed by potential patients in the marketplace."
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Earnings Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Earnings Overview</CardTitle>
                        <CardDescription>Monthly revenue breakdown</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.earnings.chartData}>
                                <defs>
                                    <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#18181b" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#18181b" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#6b7280', fontSize: 12 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(value) => `₦${value.toLocaleString('en-NG')}`}
                                    tick={{ fill: '#6b7280', fontSize: 12 }}
                                />
                                <Tooltip
                                    formatter={(value: number) => [`₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Earnings']}
                                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="amount"
                                    stroke="#18181b"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorEarnings)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Appointments Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Appointment Status</CardTitle>
                        <CardDescription>Breakdown of session outcomes</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[
                                { name: 'Completed', value: stats.appointments.completed, fill: '#18181b' },
                                { name: 'Upcoming', value: stats.appointments.upcoming, fill: '#71717a' },
                                { name: 'Cancelled', value: stats.appointments.cancelled, fill: '#e4e4e7' },
                            ]}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#6b7280', fontSize: 12 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#6b7280', fontSize: 12 }}
                                />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                                />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function MetricCard({ title, value, icon: Icon, trend, trendUp, description, infoText }: any) {
    return (
        <Card className="border border-gray-200 shadow-sm bg-white hover:border-gray-300 transition-colors">
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-500">{title}</p>
                        {infoText && (
                            <TooltipProvider>
                                <UITooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-4 w-4 text-gray-400 cursor-help hover:text-gray-600 transition-colors" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="max-w-xs text-xs">{infoText}</p>
                                    </TooltipContent>
                                </UITooltip>
                            </TooltipProvider>
                        )}
                    </div>
                    <Icon className="h-5 w-5 text-gray-400" />
                </div>
                <div>
                    <h3 className="text-3xl font-bold text-gray-900 tracking-tight">{value}</h3>
                    {trend && (
                        <div className={`flex items-center text-sm font-medium mt-2 ${trendUp ? 'text-green-600' : 'text-red-600'}`}>
                            {trend}
                            {trendUp ? <TrendingUp className="h-4 w-4 ml-1" /> : <TrendingUp className="h-4 w-4 ml-1 rotate-180" />}
                        </div>
                    )}
                    {description && <p className="text-xs text-gray-400 mt-2">{description}</p>}
                </div>
            </CardContent>
        </Card>
    );
}
