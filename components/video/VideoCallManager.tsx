'use client'

import React, { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { useMutation, useQuery, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import type { CreateVideoCallInput, CreateVideoCallOutput } from '@/convex/videoCalls'
import VideoCall from './VideoCall'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Video,
  Plus,
  Clock,
  Users,
  Calendar,
  Phone,
  MessageSquare,
  Settings,
  History,
  Search,
  Copy,
  Share,
  Maximize
} from 'lucide-react'
import { format } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'

interface VideoCallManagerProps {
  appointmentId?: Id<"appointments">
  defaultParticipants?: Id<"users">[]
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
  defaultParticipants = [],
  onCallEnd
}: VideoCallManagerProps) {
  const { user } = useUser()
  const [activeCall, setActiveCall] = useState<{
    roomId: string
    callId: Id<"videoCalls">
  } | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [roomIdToJoin, setRoomIdToJoin] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

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
  }, [])

  // Form state for creating new call
  const [newCallForm, setNewCallForm] = useState({
    callType: 'consultation' as 'appointment' | 'consultation' | 'emergency',
    participants: defaultParticipants,
    settings: {
      recordingEnabled: false,
      chatEnabled: true,
      maxParticipants: 10,
      waitingRoomEnabled: false,
    }
  })

  // Convex mutations and queries
  /**
   * Workaround for TS2589 "Type instantiation is excessively deep…"
   * Cast the generated action to a simpler typed function so the compiler
   * doesn't try to fully evaluate the huge Convex-generated type.
   */
  const createCall = useAction(api.videoCalls.createVideoCall) as (
    input: CreateVideoCallInput
  ) => Promise<CreateVideoCallOutput>
  const joinCall = useMutation(api.videoCalls.joinVideoCall)
  const endCall = useMutation(api.videoCalls.endVideoCall)
  const callHistory = useQuery(api.videoCalls.getUserCallHistory, { limit: 20 }) as CallHistoryItem[] | undefined

  // Get current user ID from Convex
  const currentUser = useQuery(api.users.getMyUser)

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
        callType: newCallForm.callType,
        settings: newCallForm.settings,
      })

      setActiveCall({
        roomId: result.dailyRoomName || result.roomId,
        callId: result.callId,
      })
      setShowCreateDialog(false)
    } catch (error) {
      console.error('Failed to create call:', error)
      alert('Failed to create call. Please try again.')
    }
  }

  const handleJoinCall = async () => {
    if (!roomIdToJoin.trim()) {
      alert('Please enter a room ID')
      return
    }

    try {
      // Extract room ID from URL if a full URL is provided
      let cleanRoomId = roomIdToJoin.trim()
      
      // If it's a URL, extract the room ID from the end
      if (cleanRoomId.includes('/')) {
        const urlParts = cleanRoomId.split('/')
        cleanRoomId = urlParts[urlParts.length - 1]
      }
      
      console.log('Joining call with room ID:', cleanRoomId)
      
      const result = await joinCall({ roomId: cleanRoomId })
      setActiveCall({
        roomId: cleanRoomId,
        callId: result.callId,
      })
      setRoomIdToJoin('')
    } catch (error) {
      console.error('Failed to join call:', error)
      alert('Failed to join call. Please check the room ID and try again.')
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

  const filteredCallHistory = callHistory?.filter(call => {
    if (!searchTerm) return true
    return (
      call.roomId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.participants.some(p => 
        p.user?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.user?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.user?.email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    )
  })

  // Show a loading state until we have the user's ID
  if (activeCall && !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto"></div>
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
            <Video className="h-6 w-6 text-blue-600" />
            Video Call Manager
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="h-20 flex-col space-y-2">
                  <Plus className="h-6 w-6" />
                  <span>Create New Call</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New Video Call</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="callType">Call Type</Label>
                    <Select
                      value={newCallForm.callType}
                      onValueChange={(value: any) =>
                        setNewCallForm(prev => ({ ...prev, callType: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="consultation">Consultation</SelectItem>
                        <SelectItem value="appointment">Appointment</SelectItem>
                        <SelectItem value="emergency">Emergency</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Call Settings</Label>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chatEnabled"
                          checked={newCallForm.settings.chatEnabled}
                          onCheckedChange={(checked) =>
                            setNewCallForm(prev => ({
                              ...prev,
                              settings: { ...prev.settings, chatEnabled: !!checked }
                            }))
                          }
                        />
                        <Label htmlFor="chatEnabled">Enable Chat</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="recordingEnabled"
                          checked={newCallForm.settings.recordingEnabled}
                          onCheckedChange={(checked) =>
                            setNewCallForm(prev => ({
                              ...prev,
                              settings: { ...prev.settings, recordingEnabled: !!checked }
                            }))
                          }
                        />
                        <Label htmlFor="recordingEnabled">Enable Recording</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="waitingRoom"
                          checked={newCallForm.settings.waitingRoomEnabled}
                          onCheckedChange={(checked) =>
                            setNewCallForm(prev => ({
                              ...prev,
                              settings: { ...prev.settings, waitingRoomEnabled: !!checked }
                            }))
                          }
                        />
                        <Label htmlFor="waitingRoom">Enable Waiting Room</Label>
                      </div>
                    </div>
                  </div>

                  <Button onClick={handleCreateCall} className="w-full">
                    Create Call
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="space-y-2">
              <Input
                placeholder="Enter Room ID to join"
                value={roomIdToJoin}
                onChange={(e) => setRoomIdToJoin(e.target.value)}
              />
              <Button onClick={handleJoinCall} className="w-full" variant="outline">
                <Phone className="h-4 w-4 mr-2" />
                Join Call
              </Button>
            </div>

            <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-20 flex-col space-y-2">
                  <History className="h-6 w-6" />
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
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <ScrollArea className="h-96">
                    <div className="space-y-2">
                      {filteredCallHistory?.map((call) => (
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
                              {call.status === 'active' && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setActiveCall({
                                      roomId: call.roomId,
                                      callId: call._id
                                    })
                                    setShowHistoryDialog(false)
                                  }}
                                >
                                  <Video className="h-3 w-3 mr-1" />
                                  Join
                                </Button>
                              )}
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
              <div className="bg-blue-100 p-2 rounded-lg">
                <Video className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {callHistory?.filter(c => c.status === 'ended').length || 0}
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
                    (callHistory?.reduce((acc, call) => acc + (call.duration || 0), 0) || 0) / 60
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
                  {callHistory?.filter(c => c.status === 'active').length || 0}
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
            <div className="bg-blue-100 rounded-full p-1 mt-0.5">
              <span className="text-blue-600 text-sm font-bold px-1">1</span>
            </div>
            <div>
              <strong>Create a new call</strong> - Click "Create New Call" to start a video consultation
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-blue-100 rounded-full p-1 mt-0.5">
              <span className="text-blue-600 text-sm font-bold px-1">2</span>
            </div>
            <div>
              <strong>Join an existing call</strong> - Enter a Room ID to join someone else's call
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-blue-100 rounded-full p-1 mt-0.5">
              <span className="text-blue-600 text-sm font-bold px-1">3</span>
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