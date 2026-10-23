/*
  DEPRECATED: Legacy Daily.co ParticipantTile
  ------------------------------------------------------------
  This component belongs to the old Daily.co implementation.
  The application has migrated to Stream Video SDK.

  Do NOT import or use this component in new code.
  Use Stream components instead.
*/
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  console.warn('[DEPRECATED] components/video/ParticipantTile.tsx (Daily) — not used in Stream flow.')
}
import React, { useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { User, MicOff, Monitor } from '@/components/icons'
import { useParticipant } from '@daily-co/daily-react'

interface ParticipantTileProps {
  participantId: string;
}

/**
 * Lightweight presentation component for a Daily.co participant.
 * Shows the participant's video track if available, otherwise a placeholder.
 * Displays name overlay and icons for muted audio / screen-sharing status.
 */
const ParticipantTile: React.FC<ParticipantTileProps> = ({ participantId }) => {
  const participant = useParticipant(participantId)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const videoTrack: MediaStreamTrack | null =
    participant?.tracks?.video?.state === 'playable'
      ? (participant.tracks.video.persistentTrack as MediaStreamTrack)
      : null

  const audioPlayable = participant?.tracks?.audio?.state === 'playable'
  const isScreenSharing = participant?.tracks?.screenVideo?.state === 'playable'

  // Attach the MediaStream to the video element when track changes
  useEffect(() => {
    if (videoTrack && videoRef.current) {
      const stream = new MediaStream([videoTrack])
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {/* autoplay error ignored */})
    }
  }, [videoTrack])

  if (!participant) return null

  return (
    <Card className="bg-call-control border-gray-300 relative overflow-hidden shadow-lg">
      <CardContent className="p-0 aspect-video">
        {videoTrack ? (
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
            {!audioPlayable && (
              <div className="bg-red-500 p-1 rounded">
                <MicOff className="h-3 w-3" />
              </div>
            )}
            {isScreenSharing && (
              <div className="bg-call-accent p-1 rounded">
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
