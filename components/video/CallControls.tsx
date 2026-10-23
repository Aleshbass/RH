import React from 'react'
import { Button } from '@/components/ui/button'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Monitor,
  MonitorOff,
  MessageSquare,
  Volume2,
  VolumeX,
} from '@/components/icons'

interface CallControlsProps {
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  isAudioOutputEnabled: boolean
  isSharingScreen: boolean
  showChat: boolean
  onToggleVideo: () => void
  onToggleAudio: () => void
  onToggleAudioOutput: () => void
  onToggleScreenShare: () => void
  onToggleChat: () => void
  onEndCall: () => void
}

export default function CallControls({
  isVideoEnabled,
  isAudioEnabled,
  isAudioOutputEnabled,
  isSharingScreen,
  onToggleVideo,
  onToggleAudio,
  onToggleAudioOutput,
  onToggleScreenShare,
  onToggleChat,
  onEndCall,
  showChat,
}: CallControlsProps) {
  return (
    <div className="bg-call-control p-4 flex justify-center items-center space-x-4 border-t border-gray-700">
      <Button
        variant={isVideoEnabled ? "default" : "destructive"}
        size="lg"
        onClick={onToggleVideo}
        className="rounded-full p-4 bg-call-accent hover:bg-call-accent/80 text-white"
      >
        {isVideoEnabled ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
      </Button>
      
      <Button
        variant={isAudioEnabled ? "default" : "destructive"}
        size="lg"
        onClick={onToggleAudio}
        className="rounded-full p-4 bg-call-accent hover:bg-call-accent/80 text-white"
      >
        {isAudioEnabled ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
      </Button>
      
      <Button
        variant={isAudioOutputEnabled ? "default" : "destructive"}
        size="lg"
        onClick={onToggleAudioOutput}
        className="rounded-full p-4 bg-call-accent hover:bg-call-accent/80 text-white"
      >
        {isAudioOutputEnabled ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
      </Button>

      <Button
        variant={isSharingScreen ? "secondary" : "outline"}
        size="lg"
        onClick={onToggleScreenShare}
        className="rounded-full p-4 bg-call-accent hover:bg-call-accent/80 text-white border-call-accent"
      >
        {isSharingScreen ? <MonitorOff className="h-6 w-6" /> : <Monitor className="h-6 w-6" />}
      </Button>

      <Button
        variant={showChat ? "secondary" : "outline"}
        size="lg"
        onClick={onToggleChat}
        className="rounded-full p-4 bg-call-accent hover:bg-call-accent/80 text-white border-call-accent"
      >
        <MessageSquare className="h-6 w-6" />
      </Button>

      <Button
        variant="destructive"
        size="lg"
        onClick={onEndCall}
        className="rounded-full p-4 bg-red-600 hover:bg-red-700 text-white"
      >
        <PhoneOff className="h-6 w-6" />
      </Button>
    </div>
  )
}
