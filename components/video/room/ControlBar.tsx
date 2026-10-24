'use client'

import { useEffect, useState } from 'react'
import { useCallStateHooks } from '@stream-io/video-react-sdk'
import { Check, ChevronUp, MessageSquare, Mic, MicOff, MonitorUp, PhoneOff, SwitchCamera, Video, VideoOff } from '@/components/icons'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type Tone = 'default' | 'off' | 'active'

const TONES: Record<Tone, string> = {
  default: 'bg-white text-neutral-800 hover:bg-neutral-50',
  off: 'bg-red-500 text-white hover:bg-red-600',
  active: 'bg-rh-lime text-rh-ink hover:bg-rh-lime-deep',
}

export function RoundButton({
  tone = 'default',
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  tone?: Tone
  label: string
  onClick?: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-black/[0.06] transition-all duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime/50',
        TONES[tone],
        className,
      )}
    >
      {children}
    </button>
  )
}

function BlockedDot() {
  return <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full bg-amber-400 ring-2 ring-white" />
}

function DeviceSection({
  title,
  devices,
  selected,
  onSelect,
}: {
  title: string
  devices: MediaDeviceInfo[]
  selected?: string
  onSelect: (deviceId: string) => void
}) {
  if (!devices.length) return null
  const current = selected || devices[0]?.deviceId
  return (
    <>
      <DropdownMenuLabel className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{title}</DropdownMenuLabel>
      {devices.map((device, index) => (
        <DropdownMenuItem
          key={device.deviceId || index}
          onSelect={() => onSelect(device.deviceId)}
          className="gap-2 rounded-xl px-2.5 py-2 text-[13px]"
        >
          <Check className={cn('h-4 w-4 shrink-0 text-rh-ink', current === device.deviceId ? 'opacity-100' : 'opacity-0')} />
          <span className="truncate">{device.label || `${title} ${index + 1}`}</span>
        </DropdownMenuItem>
      ))}
    </>
  )
}

/** A device toggle with an attached device picker on larger screens. */
function DeviceToggle({ menu, children }: { menu: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center rounded-full sm:bg-white/70 sm:pl-0.5 sm:ring-1 sm:ring-black/[0.06]">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Choose device"
          className="hidden h-12 w-7 items-center justify-center rounded-l-full text-neutral-500 transition-colors hover:text-neutral-900 focus-visible:outline-none sm:flex"
        >
          <ChevronUp className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={12} className="w-72 rounded-2xl border-black/5 p-1.5 shadow-xl">
          {menu}
        </DropdownMenuContent>
      </DropdownMenu>
      {children}
    </div>
  )
}

function useDeviceToggles() {
  const { useMicrophoneState, useCameraState } = useCallStateHooks()
  const mic = useMicrophoneState()
  const cam = useCameraState()

  const toggleMic = () => {
    if (!mic.hasBrowserPermission) {
      toast.error('Microphone is blocked', { description: "Allow microphone access in your browser's site settings, then try again." })
      return
    }
    void mic.microphone.toggle().catch(() => toast.error("Couldn't change your microphone"))
  }
  const toggleCam = () => {
    if (!cam.hasBrowserPermission) {
      toast.error('Camera is blocked', { description: "Allow camera access in your browser's site settings, then try again." })
      return
    }
    void cam.camera.toggle().catch(() => toast.error("Couldn't change your camera"))
  }
  return { mic, cam, toggleMic, toggleCam }
}

export function MicControl() {
  const { useSpeakerState } = useCallStateHooks()
  const speakerState = useSpeakerState()
  const { mic, toggleMic } = useDeviceToggles()
  const off = mic.optimisticIsMute
  return (
    <DeviceToggle
      menu={
        <>
          <DeviceSection title="Microphone" devices={mic.devices} selected={mic.selectedDevice} onSelect={(id) => void mic.microphone.select(id)} />
          {speakerState.isDeviceSelectionSupported && speakerState.devices.length > 0 && (
            <>
              <DropdownMenuSeparator className="my-1.5" />
              <DeviceSection title="Speaker" devices={speakerState.devices} selected={speakerState.selectedDevice} onSelect={(id) => speakerState.speaker.select(id)} />
            </>
          )}
        </>
      }
    >
      <RoundButton tone={off ? 'off' : 'default'} label={off ? 'Turn on microphone' : 'Turn off microphone'} onClick={toggleMic}>
        {off ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        {!mic.hasBrowserPermission && <BlockedDot />}
      </RoundButton>
    </DeviceToggle>
  )
}

export function CameraControl() {
  const { cam, toggleCam } = useDeviceToggles()
  const off = cam.optimisticIsMute
  return (
    <DeviceToggle menu={<DeviceSection title="Camera" devices={cam.devices} selected={cam.selectedDevice} onSelect={(id) => void cam.camera.select(id)} />}>
      <RoundButton tone={off ? 'off' : 'default'} label={off ? 'Turn on camera' : 'Turn off camera'} onClick={toggleCam}>
        {off ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
        {!cam.hasBrowserPermission && <BlockedDot />}
      </RoundButton>
    </DeviceToggle>
  )
}

function LeaveButton({ onLeave, onEndForAll }: { onLeave: () => void; onEndForAll?: () => void }) {
  const className =
    'flex h-12 w-16 shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition-all hover:bg-red-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300'
  if (!onEndForAll) {
    return (
      <button type="button" aria-label="Leave call" title="Leave call" onClick={onLeave} className={className}>
        <PhoneOff className="h-5 w-5" />
      </button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Leave call" className={className}>
        <PhoneOff className="h-5 w-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={12} className="w-60 rounded-2xl border-black/5 p-1.5 shadow-xl">
        <DropdownMenuItem onSelect={onLeave} className="rounded-xl px-3 py-2.5 text-[14px]">
          Leave call
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEndForAll} className="rounded-xl px-3 py-2.5 text-[14px] text-red-600 focus:bg-red-50 focus:text-red-700">
          End call for everyone
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ControlBar({
  onLeave,
  onEndForAll,
  chatOpen,
  chatUnread,
  onToggleChat,
}: {
  onLeave: () => void
  onEndForAll?: () => void
  chatOpen?: boolean
  chatUnread?: boolean
  onToggleChat?: () => void
}) {
  const { useScreenShareState } = useCallStateHooks()
  const screen = useScreenShareState()
  const { cam, toggleMic, toggleCam } = useDeviceToggles()
  const [canShareScreen, setCanShareScreen] = useState(false)

  useEffect(() => {
    // Phones and tablets cannot share their screen from the browser.
    setCanShareScreen(
      typeof navigator.mediaDevices?.getDisplayMedia === 'function' && !window.matchMedia('(pointer: coarse)').matches,
    )
  }, [])

  // Same shortcuts as Google Meet: Ctrl/⌘+D for the mic, Ctrl/⌘+E for the camera.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      const key = event.key.toLowerCase()
      if (key === 'd') { event.preventDefault(); toggleMic() }
      if (key === 'e') { event.preventDefault(); toggleCam() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const sharing = !screen.optimisticIsMute

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/75 p-2 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)] ring-1 ring-black/5 backdrop-blur-2xl sm:gap-3 sm:px-3">
      <MicControl />
      <CameraControl />

      {!canShareScreen && cam.devices.length > 1 && (
        <RoundButton label="Switch camera" onClick={() => void cam.camera.flip()} disabled={cam.optimisticIsMute}>
          <SwitchCamera className="h-5 w-5" />
        </RoundButton>
      )}

      {canShareScreen && (
        <RoundButton
          tone={sharing ? 'active' : 'default'}
          label={sharing ? 'Stop presenting' : 'Present your screen'}
          onClick={() => void screen.screenShare.toggle().catch(() => {})}
        >
          <MonitorUp className="h-5 w-5" />
        </RoundButton>
      )}

      {onToggleChat && (
        <RoundButton tone={chatOpen ? 'active' : 'default'} label={chatOpen ? 'Close messages' : 'Messages'} onClick={onToggleChat}>
          <MessageSquare className="h-5 w-5" />
          {chatUnread && !chatOpen && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-rh-lime ring-2 ring-white" />}
        </RoundButton>
      )}

      <LeaveButton onLeave={onLeave} onEndForAll={onEndForAll} />
    </div>
  )
}
