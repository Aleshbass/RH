import React, { useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { User, MicOff, Monitor } from 'lucide-react'

interface Participant {
  session_id: string;
  videoTrack?: MediaStreamTrack | null;
  audioTrack?: MediaStreamTrack | null;
  user_name?: string;
  local?: boolean;
  screen?: boolean;
}

interface ParticipantTileProps {
  participant: Participant | null;
}

/**
 * Lightweight presentation component for a Daily.co participant.
 * Shows the participant's video track if available, otherwise a placeholder.
 * Displays name overlay and icons for muted audio / screen-sharing status.
 */
const ParticipantTile: React.FC<ParticipantTileProps> = ({ participant }) => {
  // If parent passes participant object we don't need to call useParticipant here.
  // However, if null, we early return.
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Attach the MediaStream to the video element when track changes
  useEffect(() => {
    if (participant && participant.videoTrack && videoRef.current) {
      const stream = new MediaStream([participant.videoTrack])
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {/* autoplay error ignored */})
    }
  }, [participant, participant?.videoTrack])

  if (!participant) {
    return null;
  }

  return (
    <Card key={participant.session_id} className="bg-call-control border-gray-300 relative overflow-hidden shadow-lg">
      <CardContent className="p-0 aspect-video">
        {participant.videoTrack ? (
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            muted={participant.local}
            playsInline
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <User className="h-16 w-16 text-gray-400" />
          </div>
        )}

        {/* Participant Info Overlay */}
        <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center">
          <div className="bg-call-accent bg-opacity-90 px-3 py-1 rounded-md text-sm text-white font-medium">
            {participant.user_name || 'Anonymous'}
            {participant.local && ' (You)'}
          </div>
          <div className="flex space-x-1">
            {!participant.audioTrack && (
              <div className="bg-red-500 p-1 rounded">
                <MicOff className="h-3 w-3" />
              </div>
            )}
            {participant.screen && (
              <div className="bg-blue-500 p-1 rounded">
                <Monitor className="h-3 w-3" />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default ParticipantTile
