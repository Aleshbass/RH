"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A short silent loop (a product demo) that only downloads and plays while it's on screen.
 *
 * `base` is the path of files made by scripts/motion/demo-video/render.mjs: <base>.av1.webm,
 * <base>.vp9.webm, <base>.mp4 and <base>.webp (the poster). Browsers take the first format they
 * can play, so most download the small AV1 file and older ones the H.264 MP4. With reduced motion
 * it stays on the poster.
 */
export function LoopVideo({ base, label, className }: { base: string; label: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();

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

  return (
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
      <source src={`${base}.av1.webm`} type='video/webm; codecs="av01.0.05M.08"' />
      <source src={`${base}.vp9.webm`} type='video/webm; codecs="vp09.00.31.08"' />
      <source src={`${base}.mp4`} type='video/mp4; codecs="avc1.4d001f"' />
    </video>
  );
}
