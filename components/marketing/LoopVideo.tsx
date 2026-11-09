"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * A short loop (a product demo) that only downloads and plays while it's on screen.
 *
 * `base` is the path of the files: <base>.av1.webm, <base>.vp9.webm, <base>.mp4 and <base>.webp
 * (the poster). Browsers take the first format they can play, so most download the small AV1 file
 * and older ones the H.264 MP4. With reduced motion it stays on the poster.
 *
 * `sound`: the files carry a voice track. Browsers only autoplay muted, so a small speaker icon in
 * the corner turns the sound on and off; the voice stays in sync because it's in the same file.
 */
export function LoopVideo({ base, label, className, sound = false }: { base: string; label: string; className?: string; sound?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = ref.current;
    if (!video || reduce) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => undefined);
        else video.pause();
      },
      { threshold: 0.25 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reduce]);

  const toggleSound = () => {
    const video = ref.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setMuted(next);
    // With reduced motion the video waits on the poster: sound on is a request to play it
    if (!next && video.paused) void video.play().catch(() => undefined);
  };

  const videoEl = (
    <video
      ref={ref}
      className={cn("h-full w-full object-cover", className)}
      poster={`${base}.webp`}
      muted
      loop
      playsInline
      preload="none"
      disablePictureInPicture
      aria-label={label}
    >
      <source src={`${base}.av1.webm`} type={sound ? 'video/webm; codecs="av01.0.05M.08, opus"' : 'video/webm; codecs="av01.0.05M.08"'} />
      <source src={`${base}.vp9.webm`} type={sound ? 'video/webm; codecs="vp09.00.31.08, opus"' : 'video/webm; codecs="vp09.00.31.08"'} />
      <source src={`${base}.mp4`} type={sound ? 'video/mp4; codecs="avc1.4d001f, mp4a.40.2"' : 'video/mp4; codecs="avc1.4d001f"'} />
    </video>
  );

  if (!sound) return videoEl;

  return (
    <div className="relative h-full w-full">
      {videoEl}
      <button
        type="button"
        onClick={toggleSound}
        aria-label={muted ? "Turn the sound on" : "Turn the sound off"}
        aria-pressed={!muted}
        className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-rh-ink/80 text-white backdrop-blur-sm transition hover:bg-rh-ink active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
