'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import {
    StreamVideo,
    StreamVideoClient,
    StreamCall,
    useCallStateHooks,
    SpeakerLayout,
    CallingState,
    useCall,
    StreamTheme,
    CallControls,
} from '@stream-io/video-react-sdk'
import '@stream-io/video-react-sdk/dist/css/styles.css'
import { Loader2, Phone, Users, Video, Shield, XOctagon } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── Guest Call UI ──────────────────────────────────────────

function GuestCallUI({ callId, onLeave }: { callId: string; onLeave: () => void }) {
    const call = useCall()
    const { useCallCallingState, useParticipantCount } = useCallStateHooks()
    const callingState = useCallCallingState()
    const participantCount = useParticipantCount()
    const hasRedirectedRef = useRef(false)
    const hasJoinedRef = useRef(false)

    // Track when the call has been joined at least once
    useEffect(() => {
        if (callingState === CallingState.JOINED) {
            hasJoinedRef.current = true
        }
    }, [callingState])

    // Auto-navigate when call ends
    useEffect(() => {
        if (!call) return
        const handleCallEnded = () => {
            if (!hasRedirectedRef.current) {
                hasRedirectedRef.current = true
                setTimeout(() => onLeave(), 500)
            }
        }
        call.on('call.ended', handleCallEnded)
        return () => { call.off('call.ended', handleCallEnded) }
    }, [call, onLeave])

    // Only treat LEFT/IDLE as ended if we were previously joined
    useEffect(() => {
        if (!hasJoinedRef.current) return
        const isCallEnded = callingState === CallingState.LEFT || callingState === CallingState.IDLE
        if (isCallEnded && !hasRedirectedRef.current) {
            const timeout = setTimeout(() => {
                if (!hasRedirectedRef.current) {
                    hasRedirectedRef.current = true
                    onLeave()
                }
            }, 2000)
            return () => clearTimeout(timeout)
        }
    }, [callingState, onLeave])

    const handleLeave = async () => {
        try {
            await call?.leave()
        } catch { }
        onLeave()
    }

    if (callingState === CallingState.JOINING) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-900 to-gray-900 text-white">
                <div className="text-center space-y-4">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto text-teal-400" />
                    <p className="text-xl">Joining your therapy session...</p>
                </div>
            </div>
        )
    }

    if (callingState === CallingState.OFFLINE) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-900 to-gray-900 text-white">
                <div className="text-center space-y-4">
                    <Phone className="h-12 w-12 text-red-400 mx-auto" />
                    <p className="text-xl">Connection Lost</p>
                    <p className="text-gray-400">Please check your internet and try again.</p>
                </div>
            </div>
        )
    }

    // Only show "Session Ended" if we were previously joined and now count is 0
    if (hasJoinedRef.current && participantCount === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-900 to-gray-900 text-white">
                <div className="text-center space-y-4">
                    <Phone className="h-12 w-12 text-gray-400 mx-auto" />
                    <p className="text-xl">Session Ended</p>
                    <p className="text-gray-400">Thank you for using Rehabify Health via AwaDoc.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-screen flex flex-col bg-neutral-950 text-white">
            {/* Header with AwaDoc branding */}
            <div className="bg-gradient-to-r from-teal-900/80 to-neutral-900/80 backdrop-blur px-4 py-3 flex items-center justify-between border-b border-teal-500/20">
                <div className="flex items-center space-x-4">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 ring-1 ring-teal-500/30">
                        <Shield className="h-4 w-4" />
                        <span className="text-xs font-medium">AwaDoc Patient</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Users className="h-5 w-5 text-white/70" />
                        <span className="text-white/70 text-sm">{participantCount} participant{participantCount !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                <div className="text-sm text-white/40">
                    Rehabify Health
                </div>
            </div>

            {/* Video Area */}
            <div className="flex-1 relative bg-neutral-950 p-0 sm:p-4">
                <div className="h-full w-full rounded-none sm:rounded-md overflow-hidden border-0 sm:border">
                    <SpeakerLayout participantsBarPosition="bottom" />
                </div>
            </div>

            {/* Floating Controls */}
            <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex items-center justify-center">
                <div className="pointer-events-auto rounded-full bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/40 shadow-lg ring-1 ring-white/10">
                    <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3 text-white">
                        <CallControls onLeave={handleLeave} />
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Main Guest Page ────────────────────────────────────────

export default function GuestVideoCallPage() {
    const params = useParams()
    const searchParams = useSearchParams()
    const router = useRouter()
    const callId = params.callId as string
    const guestToken = searchParams.get('guest')

    const [status, setStatus] = useState<'validating' | 'joining' | 'joined' | 'error' | 'ended'>('validating')
    const [error, setError] = useState<string | null>(null)
    const [sessionInfo, setSessionInfo] = useState<{
        patientName: string
        physioName: string
        mode: string
    } | null>(null)
    const [client, setClient] = useState<StreamVideoClient | null>(null)
    type StreamCallHandle = ReturnType<StreamVideoClient['call']>
    const [call, setCall] = useState<StreamCallHandle | null>(null)
    const initializedRef = useRef(false)

    // Validate guest token and join call
    useEffect(() => {
        if (!guestToken || !callId || initializedRef.current) return
        initializedRef.current = true

        const controller = new AbortController()
        let mounted = true
        const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

        const init = async () => {
            try {
                // Step 1: Validate token and get Stream credentials
                const res = await fetch('/api/awadoc/validate-guest', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ therapyId: callId, guestToken }),
                    signal: controller.signal,
                })

                const data = await res.json()

                if (!mounted) return

                if (!res.ok || !data.valid) {
                    setError(data.error ?? 'Invalid or expired link')
                    setStatus('error')
                    return
                }

                setSessionInfo({
                    patientName: data.session.patientName,
                    physioName: data.session.physioName,
                    mode: data.session.mode,
                })

                // Step 2: Initialize Stream client with guest credentials
                if (!mounted) return
                setStatus('joining')
                const streamClient = StreamVideoClient.getOrCreateInstance({
                    apiKey: data.stream.apiKey,
                    user: {
                        id: data.stream.userId,
                        name: data.stream.userName,
                    },
                    token: data.stream.token,
                })

                if (!mounted) return
                setClient(streamClient)

                // Step 3: Join the call
                const streamCall = streamClient.call('default', callId)
                await streamCall.join({ create: false })

                if (!mounted) return
                setCall(streamCall)
                setStatus('joined')
            } catch (err) {
                if (!mounted) return
                if (err instanceof DOMException && err.name === 'AbortError') {
                    setError('Connection timed out. Please try again.')
                } else {
                    setError(err instanceof Error ? err.message : 'Failed to join therapy session')
                }
                setStatus('error')
                console.error('[AwaDoc Guest] Init error:', err)
            } finally {
                clearTimeout(timeoutId)
            }
        }

        init()

        return () => {
            mounted = false
            controller.abort()
            clearTimeout(timeoutId)
        }
    }, [callId, guestToken])

    const handleCallEnd = useCallback(() => {
        setStatus('ended')
        // Disconnect Stream client
        try { client?.disconnectUser() } catch { }
    }, [client])

    // Cleanup on page unload
    useEffect(() => {
        const handleUnload = () => {
            try { client?.disconnectUser() } catch { }
        }
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', handleUnload)
        }
        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('beforeunload', handleUnload)
            }
        }
    }, [client])

    // No guest token provided
    if (!guestToken) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-900 to-gray-900 text-white">
                <div className="text-center space-y-4 max-w-md mx-auto px-6">
                    <Shield className="h-16 w-16 text-red-400 mx-auto" />
                    <h1 className="text-2xl font-bold">Access Denied</h1>
                    <p className="text-gray-400">
                        This link is missing a valid guest token. Please use the link provided by AwaDoc to join your therapy session.
                    </p>
                </div>
            </div>
        )
    }

    // Validating
    if (status === 'validating') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-900 to-gray-900 text-white">
                <div className="text-center space-y-4">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto text-teal-400" />
                    <h1 className="text-xl font-semibold">Verifying your access...</h1>
                    <p className="text-gray-400 text-sm">Powered by Rehabify Health</p>
                </div>
            </div>
        )
    }

    // Error
    if (status === 'error') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-900 to-gray-900 text-white">
                <div className="text-center space-y-4 max-w-md mx-auto px-6">
                    <XOctagon className="h-16 w-16 text-red-400 mx-auto" />
                    <h1 className="text-2xl font-bold">Unable to Join</h1>
                    <p className="text-gray-400">{error}</p>
                    <p className="text-gray-500 text-sm">
                        Please contact your AwaDoc representative for a new link.
                    </p>
                </div>
            </div>
        )
    }

    // Joining / initializing
    if (status === 'joining' || !client || !call) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-900 to-gray-900 text-white">
                <div className="text-center space-y-4">
                    <Video className="h-12 w-12 text-teal-400 mx-auto animate-pulse" />
                    <h1 className="text-xl font-semibold">
                        Joining session with {sessionInfo?.physioName ?? 'your physiotherapist'}...
                    </h1>
                    <p className="text-gray-400 text-sm">Please allow camera and microphone access when prompted</p>
                </div>
            </div>
        )
    }

    // Call ended
    if (status === 'ended') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-900 to-gray-900 text-white">
                <div className="text-center space-y-6 max-w-md mx-auto px-6">
                    <div className="h-20 w-20 mx-auto rounded-full bg-teal-500/20 flex items-center justify-center">
                        <Phone className="h-10 w-10 text-teal-400" />
                    </div>
                    <h1 className="text-2xl font-bold">Session Complete</h1>
                    <p className="text-gray-400">
                        Thank you for your session with {sessionInfo?.physioName ?? 'your physiotherapist'}.
                        Your physiotherapist will follow up with any recommended next steps.
                    </p>
                    <p className="text-teal-400/60 text-sm">
                        Powered by Rehabify Health × AwaDoc
                    </p>
                </div>
            </div>
        )
    }

    // Active call
    return (
        <StreamVideo client={client}>
            <StreamCall call={call}>
                <StreamTheme>
                    <GuestCallUI callId={callId} onLeave={handleCallEnd} />
                </StreamTheme>
            </StreamCall>
        </StreamVideo>
    )
}
