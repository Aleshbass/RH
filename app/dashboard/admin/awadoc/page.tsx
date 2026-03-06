'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import {
    Activity,
    DollarSign,
    ArrowUpRight,
    CheckCircle,
    Clock,
    AlertTriangle,
    ExternalLink,
    RefreshCw,
    FlaskConical,
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────

interface WebhookEvent {
    eventId: string
    eventType: string
    direction: 'inbound' | 'outbound'
    status: 'success' | 'error'
    processedAt: number
    errorMessage?: string
}

// ── Constants ───────────────────────────────────────────

/** Commission rate — single source of truth, must match convex/awadoc.ts */
const COMMISSION_RATE = 0.2
const COMMISSION_PERCENT = `${COMMISSION_RATE * 100}%`

// ── Helpers (module-level, not recreated every render) ──

const dateFormatter = new Intl.DateTimeFormat('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
})

function formatCurrency(amount: number) {
    // Amount is in kobo, convert to Naira
    return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 0,
    }).format(amount / 100)
}

// ── Component ───────────────────────────────────────────

export default function AwadocDashboardPage() {
    const stats = useQuery(api.awadoc.getDashboardStats)

    // Loading state
    if (stats === undefined) {
        return (
            <div className="p-8">
                <div className="space-y-6">
                    <Skeleton className="h-8 w-64" />
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                        {[...Array(4)].map((_, i) => (
                            <Skeleton key={i} className="h-32" />
                        ))}
                    </div>
                    <Skeleton className="h-96" />
                </div>
            </div>
        )
    }

    // Error state (Convex returns null on query failure in some cases)
    if (stats === null) {
        return (
            <div className="p-8">
                <div className="text-center py-16">
                    <AlertTriangle className="h-12 w-12 text-orange-400 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold mb-2">Failed to load AwaDoc data</h2>
                    <p className="text-gray-500 mb-4">
                        There was a problem fetching dashboard statistics. This may be a temporary issue.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[#005b57] text-white rounded-lg hover:bg-[#004a47] transition-colors"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Retry
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="p-8">
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">AwaDoc Integration</h1>
                        <p className="text-gray-600">
                            Monitor bookings from the AwaDoc marketplace
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/dashboard/admin/awadoc/test">
                                <FlaskConical className="h-4 w-4 mr-2" />
                                Test Integration
                            </Link>
                        </Button>
                        <Badge variant="outline" className="text-sm px-3 py-1">
                            <span className="w-2 h-2 bg-green-500 rounded-full mr-2 inline-block" />
                            Test Environment
                        </Badge>
                    </div>
                </div>

                {/* Metrics Cards */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {/* Total Sessions */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
                            <Activity className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.totalSessions}</div>
                            <p className="text-xs text-muted-foreground">
                                From AwaDoc marketplace
                            </p>
                        </CardContent>
                    </Card>

                    {/* Confirmed */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
                            <CheckCircle className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.confirmed}</div>
                            <p className="text-xs text-muted-foreground">
                                {stats.completed} completed
                            </p>
                        </CardContent>
                    </Card>

                    {/* Gross Revenue */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Gross Revenue</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {formatCurrency(stats.totalGross)}
                            </div>
                            <p className="text-xs text-red-500">
                                -{formatCurrency(stats.totalCommission)} AwaDoc commission ({COMMISSION_PERCENT})
                            </p>
                        </CardContent>
                    </Card>

                    {/* Net Earnings */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Net Earnings</CardTitle>
                            <ArrowUpRight className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">
                                {formatCurrency(stats.totalNet)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                After {COMMISSION_PERCENT} AwaDoc commission
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Revenue Split Visualization */}
                <Card>
                    <CardHeader>
                        <CardTitle>Revenue Split</CardTitle>
                        <CardDescription>
                            AwaDoc deducts {COMMISSION_PERCENT} commission from each session. An additional 4% service fee is charged to the patient by AwaDoc (not deducted from your earnings).
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">Rehabify Earnings ({100 - COMMISSION_RATE * 100}%)</span>
                                <span className="font-bold text-green-600">{formatCurrency(stats.totalNet)}</span>
                            </div>
                            <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden flex">
                                <div
                                    className="bg-[#005b57] h-full rounded-l-full transition-all"
                                    style={{ width: stats.totalGross > 0 ? `${(1 - COMMISSION_RATE) * 100}%` : '0%' }}
                                />
                                <div
                                    className="bg-orange-400 h-full rounded-r-full transition-all"
                                    style={{ width: stats.totalGross > 0 ? `${COMMISSION_RATE * 100}%` : '0%' }}
                                />
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">AwaDoc Commission ({COMMISSION_PERCENT})</span>
                                <span className="text-orange-500">{formatCurrency(stats.totalCommission)}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Recent Event Log */}
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Events</CardTitle>
                        <CardDescription>
                            Webhook event audit trail (latest 20)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {stats.recentEvents.length > 0 ? (
                            <div className="space-y-2">
                                {stats.recentEvents.map((event: WebhookEvent, idx: number) => (
                                    <div
                                        key={`${event.eventId}-${idx}`}
                                        className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${event.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                                                }`} />
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">
                                                    {event.eventType}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {dateFormatter.format(new Date(event.processedAt))}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge
                                                variant={event.direction === 'inbound' ? 'default' : 'secondary'}
                                                className="text-xs"
                                            >
                                                {event.direction === 'inbound' ? '← In' : '→ Out'}
                                            </Badge>
                                            {event.status === 'error' && (
                                                <Badge variant="destructive" className="text-xs">
                                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                                    Error
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No events yet</h3>
                                <p className="text-gray-500 text-sm max-w-sm mx-auto">
                                    Events will appear here once AwaDoc starts sending webhook requests to your endpoint.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Integration Info */}
                <Card>
                    <CardHeader>
                        <CardTitle>Integration Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-gray-500">Webhook URL</p>
                                <code className="text-sm bg-gray-50 p-2 rounded block break-all">
                                    /api/awadoc/webhook
                                </code>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-gray-500">Environment</p>
                                <p className="text-sm">Test (Staging)</p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-gray-500">Commission Rate</p>
                                <p className="text-sm">{COMMISSION_PERCENT} (AwaDoc Merchant Commission)</p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-gray-500">AwaDoc Docs</p>
                                <a
                                    href="https://partners-staging.awadoc.com/api-doc"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-[#005b57] hover:underline inline-flex items-center gap-1"
                                >
                                    API Documentation
                                    <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
