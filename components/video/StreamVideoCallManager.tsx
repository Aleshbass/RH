"use client"
import React, { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { Id } from '@/convex/_generated/dataModel'
import StreamVideoCall from './StreamVideoCall'
import JoinCallButton from './JoinCallButton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Video, Users, Clock, Loader2, Plus, Share, Copy, History as HistoryIcon, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAction, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

// Sanitizes full URLs or prefixed paths to a bare callId
const sanitizeToCallId = (value: string) => {
  if (!value) return ''
  try {
    if (value.startsWith('http')) {
      const url = new URL(value)
      const parts = url.pathname.split('/').filter(Boolean)
      return parts[parts.length - 1] || ''
    }
    return value.replace(/^\/(video-call|video)\//, '')
  } catch {
    return value
  }
}

interface VideoCallManagerProps {
  appointmentId?: Id<"appointments">
  defaultParticipants?: Id<"users">[]
  onCallEnd?: () => void
}

interface CallHistoryItem {
  _id: Id<"videoCalls">
  roomId: string
  streamCallId?: string
  status: "scheduled" | "active" | "ended" | "cancelled" | "missed"
  startTime?: number
  endTime?: number
  duration?: number
  callType: "appointment" | "consultation" | "emergency"
  participantDetails?: Array<{
    id: Id<"users">
    firstName?: string
    lastName?: string
    email?: string
    imageUrl?: string
  }>
}

export default function StreamVideoCallManager({
  defaultParticipants = [],
  onCallEnd
}: VideoCallManagerProps) {
  const { user } = useUser()
  const [activeCallId, setActiveCallId] = useState<string | null>(null)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [joinValue, setJoinValue] = useState('')
  const sanitizedJoinId = sanitizeToCallId(joinValue)
  const [isCreatingCall, setIsCreatingCall] = useState(false)
  const [showCallLink, setShowCallLink] = useState(false)
  const [callLink, setCallLink] = useState('')

  const createStreamCall = useAction(api.stream.createStreamCall)
  const callHistory = useQuery(api.stream_queries.getUserStreamCalls, { limit: 20 })
  const currentUser = useQuery(api.users.getMyUser)

  // Persist active call across page refreshes
  useEffect(() => {
    if (activeCallId) {
      sessionStorage.setItem('rehabify-stream-call', activeCallId)
    } else {
      sessionStorage.removeItem('rehabify-stream-call')
    }
  }, [activeCallId])

  // On mount, restore existing call if present
  useEffect(() => {
    const savedCallId = sessionStorage.getItem('rehabify-stream-call')
    if (savedCallId && !activeCallId) {
      setActiveCallId(savedCallId)
    }
  }, [activeCallId])

  const handleCreateCall = async () => {
    if (!user || !currentUser) {
      toast.error('Please sign in to create a call')
      return
    }

    setIsCreatingCall(true)
    // Generate a unique call ID first so we can show the UI immediately
    const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Generate shareable link and reveal the video UI right away
    const shareableLink = `${window.location.origin}/video-call/${callId}`
    setCallLink(shareableLink)
    setShowCallLink(true)
    setActiveCallId(callId)
    // setShowCreateDialog(false) // Commented out as setShowCreateDialog is not defined
    try { navigator.clipboard.writeText(shareableLink) } catch {}
    toast.success('Call created! Link copied to clipboard')

    try {
      // Prepare participants
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const participants: any[] = []
      participants.push({
        userId: user.id,
        userName: user.fullName || user.emailAddresses[0]?.emailAddress || 'Anonymous',
        userImage: user.imageUrl,
        role: 'host'
      })

      if (defaultParticipants.length > 0 && currentUser) {
        defaultParticipants.forEach(participantId => {
          participants.push({ userId: participantId, userName: 'Participant', role: 'participant' })
        })
      }

      // Create the call metadata on the server in the background
      await createStreamCall({
        callId,
        callType: 'default',
        participants,
        settings: {
          recordingEnabled: false,
          transcriptionEnabled: false,
          maxDuration: 7200,
          geoFencing: false,
        }
      })
    } catch (error) {
      console.error('Error creating call on server (UI is active):', error)
      toast.warning('Call UI started. Syncing with server failed; will retry automatically.')
    } finally {
      setIsCreatingCall(false)
    }
  }

  const handleJoinCall = (callId: string) => {
    setActiveCallId(callId)
  }

  const handleEndCall = async () => {
    if (!activeCallId) return
    // Do NOT end the Stream call globally here; only leave locally so users can rejoin.
    try {
      setActiveCallId(null)
      sessionStorage.removeItem('rehabify-stream-call')
      onCallEnd?.()
      toast.success('You left the call')
    } catch (error) {
      console.error('Failed to leave call:', error)
      toast.error('Failed to leave call properly')
    }
  }

  const copyCallId = (callId: string) => {
    navigator.clipboard.writeText(callId)
    toast.success('Call ID copied to clipboard!')
  }

  const shareCall = (callId: string) => {
    const shareUrl = `${window.location.origin}/video-call/${callId}`
    navigator.clipboard.writeText(shareUrl)
    toast.success('Call link copied to clipboard!')
  }

  const filteredCallHistory = callHistory?.filter((call: CallHistoryItem) => {
    if (!searchTerm) return true
    
    const searchLower = searchTerm.toLowerCase()
    return (
      call.roomId?.toLowerCase().includes(searchLower) ||
      call.streamCallId?.toLowerCase().includes(searchLower) ||
      call.participantDetails?.some(p => 
        p.firstName?.toLowerCase().includes(searchLower) ||
        p.lastName?.toLowerCase().includes(searchLower) ||
        p.email?.toLowerCase().includes(searchLower)
      )
    )
  })

  // Show Stream video call if active
  if (activeCallId) {

    return (
      <div className="relative w-full h-screen">
        {/* Call Link Banner */}
        {showCallLink && (
          <div className="absolute top-0 left-0 right-0 z-50 bg-green-600 text-white p-3">
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-medium">Share this link with participants:</span>
                <code className="bg-green-700 px-2 py-1 rounded text-sm">{callLink}</code>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(callLink)
                    toast.success('Link copied!')
                  }}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowCallLink(false)}
                  className="text-white hover:text-gray-200"
                >
                  ✕
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {/* Video Call UI */}
        <StreamVideoCall
          callId={activeCallId}
          onCallEnd={handleEndCall}
        />
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-6 w-6 text-primary" />
            Video Call Manager (Stream)
          </CardTitle>
          <CardDescription>
            Create or join video calls with patients and colleagues
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button 
              onClick={handleCreateCall} 
              className="h-20 flex-col space-y-2"
              disabled={isCreatingCall}
            >
              {isCreatingCall ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>Create New Call</span>
                </>
              )}
            </Button>
            
            <Button 
              variant="outline" 
              className="h-20 flex-col space-y-2"
              onClick={() => setShowHistoryDialog(true)}
            >
              <HistoryIcon className="h-4 w-4" />
              <span>Call History</span>
            </Button>
          </div>

          {/* Quick Join with Call ID */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                placeholder="Paste Stream link or enter Call ID..."
                value={joinValue}
                onChange={(e) => setJoinValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && sanitizedJoinId) {
                    handleJoinCall(sanitizedJoinId)
                  }
                }}
              />
              <JoinCallButton
                callId={sanitizedJoinId || undefined}
                onJoinCall={handleJoinCall}
                variant="outline"
              >
                Join Call
              </JoinCallButton>
            </div>
            {joinValue.includes('daily.co') && (
              <div className="text-xs text-amber-600">
                Legacy Daily link detected. We will join via Stream using ID: <code>{sanitizedJoinId || '—'}</code>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Call History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Call History</DialogTitle>
            <DialogDescription>
              Review your recent calls and quickly rejoin active ones. Use the search box to filter by participant or call ID.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search calls..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <ScrollArea className="h-96">
              <div className="space-y-2">
                {filteredCallHistory?.map((call: CallHistoryItem) => (
                  <Card key={call._id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={
                            call.status === 'ended' ? 'secondary' :
                            call.status === 'active' ? 'default' :
                            call.status === 'cancelled' ? 'destructive' :
                            call.status === 'missed' ? 'destructive' :
                            'outline'
                          }>
                            {call.status}
                          </Badge>
                          <span className="text-sm text-gray-500 capitalize">
                            {call.callType}
                          </span>
                        </div>
                        {call.startTime && (
                          <div className="text-sm">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(call.startTime), 'MMM d, yyyy HH:mm')}
                            </div>
                            {call.duration && (
                              <div className="text-gray-500">
                                Duration: {Math.round(call.duration / 60)} minutes
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Users className="h-3 w-3" />
                          {call.participantDetails?.length || 0} participants
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {call.status === 'active' && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setShowHistoryDialog(false)
                              handleJoinCall(call.streamCallId || call.roomId)
                            }}
                          >
                            Join
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyCallId(call.streamCallId || call.roomId)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => shareCall(call.streamCallId || call.roomId)}
                        >
                          <Share className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
                {filteredCallHistory?.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No calls found
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <div className="bg-blue-100 p-2 rounded-lg">
                <Video className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {callHistory?.filter((c: CallHistoryItem) => c.status === 'ended').length || 0}
                </div>
                <div className="text-sm text-gray-500">Total Calls</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <div className="bg-green-100 p-2 rounded-lg">
                <Clock className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {Math.round(
                    (callHistory?.reduce((acc: number, call: CallHistoryItem) => 
                      acc + (call.duration || 0), 0) || 0) / 60
                  )}m
                </div>
                <div className="text-sm text-gray-500">Total Time</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <div className="bg-purple-100 p-2 rounded-lg">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {callHistory?.filter((c: CallHistoryItem) => c.status === 'active').length || 0}
                </div>
                <div className="text-sm text-gray-500">Active Calls</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Getting Started with Stream Video</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="bg-blue-100 rounded-full p-1 mt-0.5">
              <span className="text-blue-600 text-sm font-bold px-1">1</span>
            </div>
            <div>
              <strong>Create a new call</strong> - Click &quot;Create New Call&quot; to start a video consultation
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-blue-100 rounded-full p-1 mt-0.5">
              <span className="text-blue-600 text-sm font-bold px-1">2</span>
            </div>
            <div>
              <strong>Join an existing call</strong> - Enter a Call ID or click Join from history
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-blue-100 rounded-full p-1 mt-0.5">
              <span className="text-blue-600 text-sm font-bold px-1">3</span>
            </div>
            <div>
              <strong>Share with participants</strong> - Copy and share the call link with patients
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
