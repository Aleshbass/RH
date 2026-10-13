'use client'

import { forwardRef } from 'react'
import {
  ParticipantView,
  hasAudio,
  useParticipantViewContext,
  type StreamVideoParticipant,
  type VideoPlaceholderProps,
} from '@stream-io/video-react-sdk'
import { MicOff, MonitorUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export function participantName(p: StreamVideoParticipant) {
  return p.name || p.userId || 'Guest'
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')
}

// Shown by Stream whenever a participant's camera is off.
const TilePlaceholder = forwardRef<HTMLDivElement, VideoPlaceholderProps>(function TilePlaceholder({ participant, style }, ref) {
  const name = participantName(participant)
  return (
    <div ref={ref} style={style} className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#eef1ef] to-[#e3e7e5]">
      {participant.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={participant.image} alt="" className="aspect-square w-[26%] min-w-12 max-w-32 rounded-full object-cover shadow-md ring-4 ring-white" />
      ) : (
        <span className="flex aspect-square w-[26%] min-w-12 max-w-32 items-center justify-center rounded-full bg-brand text-[clamp(1rem,4vw,2.5rem)] font-medium text-white shadow-md ring-4 ring-white">
          {initials(name)}
        </span>
      )}
    </div>
  )
})

function TileOverlay({ compact }: { compact?: boolean }) {
  const { participant, trackType } = useParticipantViewContext()
  const presenting = trackType === 'screenShareTrack'
  const label = presenting
    ? `${participant.isLocalParticipant ? 'You are' : `${participantName(participant)} is`} presenting`
    : `${participantName(participant)}${participant.isLocalParticipant ? ' (You)' : ''}`

  return (
    <div className={cn('pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2', compact ? 'p-1.5' : 'p-3')}>
      <span
        className={cn(
          'flex min-w-0 items-center gap-1.5 rounded-full bg-black/45 font-medium text-white backdrop-blur-md',
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-[13px]',
        )}
      >
        {presenting && <MonitorUp className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
      </span>
      {!presenting && !hasAudio(participant) && (
        <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-white/90 text-red-500 shadow-sm', compact ? 'h-5 w-5' : 'h-7 w-7')}>
          <MicOff className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </span>
      )}
    </div>
  )
}

export function RoomTile({
  participant,
  trackType = 'videoTrack',
  compact,
  className,
  onClick,
}: {
  participant: StreamVideoParticipant
  trackType?: 'videoTrack' | 'screenShareTrack'
  compact?: boolean
  className?: string
  onClick?: () => void
}) {
  const speaking = trackType === 'videoTrack' && participant.isSpeaking && hasAudio(participant)
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative overflow-hidden bg-[#e9ecea] ring-1 ring-black/5 transition-shadow duration-300',
        compact ? 'rounded-2xl' : 'rounded-[22px] sm:rounded-[28px]',
        speaking && 'shadow-[0_0_0_3px_#00cd0f]',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      <ParticipantView
        participant={participant}
        trackType={trackType}
        VideoPlaceholder={TilePlaceholder}
        ParticipantViewUI={<TileOverlay compact={compact} />}
        className="h-full w-full"
      />
    </div>
  )
}
