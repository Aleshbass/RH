'use client';

import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Star, Briefcase, GraduationCap, Handshake, MessageSquare, X, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const RELATIONSHIP_OPTIONS = [
  { value: 'school' as const, label: 'School / University', icon: GraduationCap },
  { value: 'work' as const, label: 'Workplace', icon: Briefcase },
  { value: 'conference' as const, label: 'Conference / Event', icon: Handshake },
  { value: 'mentorship' as const, label: 'Mentorship', icon: Users },
  { value: 'other' as const, label: 'Other', icon: MessageSquare },
];

interface PeerVerificationFormProps {
  registryEntryId: Id<"physioRegistry">;
  physioName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function PeerVerificationForm({
  registryEntryId,
  physioName,
  onClose,
  onSuccess,
}: PeerVerificationFormProps) {
  const [verifierType, setVerifierType] = useState<'colleague' | 'patient' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Colleague fields
  const [verifierName, setVerifierName] = useState('');
  const [verifierEmail, setVerifierEmail] = useState('');
  const [verifierQualifications, setVerifierQualifications] = useState('');
  const [verifierLicenseNumber, setVerifierLicenseNumber] = useState('');
  const [relationshipContext, setRelationshipContext] = useState<'school' | 'work' | 'conference' | 'mentorship' | 'other' | ''>('');
  const [relationshipDetails, setRelationshipDetails] = useState('');

  // Patient fields
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [reviewText, setReviewText] = useState('');

  const submitVerification = useMutation(api.physioRegistry.submitPeerVerification);

  const handleSubmit = async () => {
    if (!verifierType || !verifierName.trim()) {
      toast.error('Please fill in your name');
      return;
    }

    if (verifierType === 'colleague' && !relationshipContext) {
      toast.error('Please select how you know this physiotherapist');
      return;
    }

    if (verifierType === 'patient' && rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitVerification({
        registryEntryId,
        verifierType,
        verifierName: verifierName.trim(),
        verifierEmail: verifierEmail.trim() || undefined,
        verifierQualifications: verifierQualifications.trim() || undefined,
        verifierLicenseNumber: verifierLicenseNumber.trim() || undefined,
        relationshipContext: relationshipContext || undefined,
        relationshipDetails: relationshipDetails.trim() || undefined,
        rating: verifierType === 'patient' ? rating : undefined,
        reviewText: reviewText.trim() || undefined,
      });

      toast.success(
        verifierType === 'colleague'
          ? 'Thank you! Your verification has been submitted.'
          : 'Thank you! Your review has been submitted.'
      );
      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-[#002e2c]">
              {!verifierType ? 'How do you know' : verifierType === 'colleague' ? 'Verify' : 'Review'} {physioName}?
            </h2>
            <p className="text-xs text-gray-500">Takes less than 1 minute</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Step 1: Choose type */}
          {!verifierType && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 font-medium">I am a...</p>
              <button
                onClick={() => setVerifierType('colleague')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100 hover:border-teal-300 hover:bg-teal-50/30 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-[#005b57]" />
                </div>
                <div>
                  <p className="font-semibold text-[#002e2c]">Fellow Physiotherapist / Colleague</p>
                  <p className="text-xs text-gray-500">I know this physio professionally</p>
                </div>
              </button>
              <button
                onClick={() => setVerifierType('patient')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100 hover:border-amber-300 hover:bg-amber-50/30 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Star className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-[#002e2c]">Patient</p>
                  <p className="text-xs text-gray-500">I have been treated by this physio</p>
                </div>
              </button>
            </div>
          )}

          {/* Step 2a: Colleague verification form */}
          {verifierType === 'colleague' && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <button onClick={() => setVerifierType(null)} className="text-xs text-[#005b57] hover:underline">
                ← Back
              </button>

              <div className="space-y-2">
                <Label>Your Full Name <span className="text-red-500">*</span></Label>
                <Input
                  value={verifierName}
                  onChange={(e) => setVerifierName(e.target.value)}
                  placeholder="Dr. Jane Smith"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label>Your Email <span className="text-gray-400 text-xs">(Optional)</span></Label>
                <Input
                  value={verifierEmail}
                  onChange={(e) => setVerifierEmail(e.target.value)}
                  placeholder="jane@example.com"
                  type="email"
                  className="h-11"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Your Qualifications</Label>
                  <Input
                    value={verifierQualifications}
                    onChange={(e) => setVerifierQualifications(e.target.value)}
                    placeholder="e.g. PT, MSc"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Your License #</Label>
                  <Input
                    value={verifierLicenseNumber}
                    onChange={(e) => setVerifierLicenseNumber(e.target.value)}
                    placeholder="MRTB-..."
                    className="h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Where do you know them? <span className="text-red-500">*</span></Label>
                <div className="grid grid-cols-2 gap-2">
                  {RELATIONSHIP_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setRelationshipContext(opt.value)}
                        className={cn(
                          'flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all text-left',
                          relationshipContext === opt.value
                            ? 'border-[#005b57] bg-teal-50 text-[#005b57]'
                            : 'border-gray-100 text-gray-600 hover:border-gray-200'
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Additional Details <span className="text-gray-400 text-xs">(Optional)</span></Label>
                <Textarea
                  value={relationshipDetails}
                  onChange={(e) => setRelationshipDetails(e.target.value)}
                  placeholder="How long have you known them? Any additional context..."
                  className="resize-none min-h-[80px]"
                  maxLength={300}
                />
              </div>
            </motion.div>
          )}

          {/* Step 2b: Patient review form */}
          {verifierType === 'patient' && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <button onClick={() => setVerifierType(null)} className="text-xs text-[#005b57] hover:underline">
                ← Back
              </button>

              <div className="space-y-2">
                <Label>Your Name <span className="text-red-500">*</span></Label>
                <Input
                  value={verifierName}
                  onChange={(e) => setVerifierName(e.target.value)}
                  placeholder="Your full name"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label>Your Email <span className="text-gray-400 text-xs">(Optional)</span></Label>
                <Input
                  value={verifierEmail}
                  onChange={(e) => setVerifierEmail(e.target.value)}
                  placeholder="email@example.com"
                  type="email"
                  className="h-11"
                />
              </div>

              {/* Star rating */}
              <div className="space-y-2">
                <Label>Rating <span className="text-red-500">*</span></Label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      className="p-1 transition-transform hover:scale-110"
                    >
                      <Star
                        className={cn(
                          'w-8 h-8 transition-colors',
                          (hoveredRating || rating) >= star
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-gray-200'
                        )}
                      />
                    </button>
                  ))}
                  {rating > 0 && (
                    <span className="ml-2 text-sm font-medium text-gray-600">
                      {rating === 1 ? 'Poor' : rating === 2 ? 'Fair' : rating === 3 ? 'Good' : rating === 4 ? 'Very Good' : 'Excellent'}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Your Review <span className="text-gray-400 text-xs">(Optional)</span></Label>
                <Textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Share your experience with this physiotherapist..."
                  className="resize-none min-h-[100px]"
                  maxLength={500}
                />
              </div>
            </motion.div>
          )}
        </div>

        {/* Submit button */}
        {verifierType && (
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full h-12 bg-[#005b57] hover:bg-[#00443e] text-white rounded-xl font-semibold shadow-lg shadow-teal-900/10"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  {verifierType === 'colleague' ? 'Submit Verification' : 'Submit Review'}
                </>
              )}
            </Button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
