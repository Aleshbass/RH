'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, ChevronRight, PlayCircle } from '@/components/icons';
import { MARKETING_VIDEOS, cloudinaryPoster, cloudinaryVideo } from '@/lib/marketingVideos';

const STORAGE_KEY = 'rehabify_physio_guide_video_seen';
// The same film as the landing page's physiotherapist demo ("Rehabify for physiotherapists")
const GUIDE_VIDEO_URL = MARKETING_VIDEOS.physiotherapist;

interface PhysioGuideVideoModalProps {
  /** If true, always shows regardless of localStorage (post-onboarding screens). */
  forceShow?: boolean;
  /** Optional callback when the modal is closed / skipped. */
  onClose?: () => void;
  /** Title displayed in the header. */
  title?: string;
  /** Subtitle displayed below the title. */
  subtitle?: string;
}

/**
 * PhysioGuideVideoModal
 *
 * Shows a premium cinematic splash screen with a large play button.
 * Clicking it plays the physiotherapist demo film from the landing page, in place.
 *
 * - forceShow=true → always shows (post-onboarding page)
 * - default → shows once per browser (localStorage)
 */
export function PhysioGuideVideoModal({
  forceShow = false,
  onClose,
  title = '🎬 Welcome to Rehabify!',
  subtitle = 'Watch this short guide to get the most out of your platform.',
}: PhysioGuideVideoModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [videoStarted, setVideoStarted] = useState(false);

  useEffect(() => {
    if (forceShow) {
      setIsOpen(true);
      return;
    }
    const alreadySeen = localStorage.getItem(STORAGE_KEY);
    if (!alreadySeen) {
      const timer = setTimeout(() => setIsOpen(true), 600);
      return () => clearTimeout(timer);
    }
  }, [forceShow]);

  const handleClose = () => {
    if (!forceShow) {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    setIsOpen(false);
    setVideoStarted(false);
    onClose?.();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="physio-guide-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}
        >
          <motion.div
            key="physio-guide-modal"
            initial={{ opacity: 0, scale: 0.90, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.90, y: 40 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* ── Header ── */}
            <div className="bg-rh-ink px-6 pt-5 pb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
                <p className="mt-0.5 text-sm text-rh-lime leading-snug">{subtitle}</p>
              </div>
              <button
                onClick={handleClose}
                aria-label="Skip video guide"
                className="flex items-center gap-1 shrink-0 rounded-lg bg-white/15 hover:bg-white/25 active:bg-white/30 transition-colors px-3 py-1.5 text-sm font-semibold text-white"
              >
                Skip
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* ── Video Area (16:9) ── */}
            <div className="relative bg-[#0a1628]" style={{ paddingTop: '56.25%' }}>

              {!videoStarted ? (
                /* ── Cinematic Splash / Play Button ── */
                <div className="absolute inset-0 flex items-center justify-center overflow-hidden">

                  {/* Flat background */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        '#0b1312',
                    }}
                  />

                  {/* Subtle grid lines */}
                  <div
                    className="absolute inset-0 opacity-[0.07]"
                    style={{
                      backgroundImage:
                        'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
                      backgroundSize: '44px 44px',
                    }}
                  />

                  {/* Content */}
                  <div className="relative z-10 flex flex-col items-center gap-5 select-none px-4 text-center">

                    <div className="relative flex items-center justify-center">
                      {/* Play button */}
                      <motion.button
                        whileHover={{ scale: 1.06 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setVideoStarted(true)}
                        aria-label="Play platform guide video"
                        className="relative h-20 w-20 rounded-full bg-rh-lime hover:bg-rh-lime-deep flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-4 focus-visible:ring-rh-lime"
                      >
                        <Play className="h-9 w-9 text-rh-ink ml-1" />
                      </motion.button>
                    </div>

                    {/* Text labels */}
                    <div>
                      <p className="text-white text-base font-semibold tracking-wide drop-shadow-md">
                        Click to Watch Your Platform Guide
                      </p>
                      <p className="text-rh-lime text-xs mt-1.5 font-medium opacity-75 tracking-wide uppercase">
                        Rehabify Health · Platform Overview
                      </p>
                    </div>

                    {/* Chip */}
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3.5 py-1.5 text-xs text-white/70 font-medium backdrop-blur-sm">
                      <PlayCircle className="h-3.5 w-3.5 text-rh-lime" />
                      Full guided walkthrough
                    </span>
                  </div>
                </div>
              ) : (
                /* ── The landing page's physiotherapist film, loaded after clicking play ── */
                <video
                  src={cloudinaryVideo(GUIDE_VIDEO_URL)}
                  poster={cloudinaryPoster(GUIDE_VIDEO_URL)}
                  title="Rehabify for physiotherapists"
                  controls
                  autoPlay
                  playsInline
                  className="absolute inset-0 h-full w-full bg-black object-contain"
                />
              )}
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-500 leading-relaxed">
                Covers profile setup, appointments, billing, exercise library &amp; more.
              </p>
              <button
                onClick={handleClose}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-rh-lime hover:bg-rh-lime-deep active:scale-95 transition-all px-4 py-2 text-sm font-semibold text-rh-ink"
              >
                Got it, let&apos;s go!
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PhysioGuideVideoModal;
