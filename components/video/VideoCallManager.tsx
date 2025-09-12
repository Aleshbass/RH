'use client'
// @ts-nocheck
/*
  DEPRECATED: Legacy Daily.co VideoCallManager
  ------------------------------------------------------------
  This component belongs to the old Daily.co implementation.
  The application has migrated to Stream Video SDK.

  Do NOT import or use this component in new code.
  Use `components/video/StreamVideoCallManager.tsx` instead.

  Kept temporarily for reference/rollback and will be removed.
*/
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  console.warn('[DEPRECATED] components/video/VideoCallManager.tsx (Daily) — use StreamVideoCallManager instead.')
}

import React, { useState, useEffect } from 'react'
// @ts-nocheck
import { useUser } from '@clerk/nextjs'
import { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Video, Users, Clock, Copy, History as HistoryIcon, Plus, Share, Search } from 'lucide-react'
import { useAction, useMutation, useQuery as useQueryUntyped } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useRouter } from 'next/navigation'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { v4 as uuidv4 } from 'uuid'
import { format } from 'date-fns'
import VideoCall from './VideoCall'

interface VideoCallManagerProps {
  appointmentId?: Id<"appointments">
  onCallEnd?: () => void
}

interface CallHistoryItem {
  _id: Id<"videoCalls">
  roomId: string
  status: "scheduled" | "active" | "ended" | "cancelled" | "missed"
  startTime: number
  endTime?: number
  duration?: number
  callType: "appointment" | "consultation" | "emergency"
  participants: Array<{
    userId: Id<"users">
    role: "host" | "participant" | "observer"
    user: {
      id: Id<"users">
      firstName?: string
      lastName?: string
      email?: string
      imageUrl?: string
    } | null
  }>
}

export default function VideoCallManager({
  appointmentId,
  onCallEnd
}: VideoCallManagerProps) {
  const { user } = useUser()
  const { toast } = useToast()
  const router = useRouter()
  const [activeCall, setActiveCall] = useState<{
    roomId: string
    callId: Id<"videoCalls">
  } | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [, setShowCreateDialog] = useState(false)
  const [,] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [newCallForm] = useState({
    title: '',
    description: '',
    scheduledTime: '',
    duration: 30,
    participants: [] as string[]
  })

  const createCall = useAction(api.videoCalls.createVideoCall)
  const joinCall = useMutation(api.videoCalls.joinVideoCall)
  const endCall = useMutation(api.videoCalls.endVideoCall)
  const callHistory = useQueryUntyped(api.videoCalls.getUserCallHistory, { limit: 20 })

  // Get current user ID from Convex
  const currentUser = useQueryUntyped(api.users.getMyUser)

  // Persist active call across page refreshes
  useEffect(() => {
    if (activeCall) {
      sessionStorage.setItem('rehabify-active-room', activeCall.roomId)
    } else {
      sessionStorage.removeItem('rehabify-active-room')
    }
  }, [activeCall])

  // On mount, restore existing room if present
  useEffect(() => {
    const savedRoomId = sessionStorage.getItem('rehabify-active-room')
    if (savedRoomId && !activeCall) {
      ;(async () => {
        try {
          const result = await joinCall({ roomId: savedRoomId })
          setActiveCall({ roomId: savedRoomId, callId: result.callId })
        } catch (err) {
          console.warn('Failed to restore call after refresh:', err)
          sessionStorage.removeItem('rehabify-active-room')
        }
      })()
    }
  }, [activeCall, joinCall])

  const handleCreateCall = async () => {
    if (!currentUser) {
      alert('Please sign in to create a call')
      return
    }

    try {
      const roomId = uuidv4()
      const result = await createCall({
        roomId,
        appointmentId,
        participants: newCallForm.participants,
        callType: 'appointment',
        settings: {
          recordingEnabled: false,
          chatEnabled: true,
          maxParticipants: 10,
          waitingRoomEnabled: true,
        }
      })

      setActiveCall({
        roomId: result.dailyRoomName || result.roomId,
        callId: result.callId,
      })
      setShowCreateDialog(false)
      
      toast({
        title: 'Success',
        description: 'Call created successfully',
      })
      
      // Optionally join the call immediately
      if (result.roomId) {
        router.push(`/video-call/${result.roomId}`)
      }
    } catch (error) {
      console.error('Error creating call:', error)
      toast({
        title: 'Error',
        description: 'Failed to create call. Please try again.',
        variant: 'destructive',
      })
    }
  }


  const handleEndCall = async () => {
    if (!activeCall) return

    try {
      await endCall({ callId: activeCall.callId })
      setActiveCall(null)
      setIsFullscreen(false)
      onCallEnd?.()
    } catch (error) {
      console.error('Failed to end call:', error)
    }
  }

  const copyRoomId = (roomId: string) => {
    navigator.clipboard.writeText(roomId)
    alert('Room ID copied to clipboard!')
  }

  const shareCall = (roomId: string) => {
    const shareUrl = `${window.location.origin}/video/${roomId}`
    navigator.clipboard.writeText(shareUrl)
    alert('Call link copied to clipboard!')
  }

  const filteredCallHistory = callHistory?.filter((call: CallHistoryItem) => {
    return (
      call.roomId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.participants.some((p: CallHistoryItem['participants'][0]) => 
        p.user?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.user?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.user?.email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    )
  })

  // Show a loading state until we have the user's ID
  if (activeCall && !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-call-bg text-neutral-900">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-call-accent mx-auto"></div>
          <p className="text-xl">Connecting to call...</p>
        </div>
      </div>
    )
  }

  if (activeCall) {
    return (
      <VideoCall
        roomId={activeCall.roomId}
        userId={currentUser?._id || ''}
        userName={`${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.emailAddresses[0]?.emailAddress || 'Anonymous'}
        callId={activeCall.callId}
        onCallEnd={handleEndCall}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
      />
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-6 w-6 text-call-accent" />
            Video Call Manager
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button onClick={handleCreateCall} className="h-20 flex-col space-y-2">
              <Plus className="h-4 w-4" />
              <span>Create New Call</span>
            </Button>
            
            <Dialog open={false} onOpenChange={() => {}}>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-20 flex-col space-y-2">
                  <HistoryIcon className="h-4 w-4" />
                  <span>Call History</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle>Call History</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Search className="h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search calls..."
                      value={searchTerm}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
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
                              <div className="flex items-center gap-1 text-sm text-gray-500">
                                <Users className="h-3 w-3" />
                                {call.participants.length} participants
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyRoomId(call.roomId)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => shareCall(call.roomId)}
                              >
                                <Share className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-1 text-sm text-gray-500">
                              <Users className="h-3 w-3" />
                              {call.participants.length} participants
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
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <div className="bg-call-bg p-2 rounded-lg">
                <Video className="h-5 w-5 text-call-accent" />
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
                    (callHistory?.reduce((acc: number, call: CallHistoryItem) => acc + (call.duration || 0), 0) || 0) / 60
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
          <CardTitle className="text-lg">Getting Started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="bg-call-bg rounded-full p-1 mt-0.5">
              <span className="text-call-accent text-sm font-bold px-1">1</span>
            </div>
            <div>
              <strong>Create a new call</strong> - Click &quot;Create New Call&quot; to start a video consultation
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-call-bg rounded-full p-1 mt-0.5">
              <span className="text-call-accent text-sm font-bold px-1">2</span>
            </div>
            <div>
              <strong>Join an existing call</strong> - Enter a Room ID to join someone else&apos;s call
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-call-bg rounded-full p-1 mt-0.5">
              <span className="text-call-accent text-sm font-bold px-1">3</span>
            </div>
            <div>
              <strong>View history</strong> - Access your past calls and rejoin active ones
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}