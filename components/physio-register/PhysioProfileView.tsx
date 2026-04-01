'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useUser } from '@clerk/nextjs';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Award, MapPin, Globe, Star, Users, ShieldCheck, Share2, Copy,
  FileText, GraduationCap, Briefcase, Clock, ArrowLeft, ExternalLink,
  Pencil, Loader2, Check, Stethoscope, ArrowRight, ChevronDown, ChevronUp,
  MessageSquare, UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import PeerVerificationForm from '@/components/physio-register/PeerVerificationForm';
import RehabifyConversionPopup from '@/components/physio-register/RehabifyConversionPopup';
import { Id } from '@/convex/_generated/dataModel';

const RELATIONSHIP_LABELS: Record<string, string> = {
  school: 'School / University',
  work: 'Workplace',
  conference: 'Conference / Event',
  mentorship: 'Mentorship',
  other: 'Other',
};

export default function PhysioProfilePage() {
  const params = useParams();
  const slug = params?.slug as string;
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();

  const [showVerificationForm, setShowVerificationForm] = useState(false);
  const [showConversionPopup, setShowConversionPopup] = useState(false);
  const [showLicenseDoc, setShowLicenseDoc] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAllVerifications, setShowAllVerifications] = useState(false);

  const profile = useQuery(api.physioRegistry.getPublicProfile, { slug: slug || '' });
  const verifications = useQuery(
    api.physioRegistry.getVerificationsForEntry,
    profile ? { registryEntryId: profile.id as Id<"physioRegistry"> } : 'skip'
  );

  const isOwner = isClerkLoaded && clerkUser && profile?.clerkUserId === clerkUser.id;

  // Show conversion popup 5s after page load for profile owners
  useEffect(() => {
    if (isOwner) {
      const timer = setTimeout(() => {
        const dismissed = localStorage.getItem('rehabify_popup_dismissed');
        if (!dismissed) {
          setShowConversionPopup(true);
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOwner]);

  const handleShare = async () => {
    const url = `${window.location.origin}/physio-register/${slug}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profile?.fullName} — Physio Register`,
          text: `Check out ${profile?.fullName}'s profile on the Physio Register`,
          url,
        });
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Profile link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/physio-register/${slug}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const url = `${window.location.origin}/physio-register/${slug}`;
    const text = `Check out ${profile?.fullName}'s profile on the Physio Register: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (profile === undefined) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#005b57] mx-auto mb-4" />
          <p className="text-gray-500">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Profile Not Found</h1>
          <p className="text-gray-500 mb-6">This physiotherapist profile doesn&apos;t exist or has been removed.</p>
          <Link href="/physio-register">
            <Button className="bg-[#005b57] hover:bg-[#00443e] text-white rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Register
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const colleagueVerifications = verifications?.filter(v => v.verifierType === 'colleague') || [];
  const patientReviews = verifications?.filter(v => v.verifierType === 'patient') || [];
  const displayedVerifications = showAllVerifications ? colleagueVerifications : colleagueVerifications.slice(0, 3);
  const displayedReviews = showAllVerifications ? patientReviews : patientReviews.slice(0, 3);

  return (
    <>
      <div className="min-h-screen bg-gray-50/50 pt-20 lg:pt-24">
        {/* Header bar */}
        <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link
              href="/physio-register"
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#005b57] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Register
            </Link>
            <div className="flex items-center gap-2">
              {isOwner && (
                <Link href={`/physio-register/${slug}/edit`}>
                  <Button variant="outline" size="sm" className="rounded-xl text-xs h-8">
                    <Pencil className="w-3 h-3 mr-1.5" /> Edit Profile
                  </Button>
                </Link>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                className="rounded-xl text-xs h-8"
              >
                {copied ? <Check className="w-3 h-3 mr-1.5" /> : <Share2 className="w-3 h-3 mr-1.5" />}
                {copied ? 'Copied!' : 'Share'}
              </Button>
            </div>
          </div>
        </div>

        {/* Patient CTA Banner */}
        <div className="bg-amber-50 border-b border-amber-200/60">
          <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-center gap-3 text-sm">
            <Stethoscope className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-amber-800">Are you a Patient looking for a Physiotherapist?</span>
            <Link
              href="/start-treatment"
              className="inline-flex items-center gap-1 font-bold text-[#005b57] hover:underline"
            >
              Click here to book a session <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
          {/* Profile Header Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
            <div className="h-2 bg-gradient-to-r from-[#005b57] via-teal-500 to-emerald-400" />
            <div className="p-6 md:p-8">
              <div className="flex flex-col sm:flex-row items-start gap-6">
                {/* Photo */}
                <div className="relative shrink-0">
                  {profile.profilePhotoUrl ? (
                    <img
                      src={profile.profilePhotoUrl}
                      alt={profile.fullName}
                      className="w-24 h-24 md:w-28 md:h-28 rounded-2xl object-cover border-4 border-white shadow-lg ring-2 ring-teal-100"
                    />
                  ) : (
                    <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center border-4 border-white shadow-lg ring-2 ring-teal-100">
                      <span className="text-3xl font-bold text-[#005b57]">
                        {profile.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {profile.isRehabifyApproved && (
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center border-3 border-white shadow">
                      <ShieldCheck className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h1 className="text-2xl md:text-3xl font-bold text-[#002e2c] mb-1">
                        {profile.fullName}
                      </h1>
                      <p className="text-gray-500 text-sm mb-3">
                        {profile.regulatoryBody} • License: <strong className="text-[#002e2c]">{profile.licenseNumber}</strong>
                      </p>
                    </div>
                    {/* Ranking */}
                    {profile.ranking && (
                      <div className="shrink-0 bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-xl px-4 py-3 text-center">
                        <Award className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                        <p className="text-lg font-bold text-amber-700">#{profile.ranking}</p>
                        <p className="text-[10px] text-amber-600 font-medium">
                          out of {profile.totalRegistered}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-teal-600" />
                      <strong>{profile.peerVerificationCount}</strong> colleague verifications
                    </div>
                    {profile.averagePatientRating > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                        <strong>{profile.averagePatientRating.toFixed(1)}</strong> ({profile.patientReviewCount} reviews)
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <strong>{profile.yearsOfExperience}</strong> years experience
                    </div>
                    {profile.referralCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-teal-600" />
                        <strong>{profile.referralCount}</strong> referrals
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left column — Info */}
            <div className="md:col-span-2 space-y-6">
              {/* Bio */}
              {profile.bio && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <h2 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider mb-3">About</h2>
                  <p className="text-gray-700 leading-relaxed">{profile.bio}</p>
                </div>
              )}

              {/* MRTB License Document — Compulsory Viewing */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h2 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider mb-3">
                  MRTB License Document
                </h2>
                <p className="text-xs text-gray-500 mb-3">
                  This document is publicly viewable to confirm licensure.
                </p>
                {profile.licenseCertUrl ? (
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowLicenseDoc(!showLicenseDoc)}
                      className="w-full flex items-center justify-between p-4 rounded-xl bg-teal-50 border border-teal-100 hover:bg-teal-100/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-[#005b57]" />
                        <div>
                          <p className="font-medium text-[#002e2c] text-sm">License Certificate</p>
                          <p className="text-xs text-gray-500">{profile.regulatoryBody} • {profile.licenseNumber}</p>
                        </div>
                      </div>
                      {showLicenseDoc ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                    <AnimatePresence>
                      {showLicenseDoc && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                            <iframe
                              src={profile.licenseCertUrl}
                              className="w-full h-[500px] bg-white"
                              title="License Certificate"
                            />
                          </div>
                          <a
                            href={profile.licenseCertUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-[#005b57] hover:underline mt-2"
                          >
                            <ExternalLink className="w-3 h-3" /> Open in new tab
                          </a>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">Document not available</p>
                )}
              </div>

              {/* Colleague Verifications */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider">
                    Colleague Verifications ({colleagueVerifications.length})
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowVerificationForm(true)}
                    className="rounded-xl text-xs h-8"
                  >
                    <Users className="w-3 h-3 mr-1.5" /> I know this Physio
                  </Button>
                </div>

                {displayedVerifications.length > 0 ? (
                  <div className="space-y-3">
                    {displayedVerifications.map((v: any) => (
                      <div key={v.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                        <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4 text-[#005b57]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#002e2c]">{v.verifierName}</p>
                          {v.verifierQualifications && (
                            <p className="text-xs text-gray-500">{v.verifierQualifications}</p>
                          )}
                          {v.relationshipContext && (
                            <span className="inline-flex items-center gap-1 text-xs text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full mt-1 border border-teal-100">
                              {RELATIONSHIP_LABELS[v.relationshipContext] || v.relationshipContext}
                            </span>
                          )}
                          {v.relationshipDetails && (
                            <p className="text-xs text-gray-500 mt-1 italic">&quot;{v.relationshipDetails}&quot;</p>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {new Date(v.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                    {colleagueVerifications.length > 3 && !showAllVerifications && (
                      <button
                        onClick={() => setShowAllVerifications(true)}
                        className="text-xs text-[#005b57] hover:underline font-medium"
                      >
                        Show all {colleagueVerifications.length} verifications
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">
                    No colleague verifications yet. Be the first!
                  </p>
                )}
              </div>

              {/* Patient Reviews */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider">
                    Patient Reviews ({patientReviews.length})
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowVerificationForm(true)}
                    className="rounded-xl text-xs h-8"
                  >
                    <Star className="w-3 h-3 mr-1.5" /> Write a Review
                  </Button>
                </div>

                {displayedReviews.length > 0 ? (
                  <div className="space-y-3">
                    {displayedReviews.map((v: any) => (
                      <div key={v.id} className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-[#002e2c]">{v.verifierName}</p>
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={cn(
                                  'w-3.5 h-3.5',
                                  (v.rating || 0) >= star
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-gray-200'
                                )}
                              />
                            ))}
                          </div>
                        </div>
                        {v.reviewText && (
                          <p className="text-sm text-gray-600 leading-relaxed">{v.reviewText}</p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-2">
                          {new Date(v.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                    {patientReviews.length > 3 && !showAllVerifications && (
                      <button
                        onClick={() => setShowAllVerifications(true)}
                        className="text-xs text-[#005b57] hover:underline font-medium"
                      >
                        Show all {patientReviews.length} reviews
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">
                    No patient reviews yet.
                  </p>
                )}
              </div>
            </div>

            {/* Right column — Sidebar */}
            <div className="space-y-6">
              {/* Quick actions */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
                <Button
                  onClick={() => setShowVerificationForm(true)}
                  className="w-full h-11 bg-[#005b57] hover:bg-[#00443e] text-white rounded-xl text-sm shadow-lg shadow-teal-900/10"
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  Verify / Review this Physio
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={handleCopyLink}
                    className="rounded-xl text-xs h-9"
                  >
                    <Copy className="w-3 h-3 mr-1.5" />
                    {copied ? 'Copied!' : 'Copy Link'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleShareWhatsApp}
                    className="rounded-xl text-xs h-9"
                  >
                    <Share2 className="w-3 h-3 mr-1.5" />
                    WhatsApp
                  </Button>
                </div>
              </div>

              {/* Details */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider">Details</h3>

                {profile.specialties.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1"><GraduationCap className="w-3 h-3" /> Specialties</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.specialties.map((s: string) => (
                        <span key={s} className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full text-xs border border-teal-100">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {profile.languages.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Globe className="w-3 h-3" /> Languages</p>
                    <p className="text-sm text-gray-700">{profile.languages.join(', ')}</p>
                  </div>
                )}

                {(profile.practiceAddress || profile.practiceName) && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Practice</p>
                    {profile.practiceName && <p className="text-sm font-medium text-gray-700">{profile.practiceName}</p>}
                    {profile.practiceAddress && <p className="text-sm text-gray-600">{profile.practiceAddress}</p>}
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> License</p>
                  <p className="text-sm text-gray-700">{profile.licenseNumber} • {profile.licenseCountry}</p>
                  <p className="text-xs text-gray-500">Expires: {profile.licenseExpiryDate}</p>
                </div>

                {profile.websiteUrl && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Website</p>
                    <a
                      href={profile.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#005b57] hover:underline break-all"
                    >
                      {profile.websiteUrl}
                    </a>
                  </div>
                )}

                {profile.isRehabifyApproved && (
                  <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                    <div className="flex items-center gap-2 text-green-700 text-xs font-semibold">
                      <ShieldCheck className="w-4 h-4" />
                      RehabifyHealth Approved
                    </div>
                  </div>
                )}
              </div>

              {/* Share CTA for owners */}
              {isOwner && (
                <div className="bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl border border-teal-100 p-5">
                  <h3 className="font-bold text-[#002e2c] text-sm mb-2">
                    🚀 Become a top Physiotherapist
                  </h3>
                  <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                    Share your profile to get your colleagues to verify you.
                    The more verifications you get, the higher you rank!
                  </p>
                  <Button
                    onClick={handleShare}
                    className="w-full h-10 bg-[#005b57] hover:bg-[#00443e] text-white rounded-xl text-xs"
                  >
                    <Share2 className="w-3.5 h-3.5 mr-2" />
                    Share Your Profile
                  </Button>
                </div>
              )}

              {/* Referral link for owners */}
              {isOwner && profile.licenseNumber && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h3 className="font-bold text-[#002e2c] text-sm mb-2">
                    📤 Refer a Colleague
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Share this link with colleagues. When they register via your link, your ranking score increases!
                  </p>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                    <p className="text-[10px] text-gray-400 mb-1">Your referral link:</p>
                    <p className="text-xs text-[#005b57] font-mono break-all">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/physio-register/register?ref={profile.licenseNumber}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const url = `${window.location.origin}/physio-register/register?ref=${profile.licenseNumber}`;
                      navigator.clipboard.writeText(url);
                      toast.success('Referral link copied!');
                    }}
                    className="w-full mt-3 rounded-xl text-xs h-9"
                  >
                    <Copy className="w-3 h-3 mr-1.5" /> Copy Referral Link
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Peer Verification Modal */}
      <AnimatePresence>
        {showVerificationForm && (
          <PeerVerificationForm
            registryEntryId={profile.id as Id<"physioRegistry">}
            physioName={profile.fullName}
            onClose={() => setShowVerificationForm(false)}
          />
        )}
      </AnimatePresence>

      {/* Rehabify Conversion Popup */}
      <RehabifyConversionPopup
        isOpen={showConversionPopup}
        onClose={() => {
          setShowConversionPopup(false);
          localStorage.setItem('rehabify_popup_dismissed', 'true');
        }}
      />
    </>
  );
}
