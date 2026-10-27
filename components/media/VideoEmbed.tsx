"use client";

import Image from 'next/image'
import { Play } from '@/components/icons'
import React, { useEffect, useRef, useState } from "react";

interface VideoEmbedProps {
  youtubeId?: string;
  url?: string; // hosted video url (mp4, webm)
  poster?: string;
  className?: string;
  aspect?: "16:9" | "4:3" | "1:1";
  autoplay?: boolean; // only for hosted videos; YouTube autoplays on click
  controls?: boolean;
  muted?: boolean;
}

const aspectClasses: Record<string, string> = {
  "16:9": "pt-[56.25%]",
  "4:3": "pt-[75%]",
  "1:1": "pt-[100%]",
};

export function VideoEmbed({
  youtubeId,
  url,
  poster,
  className,
  aspect = "16:9",
  autoplay = false,
  controls = true,
  muted = false,
}: VideoEmbedProps) {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const ratioClass = aspectClasses[aspect] || aspectClasses["16:9"];

  return (
    <div ref={containerRef} className={`relative w-full overflow-hidden rounded-md bg-black ${className || ""}`}>      
      <div className={`relative ${ratioClass}`}>
        {!isVisible ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
            Loading video...
          </div>
        ) : youtubeId ? (
          <YouTubePlayer
            videoId={youtubeId}
            poster={poster}
          />
        ) : url ? (
          <HostedVideo
            url={url}
            poster={poster}
            autoplay={autoplay}
            controls={controls}
            muted={muted}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
            No video available
          </div>
        )}
      </div>
    </div>
  );
}

function YouTubePlayer({ videoId, poster, onReady, onPlay }: { videoId: string; poster?: string; onReady?: () => void; onPlay?: () => void }) {
  const [activated, setActivated] = useState(false);

  const thumb = poster || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  if (!activated) {
    return (
      <button
        type="button"
        onClick={() => {
          setActivated(true);
          onPlay?.();
        }}
        className="absolute inset-0 group"
        aria-label="Play video"
      >
        {/* Thumbnail */}
        <Image src={thumb} alt="Video thumbnail" fill unoptimized sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-white/80 group-hover:bg-white shadow flex items-center justify-center">
            <Play className="text-black translate-x-[1px]" size={28} />
          </div>
        </div>
      </button>
    );
  }

  // Privacy-enhanced mode: YouTube sets no cookies unless the viewer interacts with the player
  const src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
  return (
    <iframe
      title="YouTube video player"
      src={src}
      className="absolute inset-0 h-full w-full"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      // YouTube refuses to play without a referrer (error 153). This sends our origin only,
      // never the page path, so private links like /x/<token> stay private.
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
      loading="lazy"
      onLoad={onReady}
    />
  );
}

function HostedVideo({ url, poster, autoplay, controls, muted, onReady, onPlay }: { url: string; poster?: string; autoplay?: boolean; controls?: boolean; muted?: boolean; onReady?: () => void; onPlay?: () => void }) {
  return (
    <video
      className="absolute inset-0 h-full w-full object-cover"
      poster={poster}
      preload="metadata"
      controls={controls}
      autoPlay={autoplay}
      muted={muted}
      onCanPlay={onReady}
      onPlay={onPlay}
    >
      <source src={url} />
      Your browser does not support the video tag.
    </video>
  );
}
