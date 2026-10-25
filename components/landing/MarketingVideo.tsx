"use client";

import Image from "next/image";
import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Play } from "@/components/icons";
import { cloudinaryPoster, cloudinaryVideo } from "@/lib/marketingVideos";
import { cn } from "@/lib/utils";

type Props = {
  /** Cloudinary video URL from lib/marketingVideos.ts. Empty hides the player. */
  url: string;
  title: string;
  /** Shown in place of the video until a URL is set. Without one, nothing renders. */
  fallback?: { src: string; alt: string; unoptimized?: boolean };
  /**
   * "click" shows the poster and loads the film on play.
   * "preview" loops it muted while on screen (inline on iPhone too), with a button to watch with sound.
   */
  mode?: "click" | "preview";
  className?: string;
};

const playButton =
  "flex h-16 w-16 items-center justify-center rounded-full bg-rh-lime text-rh-ink transition-transform duration-300 group-hover:scale-105";

export function MarketingVideo({ url, title, fallback, mode = "click", className }: Props) {
  const frame = cn("relative aspect-video w-full overflow-hidden rounded-[1.75rem] bg-rh-ink", className);

  if (!url) {
    if (!fallback) return null;
    return (
      <div className={frame}>
        <Image
          src={fallback.src}
          alt={fallback.alt}
          fill
          unoptimized={fallback.unoptimized}
          sizes="(min-width: 1024px) 600px, 100vw"
          className="object-cover"
        />
      </div>
    );
  }

  return mode === "preview" ? <PreviewVideo url={url} title={title} className={frame} /> : <ClickVideo url={url} title={title} className={frame} />;
}

/** Poster first; the film loads only when someone presses play. */
function ClickVideo({ url, title, className }: { url: string; title: string; className: string }) {
  const [playing, setPlaying] = useState(false);
  const poster = cloudinaryPoster(url);

  return (
    <div className={className}>
      {playing ? (
        <video className="absolute inset-0 h-full w-full object-cover" src={cloudinaryVideo(url)} poster={poster} controls autoPlay playsInline title={title} />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play video: ${title}`}
          className="group absolute inset-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-rh-lime"
        >
          {poster && <Image src={poster} alt="" fill unoptimized sizes="(min-width: 1024px) 600px, 100vw" className="object-cover" />}
          <span className="absolute inset-0 bg-rh-ink/25" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className={playButton}>
              <Play className="h-5 w-5 translate-x-[2px]" />
            </span>
          </span>
          <span className="absolute bottom-4 left-4 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-rh-ink">{title}</span>
        </button>
      )}
    </div>
  );
}

/** Data saver on, or a 2G connection: don't start downloading video by itself. */
function prefersLightData() {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType ?? "");
}

/**
 * A muted, looping preview that keeps page loads light:
 *  - no video is requested until the player is about to scroll into view;
 *  - the loop is a short, silent, smaller cut of the film (cloudinaryVideo "preview");
 *  - it plays only while visible, never with reduced motion, data saver or 2G;
 *  - "Watch with sound" swaps in the full film with controls, only when someone asks for it.
 * Inline and muted, so iOS Safari plays it without going full screen.
 */
function PreviewVideo({ url, title, className }: { url: string; title: string; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();
  const [near, setNear] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [withSound, setWithSound] = useState(false);

  // Decide after mount (navigator is browser-only) whether a silent loop may start by itself
  useEffect(() => setAutoplay(!reduce && !prefersLightData()), [reduce]);

  // Nothing (not even the poster) loads until the player is within a screen of the viewport
  useEffect(() => {
    const video = ref.current;
    if (!video || near) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: "400px 0px" });
    observer.observe(video);
    return () => observer.disconnect();
  }, [near]);

  // The source is set by hand rather than as a prop, so React never resets it after a tap on
  // "Watch with sound" swaps in the full film
  useEffect(() => {
    const video = ref.current;
    if (video && near && autoplay && !withSound && !video.getAttribute("src")) video.src = cloudinaryVideo(url, "preview");
  }, [near, autoplay, withSound, url]);

  // Play while on screen, pause when scrolled away
  useEffect(() => {
    const video = ref.current;
    if (!video || !near || !autoplay || withSound) return;
    // React sets `muted` as a property only; iOS checks it before allowing autoplay
    video.muted = true;
    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? video.play().catch(() => {}) : video.pause()),
      { threshold: 0.35 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [near, autoplay, withSound]);

  const watchWithSound = () => {
    const video = ref.current;
    if (!video) return;
    setWithSound(true);
    // Set and play inside the tap, so browsers allow sound
    video.src = cloudinaryVideo(url, "full");
    video.muted = false;
    video.loop = false;
    video.controls = true;
    video.play().catch(() => {});
  };

  return (
    <div className={className}>
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover"
        poster={near ? cloudinaryPoster(url) : undefined}
        muted
        loop={!withSound}
        playsInline
        preload="none"
        title={title}
      />
      {!withSound && (
        <button
          type="button"
          onClick={watchWithSound}
          className={
            autoplay
              ? "group absolute bottom-4 left-4 inline-flex items-center gap-2.5 rounded-full bg-white py-1.5 pl-1.5 pr-4 text-sm font-semibold text-rh-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime"
              : "group absolute inset-0 flex items-center justify-center bg-rh-ink/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-rh-lime"
          }
          aria-label={autoplay ? undefined : `Play video: ${title}`}
        >
          {autoplay ? (
            <>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rh-lime">
                <Play className="h-3 w-3 translate-x-px" />
              </span>
              Watch with sound
            </>
          ) : (
            <span className={playButton}>
              <Play className="h-5 w-5 translate-x-[2px]" />
            </span>
          )}
        </button>
      )}
    </div>
  );
}
