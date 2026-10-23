'use client'

import { useEffect } from 'react'
import { VideoPreview, useCall, useCallStateHooks } from '@stream-io/video-react-sdk'
import { Loader2, VideoOff } from '@/components/icons'
import { CallBackdrop, CallBrandMark } from './CallBackdrop'
import { CameraControl, MicControl } from './ControlBar'

function PreviewMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#eef1ef] to-[#e3e7e5] text-neutral-500">
      {children}
    </div>
  )
}

const CameraOffPreview = () => (
  <PreviewMessage>
    <VideoOff className="h-7 w-7" />
    <span className="text-sm font-medium">Camera is off</span>
  </PreviewMessage>
)

const NoCameraPreview = () => (
  <PreviewMessage>
    <VideoOff className="h-7 w-7" />
    <span className="text-sm font-medium">No camera found</span>
  </PreviewMessage>
)

const StartingPreview = () => (
  <PreviewMessage>
    <Loader2 className="h-7 w-7 animate-spin text-brand" />
    <span className="text-sm font-medium">Starting camera…</span>
  </PreviewMessage>
)

/**
 * Pre-join screen with a live camera preview. Render it inside
 * <StreamVideo><StreamCall> with a call that has not been joined yet; the
 * device choices made here carry into the call.
 */
export function CallLobby({
  eyebrow,
  title = 'Ready to join?',
  details,
  joinLabel = 'Join now',
  joining,
  notice,
  onJoin,
}: {
  eyebrow?: string
  title?: string
  details?: React.ReactNode
  joinLabel?: string
  joining?: boolean
  notice?: string | null
  onJoin: () => void
}) {
  const call = useCall()
  const { useCameraState, useMicrophoneState } = useCallStateHooks()
  const { hasBrowserPermission: cameraAllowed } = useCameraState()
  const { hasBrowserPermission: micAllowed } = useMicrophoneState()

  // Start both devices here so permission prompts appear before the call, not during it.
  useEffect(() => {
    if (!call) return
    void call.camera.enable().catch(() => {})
    void call.microphone.enable().catch(() => {})
  }, [call])

  return (
    <CallBackdrop>
      <header className="flex items-center px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 sm:pt-6">
        <CallBrandMark />
      </header>
      <main className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-6 sm:px-8">
        <div className="grid w-full max-w-5xl items-center gap-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-14">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[28px] bg-[#e9ecea] shadow-[0_24px_70px_-24px_rgba(0,0,0,0.35)] ring-1 ring-black/5 sm:aspect-video">
            <VideoPreview
              className="h-full w-full"
              DisabledVideoPreview={CameraOffPreview}
              NoCameraPreview={NoCameraPreview}
              StartingCameraPreview={StartingPreview}
            />
            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3">
              <MicControl />
              <CameraControl />
            </div>
          </div>

          <div className="text-center lg:text-left">
            {eyebrow && <p className="text-sm font-medium text-brand">{eyebrow}</p>}
            <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h1>
            {details && <div className="mt-4 space-y-1.5 text-[15px] text-neutral-600">{details}</div>}
            <button
              type="button"
              onClick={onJoin}
              disabled={joining}
              className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-10 text-[15px] font-medium text-white shadow-[0_12px_30px_-12px_rgba(0,91,87,0.7)] transition-all hover:bg-brand-dark active:scale-[0.98] disabled:opacity-70 sm:w-auto"
            >
              {joining && <Loader2 className="h-4 w-4 animate-spin" />}
              {joining ? 'Joining…' : joinLabel}
            </button>
            {notice && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {notice}
              </p>
            )}
            {(!cameraAllowed || !micAllowed) && (
              <p className="mx-auto mt-4 max-w-sm rounded-2xl bg-amber-50 px-4 py-3 text-left text-[13px] leading-relaxed text-amber-800 ring-1 ring-amber-200 lg:mx-0">
                Your browser is blocking the {!cameraAllowed && !micAllowed ? 'camera and microphone' : !cameraAllowed ? 'camera' : 'microphone'}.
                Allow access in your browser&apos;s site settings. If you opened this link inside WhatsApp, open it in Chrome or Safari instead.
              </p>
            )}
          </div>
        </div>
      </main>
    </CallBackdrop>
  )
}
