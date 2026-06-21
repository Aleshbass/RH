'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, ArrowRight, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface RehabifyConversionPopupProps {
  isOpen: boolean;
  onClose: () => void;
  slug?: string;
}

export default function RehabifyConversionPopup({ isOpen, onClose, slug }: RehabifyConversionPopupProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 30 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Gradient header */}
            <div className="bg-gradient-to-br from-[#005b57] via-teal-600 to-emerald-500 p-8 text-center relative">
              <div className="absolute top-3 right-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-white/70 hover:text-white hover:bg-white/10 rounded-full"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Join RehabifyHealth
              </h2>
              <p className="text-teal-100 text-sm">
                Take your practice to the next level
              </p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-gray-600 text-sm leading-relaxed">
                Do you want to <strong className="text-[#002e2c]">Join RehabifyHealth Officially</strong> and
                start earning and getting patients directly from us too?
              </p>

              <div className="space-y-3">
                {[
                  { icon: '💰', text: 'Earn directly through our platform' },
                  { icon: '👥', text: 'Get matched with patients near you' },
                  { icon: '📊', text: 'Access advanced practice management tools' },
                  { icon: '🏥', text: 'Telehealth & in-person appointment booking' },
                  { icon: '✅', text: 'Get the RehabifyHealth Verified badge' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-gray-700">
                    <span className="text-lg">{item.icon}</span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>

              <div className="pt-2 space-y-3">
                <button 
                  onClick={() => {
                    if (slug) {
                      try { localStorage.setItem('physioOnboardingRegistrySlug', slug); } catch {}
                    }
                    window.location.href = "/sign-up?redirect=/physiotherapist";
                  }}
                  className="w-full h-12 bg-[#005b57] hover:bg-[#00443e] text-white rounded-xl font-semibold shadow-lg shadow-teal-900/10 text-sm flex items-center justify-center transition-colors"
                >
                  <Stethoscope className="w-4 h-4 mr-2" />
                  Apply to Join RehabifyHealth
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
                <button
                  onClick={onClose}
                  className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors py-2"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
