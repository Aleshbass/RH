'use client'

/**
 * Protected lesson playback (convex/learnVideo.ts): hls.js plays the AES-128 encrypted stream,
 * sending the short-lived playback token with the playlist and key requests and swapping in a
 * fresh token before it expires. A small, faint watermark with the learner's name and email sits in a
 * corner of the picture and moves to another corner now and then (owner 19 Nov 2026: it mustn't
 * get in the way; it's there so a leaked recording can be traced). It comes back if it's removed or
 * hidden, and stays visible in fullscreen: the lesson's Expand button puts the frame, not the bare
 * <video>, in fullscreen (LessonPlayer). Safari without Media Source plays the stream natively.
 *
 * Known limit: this stops casual copying and makes leaks traceable; it can't stop screen recording.
 */

import { useEffect, useRef, type RefObject } from 'react'
import type { LessonPlayback } from './videoApi'

export type HlsStream = NonNullable<LessonPlayback['hls']>

const REFRESH_BEFORE_MS = 2 * 60 * 1000
const MOVE_EVERY_MS = 40_000
const CHECK_EVERY_MS = 1500

/** Replace (or add) the token on a URL to our own video endpoints. */
function withToken(url: string, token: string) {
  const u = new URL(url)
  u.searchParams.set('t', token)
  return u.toString()
}

// ── Watermark ────────────────────────────────────────────────────────────────

const STYLE: Record<string, string> = {
  position: 'absolute',
  'z-index': '2147483000',
  'pointer-events': 'none',
  'user-select': 'none',
  'white-space': 'nowrap',
  'font-family': 'ui-sans-serif, system-ui, sans-serif',
  'font-size': '11px',
  'font-weight': '500',
  'line-height': '1.2',
  // Faint, but in every frame (the tamper check reads the element's opacity, not the colour's)
  color: 'rgba(255,255,255,0.32)',
  'text-shadow': '0 1px 1px rgba(0,0,0,0.35)',
  display: 'block',
  visibility: 'visible',
  opacity: '1',
  transform: 'none',
  transition: 'top 0.8s ease, left 0.8s ease, right 0.8s ease, bottom 0.8s ease',
}

/** The four corners, clear of the player's controls at the bottom. */
const CORNERS = [
  { top: '12px', left: '14px' },
  { top: '12px', right: '14px' },
  { bottom: '64px', right: '14px' },
  { bottom: '64px', left: '14px' },
] as const

function applyStyle(el: HTMLElement, corner: number) {
  for (const [k, v] of Object.entries(STYLE)) el.style.setProperty(k, v, 'important')
  const at = CORNERS[corner % CORNERS.length] as Record<string, string>
  for (const side of ['top', 'right', 'bottom', 'left']) el.style.setProperty(side, at[side] ?? 'auto', 'important')
}

function looksHidden(el: HTMLElement, frame: HTMLElement) {
  if (!frame.contains(el)) return true
  const cs = getComputedStyle(el)
  if (cs.display === 'none' || cs.visibility !== 'visible' || Number(cs.opacity) < 0.3) return true
  const r = el.getBoundingClientRect()
  const f = frame.getBoundingClientRect()
  return r.width < 20 || r.height < 6 || r.right < f.left || r.left > f.right || r.bottom < f.top || r.top > f.bottom
}

/**
 * Keeps a watermark in `frame`. Managed outside React so removing the node in DevTools can't
 * desync React; it is simply put back. Repeated tampering pauses the video.
 */
function useWatermark(frame: RefObject<HTMLDivElement | null>, video: RefObject<HTMLVideoElement | null>, text: string, onTamper: () => void) {
  const tamperRef = useRef(onTamper)
  useEffect(() => {
    tamperRef.current = onTamper
  })

  useEffect(() => {
    const host = frame.current
    if (!host || !text) return
    let corner = Math.floor(Math.random() * CORNERS.length)
    const make = () => {
      const el = document.createElement('div')
      el.setAttribute('aria-hidden', 'true')
      el.textContent = text
      applyStyle(el, corner)
      host.appendChild(el)
      return el
    }
    let mark = make()
    const strikes: number[] = []

    const restore = () => {
      const now = Date.now()
      strikes.push(now)
      while (strikes.length && strikes[0] < now - 30_000) strikes.shift()
      if (mark.isConnected) mark.remove()
      mark = make()
      if (strikes.length >= 3) {
        video.current?.pause()
        tamperRef.current()
      }
    }

    const check = () => {
      if (mark.textContent !== text || looksHidden(mark, host)) restore()
    }

    const observer = new MutationObserver(() => check())
    observer.observe(host, { childList: true, subtree: true, attributes: true, characterData: true })
    const checker = window.setInterval(check, CHECK_EVERY_MS)
    const mover = window.setInterval(() => {
      corner = (corner + 1 + Math.floor(Math.random() * (CORNERS.length - 1))) % CORNERS.length
      applyStyle(mark, corner)
    }, MOVE_EVERY_MS)

    return () => {
      observer.disconnect()
      window.clearInterval(checker)
      window.clearInterval(mover)
      mark.remove()
    }
  }, [frame, video, text])
}

// ── Fullscreen on the frame (so the watermark stays) ────────────────────────

/**
 * Puts the lesson frame (video + watermark) in fullscreen, or takes it out. Call it straight from
 * a click: browsers only allow fullscreen from the person's own tap. (Moving fullscreen from the
 * video to the frame afterwards was refused for that reason, so Expand did nothing.) iPhones
 * can't put an element in fullscreen, only the video itself.
 */
export function toggleFrameFullscreen(frame: HTMLElement | null, video: HTMLVideoElement | null) {
  const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }
  if (document.fullscreenElement || doc.webkitFullscreenElement) {
    if (document.exitFullscreen) void document.exitFullscreen().catch(() => {})
    else doc.webkitExitFullscreen?.()
    return
  }
  const el = frame as (HTMLElement & { webkitRequestFullscreen?: () => void }) | null
  if (el?.requestFullscreen) {
    void el.requestFullscreen().catch(() => {})
    return
  }
  if (el?.webkitRequestFullscreen) {
    el.webkitRequestFullscreen()
    return
  }
  ;(video as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null)?.webkitEnterFullscreen?.()
}

// ── hls.js ───────────────────────────────────────────────────────────────────

/**
 * Attaches the protected stream to `video`. `refresh` fetches a new playback (token) through
 * Convex, which re-checks the learner's access each time.
 */
export function ProtectedStream({
  stream,
  videoRef,
  frameRef,
  refresh,
  onFatal,
  onTamper,
}: {
  stream: HlsStream
  videoRef: RefObject<HTMLVideoElement | null>
  frameRef: RefObject<HTMLDivElement | null>
  refresh: () => Promise<HlsStream | null>
  onFatal: (message: string) => void
  onTamper: () => void
}) {
  const token = useRef(stream.token)
  const handlers = useRef({ refresh, onFatal })
  useEffect(() => {
    handlers.current = { refresh, onFatal }
  })

  useWatermark(frameRef, videoRef, `${stream.watermark.name} · ${stream.watermark.email}`, onTamper)

  // Keep a live token while the lesson is open
  useEffect(() => {
    token.current = stream.token
    let expiresAt = stream.expiresAt
    let stopped = false
    let timer: number | undefined
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (stopped) return
        try {
          const next = await handlers.current.refresh()
          if (next) {
            token.current = next.token
            expiresAt = next.expiresAt
          }
        } catch {
          // Access ended or offline: the next key/playlist request will fail and say so
        }
        if (!stopped) schedule()
      }, Math.max(15_000, expiresAt - Date.now() - REFRESH_BEFORE_MS))
    }
    schedule()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [stream.token, stream.expiresAt])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const ownOrigin = new URL(stream.masterUrl).origin
    let destroyed = false
    let hls: { destroy: () => void } | null = null

    video.disablePictureInPicture = true
    import('hls.js')
      .then(({ default: Hls }) => {
        if (destroyed) return
        if (Hls.isSupported()) {
          const player = new Hls({
            enableWorker: true,
            maxBufferLength: 30,
            // Our playlist and key requests carry the current token; R2 segment links are already signed
            xhrSetup: (xhr: XMLHttpRequest, url: string) => {
              if (!url.startsWith(ownOrigin)) return
              xhr.open('GET', withToken(url, token.current), true)
              xhr.setRequestHeader('Authorization', `Bearer ${token.current}`)
            },
          })
          let recoveries = 0
          player.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return
            const status = (data.response as { code?: number } | undefined)?.code
            if (status === 401 || status === 403) {
              handlers.current.onFatal(status === 403 ? 'You no longer have access to this lesson.' : 'Your session ended. Reload the lesson to keep watching.')
              player.destroy()
              return
            }
            if (recoveries++ < 3) {
              if (data.type === Hls.ErrorTypes.MEDIA_ERROR) player.recoverMediaError()
              else player.startLoad()
              return
            }
            handlers.current.onFatal('This lesson stopped playing. Check your connection and try again.')
            player.destroy()
          })
          player.loadSource(withToken(stream.masterUrl, token.current))
          player.attachMedia(video)
          hls = player
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari without Media Source: its own HLS player (the token rides in the URLs)
          video.src = withToken(stream.masterUrl, token.current)
        } else {
          handlers.current.onFatal('This browser can’t play protected lessons. Try Chrome, Edge, Firefox or Safari.')
        }
      })
      .catch(() => handlers.current.onFatal('The player didn’t load. Check your connection and try again.'))

    return () => {
      destroyed = true
      hls?.destroy()
      video.removeAttribute('src')
      video.load()
    }
    // `stream` changes only when the lesson (re)loads; token refreshes go through the ref
  }, [stream, videoRef])

  return null
}
