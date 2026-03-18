'use client'

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    ArrowLeft,
    Play,
    CheckCircle,
    XCircle,
    Loader2,
    User,
    MapPin,
    Star,
    Clock,
    Monitor,
    Building2,
    Zap,
} from 'lucide-react'
import Link from 'next/link'

// ── Types ───────────────────────────────────────────────

type TestResult = {
    eventType: string
    status: 'idle' | 'running' | 'success' | 'error'
    response?: unknown
    error?: string
    duration?: number
}

const EVENT_TYPES = [
    {
        id: 'availability',
        label: 'Availability Query',
        event: 'consultation.availability.query',
        description: 'Simulates AwaDoc searching for available physiotherapists in your system',
    },
    {
        id: 'request',
        label: 'Consultation Request',
        event: 'consultation.request',
        description: 'Simulates a patient selecting a physio and requesting a booking',
    },
    {
        id: 'confirmed',
        label: 'Payment Confirmed',
        event: 'consultation.confirmed',
        description: 'Simulates AwaDoc confirming that payment was successful',
    },
] as const

// ── Helpers ─────────────────────────────────────────────

function formatRate(kobo: number): string {
    return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 0,
    }).format(kobo / 100)
}

// ── Component ───────────────────────────────────────────

export default function AwadocTestPage() {
    const physios = useQuery(api.awadoc.getAvailablePhysios, {})
    const [results, setResults] = useState<Record<string, TestResult>>({})
    const [consultationId, setConsultationId] = useState<string | null>(null)
    const [runAllInProgress, setRunAllInProgress] = useState(false)

    const updateResult = (id: string, update: Partial<TestResult>) => {
        setResults((prev) => ({
            ...prev,
            [id]: { ...prev[id], ...update } as TestResult,
        }))
    }

    const runTest = async (eventId: string, eventType: string, overrideConsultationId?: string) => {
        updateResult(eventId, { eventType, status: 'running' })
        const start = performance.now()

        // Use override if provided (avoids stale closure in runAllTests)
        const activeConsultationId = overrideConsultationId ?? consultationId

        try {
            const res = await fetch('/api/awadoc/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventType,
                    consultationId: activeConsultationId ?? undefined,
                }),
            })

            const data = await res.json()
            const duration = Math.round(performance.now() - start)

            if (res.ok) {
                // Store consultation ID from request event for follow-up tests
                if (eventId === 'request' && data.response?.consultation?.id) {
                    setConsultationId(data.response.consultation.id)
                }
                updateResult(eventId, {
                    status: 'success',
                    response: data.response,
                    duration,
                })
                // Return consultation ID so runAllTests can chain it
                return data.response?.consultation?.id ?? null
            } else {
                updateResult(eventId, {
                    status: 'error',
                    error: data.error ?? `HTTP ${res.status}`,
                    response: data,
                    duration,
                })
                return null
            }
        } catch (err) {
            const duration = Math.round(performance.now() - start)
            updateResult(eventId, {
                status: 'error',
                error: err instanceof Error ? err.message : 'Network error',
                duration,
            })
            return null
        }
    }

    const runAllTests = async () => {
        setRunAllInProgress(true)
        let chainedConsultationId: string | null = null
        try {
            for (const event of EVENT_TYPES) {
                // Pass the chained consultation ID from test 2 to test 3
                const resultId = await runTest(event.id, event.event, chainedConsultationId ?? undefined)
                // Capture consultation ID from the "request" test for use in "confirmed"
                if (event.id === 'request' && resultId) {
                    chainedConsultationId = resultId
                }
                // Small delay between tests to let Convex mutations settle
                await new Promise((resolve) => setTimeout(resolve, 800))
            }
        } finally {
            setRunAllInProgress(false)
        }
    }

    const isAnyRunning = runAllInProgress || Object.values(results).some((r) => r.status === 'running')

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/dashboard/admin/awadoc">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Dashboard
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold">AwaDoc Integration Test</h1>
                        <p className="text-muted-foreground text-sm">
                            Simulate webhook events to verify your integration before the joint test session
                        </p>
                    </div>
                </div>
                <Button
                    onClick={runAllTests}
                    disabled={isAnyRunning}
                    className="gap-2"
                >
                    {isAnyRunning ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Zap className="h-4 w-4" />
                    )}
                    Run All Tests
                </Button>
            </div>

            {/* Available Physios Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Available Physiotherapists
                    </CardTitle>
                    <CardDescription>
                        These are the physios AwaDoc would see when querying your system.
                        {physios && physios.length === 0 && (
                            <span className="text-destructive font-medium ml-1">
                                ⚠️ No physios available — AwaDoc tests will return empty results!
                                Make sure at least 1 physio has &quot;Available on Marketplace&quot; enabled.
                            </span>
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!physios ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                        </div>
                    ) : physios.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-destructive/50 p-6 text-center">
                            <p className="text-destructive font-medium">No marketplace-available physios found</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Go to a physiotherapist profile and enable &quot;Available on Marketplace&quot; to make them visible to AwaDoc.
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {physios.map((p: { profileId: string; firstName: string; lastName: string; location: string; hourlyRate: number; averageRating: number; yearsOfExperience: number; offersOnlineSessions: boolean; offersInPersonSessions: boolean }) => (
                                <div
                                    key={p.profileId}
                                    className="rounded-lg border p-4 space-y-2"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                                            {p.firstName?.[0]}{p.lastName?.[0]}
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">
                                                {p.firstName} {p.lastName}
                                            </p>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <MapPin className="h-3 w-3" />
                                                {p.location || 'No location'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        <Badge variant="secondary" className="text-xs">
                                            {formatRate(p.hourlyRate)}/hr
                                        </Badge>
                                        {p.averageRating > 0 && (
                                            <Badge variant="outline" className="text-xs gap-1">
                                                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                                {p.averageRating.toFixed(1)}
                                            </Badge>
                                        )}
                                        {p.yearsOfExperience > 0 && (
                                            <Badge variant="outline" className="text-xs gap-1">
                                                <Clock className="h-3 w-3" />
                                                {p.yearsOfExperience}y exp
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex gap-1.5">
                                        {p.offersOnlineSessions && (
                                            <Badge variant="outline" className="text-xs gap-1 text-emerald-600 border-emerald-200">
                                                <Monitor className="h-3 w-3" />
                                                Online
                                            </Badge>
                                        )}
                                        {p.offersInPersonSessions && (
                                            <Badge variant="outline" className="text-xs gap-1 text-blue-600 border-blue-200">
                                                <Building2 className="h-3 w-3" />
                                                In-Person
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Test Events */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold">Webhook Event Simulation</h2>
                <p className="text-sm text-muted-foreground">
                    Each test sends a signed request to your webhook endpoint, just like AwaDoc would.
                    Run them in order: Availability → Request → Confirmed.
                </p>

                {consultationId && (
                    <div className="rounded-lg bg-muted/50 border px-4 py-2 text-sm">
                        <span className="text-muted-foreground">Active Consultation ID: </span>
                        <code className="font-mono text-primary">{consultationId}</code>
                        <span className="text-muted-foreground"> (used for follow-up tests)</span>
                    </div>
                )}

                {EVENT_TYPES.map((event, idx) => {
                    const result = results[event.id]
                    return (
                        <Card key={event.id}>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-bold">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <CardTitle className="text-base">{event.label}</CardTitle>
                                            <CardDescription className="text-xs">
                                                <code>{event.event}</code> — {event.description}
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {result?.status === 'success' && (
                                            <Badge className="bg-emerald-100 text-emerald-700 gap-1">
                                                <CheckCircle className="h-3 w-3" />
                                                {result.duration}ms
                                            </Badge>
                                        )}
                                        {result?.status === 'error' && (
                                            <Badge variant="destructive" className="gap-1">
                                                <XCircle className="h-3 w-3" />
                                                Failed
                                            </Badge>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => runTest(event.id, event.event)}
                                            disabled={result?.status === 'running' || runAllInProgress}
                                        >
                                            {result?.status === 'running' ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Play className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            {result?.error && (
                                <CardContent className="pt-0">
                                    <p className="text-sm text-destructive">{result.error}</p>
                                </CardContent>
                            )}
                            {result?.response !== undefined && result?.response !== null && (
                                <CardContent className="pt-0">
                                    <div className="rounded-lg bg-muted/50 p-3 overflow-auto max-h-64">
                                        <pre className="text-xs font-mono whitespace-pre-wrap">
                                            {JSON.stringify(result.response as Record<string, unknown>, null, 2)}
                                        </pre>
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
