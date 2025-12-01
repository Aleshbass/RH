'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Calendar, TrendingUp, Activity, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

export default function PatientInsightsPage() {
    const stats = useQuery(api.analytics.getPatientStats);

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
                <h1 className="text-3xl font-bold text-gray-900">My Recovery Insights</h1>
                <p className="text-gray-600 mt-2">Visualize your progress and stay motivated on your journey.</p>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    title="Sessions Completed"
                    value={stats.sessions.completed}
                    icon={CheckCircle}
                    description="Total sessions attended"
                />
                <MetricCard
                    title="Upcoming Sessions"
                    value={stats.sessions.upcoming}
                    icon={Calendar}
                    description="Scheduled appointments"
                />
                <MetricCard
                    title="Active Plans"
                    value={stats.treatment.activePlans}
                    icon={Activity}
                    description="Current treatment plans"
                />
                <MetricCard
                    title="Exercises Done"
                    value={stats.treatment.completedExercises}
                    icon={TrendingUp}
                    description="Total exercises logged"
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Session History Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Session History</CardTitle>
                        <CardDescription>Monthly attendance overview</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.sessions.chartData}>
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
                                    allowDecimals={false}
                                    tick={{ fill: '#6b7280', fontSize: 12 }}
                                />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                                />
                                <Bar dataKey="count" fill="#18181b" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Adherence/Progress Placeholder (Can be enhanced with real adherence data) */}
                <Card>
                    <CardHeader>
                        <CardTitle>Recovery Trajectory</CardTitle>
                        <CardDescription>Estimated progress based on plan completion</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <div className="flex items-center justify-center h-full text-center p-6 bg-gray-50 rounded-xl border-2 border-dashed">
                            <div>
                                <TrendingUp className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500 font-medium">Detailed Progress Tracking</p>
                                <p className="text-sm text-gray-400 mt-1">Complete more exercises and assessments to see your recovery curve.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function MetricCard({ title, value, icon: Icon, description }: any) {
    return (
        <Card className="border border-gray-200 shadow-sm bg-white hover:border-gray-300 transition-colors">
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-medium text-gray-500">{title}</p>
                    <Icon className="h-5 w-5 text-gray-400" />
                </div>
                <div>
                    <h3 className="text-3xl font-bold text-gray-900 tracking-tight">{value}</h3>
                    {description && <p className="text-xs text-gray-400 mt-2">{description}</p>}
                </div>
            </CardContent>
        </Card>
    );
}
