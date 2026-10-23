import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, TrendingUp, Calendar, DollarSign, Activity } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface InsightsSidebarProps {
    role: 'physiotherapist' | 'patient';
    stats: any; // Type this properly based on the query return type
    className?: string;
}

export function InsightsSidebar({ role, stats, className }: InsightsSidebarProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const router = useRouter();

    const toggleSidebar = () => setIsCollapsed(!isCollapsed);

    if (!stats) return null;

    return (
        <motion.div
            initial={{ width: isCollapsed ? 60 : 280 }}
            animate={{ width: isCollapsed ? 60 : 280 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className={cn(
                "h-full bg-white border-l border-gray-200 shadow-sm relative flex flex-col hidden lg:flex",
                className
            )}
        >
            <Button
                variant="ghost"
                size="icon"
                className="absolute -left-3 top-6 h-6 w-6 rounded-full bg-white border border-gray-200 shadow-sm z-10 hover:bg-gray-50"
                onClick={toggleSidebar}
            >
                {isCollapsed ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>

            <div className="flex-1 overflow-y-auto py-6 px-3 space-y-6">
                {!isCollapsed && (
                    <div className="px-1 mb-4">
                        <h2 className="text-lg font-semibold text-gray-900">Insights</h2>
                        <p className="text-xs text-gray-500">Your activity at a glance</p>
                    </div>
                )}

                {/* Content based on Role */}
                {role === 'physiotherapist' && (
                    <>
                        <InsightCard
                            key="earnings"
                            icon={DollarSign}
                            title="Total Earnings"
                            value={`₦${stats.earnings?.total?.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`}
                            collapsed={isCollapsed}
                        />
                        <InsightCard
                            key="appointments"
                            icon={Calendar}
                            title="Appointments"
                            value={stats.appointments?.total || 0}
                            subValue={`${stats.appointments?.upcoming || 0} upcoming`}
                            collapsed={isCollapsed}
                        />
                        <InsightCard
                            key="completion"
                            icon={Activity}
                            title="Completion Rate"
                            value={`${stats.appointments?.total ? Math.round((stats.appointments.completed / stats.appointments.total) * 100) : 0}%`}
                            collapsed={isCollapsed}
                        />
                    </>
                )}

                {role === 'patient' && (
                    <>
                        <InsightCard
                            key="sessions"
                            icon={Activity}
                            title="Sessions Done"
                            value={stats.sessions?.completed || 0}
                            trend="Keep it up!"
                            collapsed={isCollapsed}
                        />
                        <InsightCard
                            key="upcoming"
                            icon={Calendar}
                            title="Upcoming"
                            value={stats.sessions?.upcoming || 0}
                            subValue="Scheduled sessions"
                            collapsed={isCollapsed}
                        />
                        <InsightCard
                            key="adherence"
                            icon={TrendingUp}
                            title="Plan Adherence"
                            value={`${stats.treatment?.activePlans > 0 ? 'Active' : 'No Active Plans'}`}
                            subValue={`${stats.treatment?.completedExercises || 0} exercises done`}
                            collapsed={isCollapsed}
                        />
                    </>
                )}

                {!isCollapsed && (
                    <div className="pt-4">
                        <Button
                            className="w-full bg-gray-900 text-white hover:bg-gray-800"
                            onClick={() => router.push(`/dashboard/${role}/insights`)}
                        >
                            View Full Analytics
                        </Button>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function InsightCard({ icon: Icon, title, value, subValue, trend, collapsed }: any) {
    if (collapsed) {
        return (
            <div className="flex justify-center items-center h-10 w-10 mx-auto">
                <Icon className="h-5 w-5 text-gray-600" />
            </div>
        );
    }

    return (
        <Card className="border border-gray-200 shadow-sm bg-white hover:border-gray-300 transition-colors">
            <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-medium text-gray-500">{title}</p>
                    <Icon className="h-4 w-4 text-gray-400" />
                </div>
                <div>
                    <h3 className="text-xl font-semibold text-gray-900 tracking-tight">{value}</h3>
                    {subValue && <p className="text-xs text-gray-500 mt-1">{subValue}</p>}
                    {trend && <p className="text-xs text-green-600 font-medium mt-1">{trend}</p>}
                </div>
            </CardContent>
        </Card>
    );
}
