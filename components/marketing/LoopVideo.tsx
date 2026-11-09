"use client";

import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * A short silent loop (a product demo) that only downloads and plays while it's on screen.
 *
 * `base` is the path of the files: <base>.av1.webm, <base>.vp9.webm, <base>.mp4 and <base>.webp
 * (the poster). Browsers take the first format they can play, so most download the small AV1 file
 * and older ones the H.264 MP4. With reduced motion it stays on the poster.
 *
 * `sound`: the files carry a voice track. Browsers only autoplay silently, so a "Play with sound"
 * button restarts the demo from the top with sound; when it ends it goes back to the silent loop.
 */
export function LoopVideo({ base, label, className, sound = false }: { base: string; label: string; className?: string; sound?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();
  const [audible, setAudible] = useState(false);
  const audibleRef = useRef(false);

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

  const backToSilentLoop = useCallback(() => {
    const video = ref.current;
    audibleRef.current = false;
    setAudible(false);
    if (!video) return;
    video.muted = true;
    video.loop = true;
    if (!reduce) void video.play().catch(() => undefined);
  }, [reduce]);

  const playWithSound = () => {
    const video = ref.current;
    if (!video) return;
    audibleRef.current = true;
    setAudible(true);
    video.currentTime = 0;
    video.muted = false;
    video.loop = false;
    void video.play().catch(() => backToSilentLoop());
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
      onEnded={() => audibleRef.current && backToSilentLoop()}
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
      {audible ? (
        <button
          type="button"
          onClick={backToSilentLoop}
          aria-label="Mute the demo"
          className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-rh-ink text-white transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime"
        >
          <VolumeX className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={playWithSound}
          className="absolute left-1/2 top-1/2 inline-flex h-12 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-rh-lime px-5 text-sm font-semibold text-rh-ink transition hover:bg-rh-lime-deep active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2"
        >
          <Volume2 className="h-4 w-4" /> Play with sound
        </button>
      )}
    </div>
  );
}
