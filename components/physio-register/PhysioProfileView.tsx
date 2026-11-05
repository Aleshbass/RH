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
} from '@/components/icons';
import { WhatsApp } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import PeerVerificationForm from '@/components/physio-register/PeerVerificationForm';
import RehabifyConversionPopup from '@/components/physio-register/RehabifyConversionPopup';
import { displayFont } from '@/components/learn/shared';
import { initialsOf, regulatorLabel } from '@/components/physio-register/PhysioProfileCard';
import Image from 'next/image';
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
      <div className="min-h-screen bg-rh-cream flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-rh-ink mx-auto mb-4" />
          <p className="text-rh-ink/60">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className="min-h-screen bg-rh-cream flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-rh-ink/[0.06] flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-rh-ink/45" />
          </div>
          <h1 className="text-2xl font-bold text-rh-ink mb-2">Profile Not Found</h1>
          <p className="text-rh-ink/60 mb-6">This physiotherapist profile doesn&apos;t exist or has been removed.</p>
          <Link href="/physio-register">
            <Button className="bg-rh-ink hover:bg-black text-white rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Register
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const colleagueVerifications = verifications?.filter((v: any) => v.verifierType === 'colleague') || [];
  const patientReviews = verifications?.filter((v: any) => v.verifierType === 'patient') || [];
  const displayedVerifications = showAllVerifications ? colleagueVerifications : colleagueVerifications.slice(0, 3);
  const displayedReviews = showAllVerifications ? patientReviews : patientReviews.slice(0, 3);

  return (
    <>
      <div className="min-h-screen bg-rh-cream pt-20 lg:pt-24">
        {/* Header bar */}
        <div className="bg-white border-b border-rh-ink/[0.06]">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link
              href="/physio-register"
              className="flex items-center gap-2 text-sm text-rh-ink/60 hover:text-rh-ink transition-colors"
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
        <div className="bg-white border-b border-rh-ink/[0.06]">
          <div className="max-w-4xl mx-auto px-4 py-2.5 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 text-sm text-center">
            <div className="flex items-center justify-center gap-2">
              <Stethoscope className="w-4 h-4 text-rh-ink/50 shrink-0" />
              <span className="text-rh-ink font-medium">Are you a Patient looking for a Physiotherapist?</span>
            </div>
            <a
              href={`https://wa.me/2348122615453?text=${encodeURIComponent("Hi Joy! 👋🏾 I'm looking for a verified physiotherapist to help with my recovery.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-bold text-rh-ink hover:underline transition-colors"
            >
              <WhatsApp className="w-4 h-4 text-[#25D366]" />
              Chat with Joy on WhatsApp to book a session <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
          {/* Profile hero: a large photo first, then the name, licence and the trust signals */}
          <section className="mb-6 overflow-hidden rounded-[2rem] bg-white shadow-soft">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
              <div className="relative aspect-[5/4] w-full bg-rh-ink sm:aspect-auto sm:min-h-[20rem]">
                {profile.profilePhotoUrl ? (
                  <Image
                    src={profile.profilePhotoUrl}
                    alt={profile.fullName}
                    fill
                    priority
                    unoptimized
                    sizes="(min-width: 640px) 256px, 100vw"
                    className="object-cover object-[50%_25%]"
                  />
                ) : (
                  <span className={cn('absolute inset-0 flex items-center justify-center text-7xl text-rh-lime', displayFont)}>
                    {initialsOf(profile.fullName)}
                  </span>
                )}
                {profile.isRehabifyApproved && (
                  <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-rh-ink shadow-soft">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#00cd0f]" /> Verified by Rehabify
                  </span>
                )}
              </div>

              <div className="flex min-w-0 flex-col p-6 sm:p-8">
                <div className="flex items-start justify-between gap-3">
                  <h1 className={cn('min-w-0 break-words text-[28px] leading-tight tracking-tight text-rh-ink sm:text-[36px]', displayFont)}>
                    {profile.fullName}
                  </h1>
                  {profile.ranking && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rh-ink px-3 py-1.5 text-sm font-semibold text-white">
                      <Award className="h-4 w-4 text-rh-lime" /> #{profile.ranking}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-rh-ink/60">
                  {regulatorLabel(profile.regulatoryBody)} licence <span className="break-all font-semibold text-rh-ink">{profile.licenseNumber}</span>
                </p>
                {(profile.practiceName || profile.practiceAddress) && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-rh-ink/60">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-rh-ink/40" />
                    <span className="min-w-0 truncate">{profile.practiceName || profile.practiceAddress}</span>
                  </p>
                )}

                {/* Trust signals as tiles */}
                <dl className="mt-6 grid grid-cols-2 gap-2.5 sm:mt-auto sm:grid-cols-3 sm:pt-6">
                  <div className="rounded-2xl bg-rh-cream px-4 py-3">
                    <dt className="flex items-center gap-1.5 text-xs text-rh-ink/55">
                      <Clock className="h-3.5 w-3.5" /> Experience
                    </dt>
                    <dd className={cn('mt-1 text-xl text-rh-ink', displayFont)}>
                      {profile.yearsOfExperience} yr{profile.yearsOfExperience === 1 ? '' : 's'}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-rh-cream px-4 py-3">
                    <dt className="flex items-center gap-1.5 text-xs text-rh-ink/55">
                      <Users className="h-3.5 w-3.5" /> Colleagues
                    </dt>
                    <dd className={cn('mt-1 text-xl text-rh-ink', displayFont)}>{profile.peerVerificationCount} verified</dd>
                  </div>
                  <div className="col-span-2 rounded-2xl bg-rh-cream px-4 py-3 sm:col-span-1">
                    <dt className="flex items-center gap-1.5 text-xs text-rh-ink/55">
                      <Star className="h-3.5 w-3.5" /> Patients
                    </dt>
                    <dd className={cn('mt-1 text-xl text-rh-ink', displayFont)}>
                      {profile.averagePatientRating > 0
                        ? `${profile.averagePatientRating.toFixed(1)} · ${profile.patientReviewCount} review${profile.patientReviewCount === 1 ? '' : 's'}`
                        : 'No reviews yet'}
                    </dd>
                  </div>
                </dl>
                {profile.referralCount > 0 && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-rh-ink/55">
                    <UserCheck className="h-3.5 w-3.5" /> {profile.referralCount} referral{profile.referralCount === 1 ? '' : 's'} to other physios
                  </p>
                )}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left column — Info */}
            <div className="md:col-span-2 space-y-6">
              {/* Bio */}
              {profile.bio && (
                <div className="bg-white rounded-[1.75rem] shadow-soft p-6">
                  <h2 className="text-xs font-semibold text-rh-ink/50 uppercase tracking-[0.14em] mb-3">About</h2>
                  <p className="text-rh-ink/80 leading-relaxed">{profile.bio}</p>
                </div>
              )}

              {/* MRTB License Document — Compulsory Viewing */}
              <div className="bg-white rounded-[1.75rem] shadow-soft p-6">
                <h2 className="text-xs font-semibold text-rh-ink/50 uppercase tracking-[0.14em] mb-3">
                  MRTB License Document
                </h2>
                <p className="text-xs text-rh-ink/60 mb-3">
                  This document is publicly viewable to confirm licensure.
                </p>
                {profile.licenseCertUrl ? (
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowLicenseDoc(!showLicenseDoc)}
                      className="w-full flex items-center justify-between p-4 rounded-xl bg-rh-ink/[0.04] hover:bg-rh-ink/[0.07] transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-rh-ink" />
                        <div>
                          <p className="font-medium text-rh-ink text-sm">License Certificate</p>
                          <p className="text-xs text-rh-ink/60">{profile.regulatoryBody} • {profile.licenseNumber}</p>
                        </div>
                      </div>
                      {showLicenseDoc ? (
                        <ChevronUp className="w-5 h-5 text-rh-ink/45" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-rh-ink/45" />
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
                          <div className="rounded-xl overflow-hidden border border-rh-ink/10 bg-rh-cream">
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
                            className="inline-flex items-center gap-1.5 text-xs text-rh-ink hover:underline mt-2"
                          >
                            <ExternalLink className="w-3 h-3" /> Open in new tab
                          </a>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <p className="text-sm text-rh-ink/45 italic">Document not available</p>
                )}
              </div>

              {/* Colleague Verifications */}
              <div className="bg-white rounded-[1.75rem] shadow-soft p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-semibold text-rh-ink/50 uppercase tracking-[0.14em]">
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
                      <div key={v.id} className="flex items-start gap-3 p-3 rounded-xl bg-rh-cream border border-rh-ink/[0.06]">
                        <div className="w-8 h-8 rounded-full bg-rh-ink/[0.06] flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4 text-rh-ink" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-rh-ink">{v.verifierName}</p>
                          {v.verifierQualifications && (
                            <p className="text-xs text-rh-ink/60">{v.verifierQualifications}</p>
                          )}
                          {v.relationshipContext && (
                            <span className="inline-flex items-center gap-1 text-xs text-rh-ink/75 bg-rh-ink/[0.05] px-2 py-0.5 rounded-full mt-1 border border-rh-ink/[0.06]">
                              {RELATIONSHIP_LABELS[v.relationshipContext] || v.relationshipContext}
                            </span>
                          )}
                          {v.relationshipDetails && (
                            <p className="text-xs text-rh-ink/60 mt-1 italic">&quot;{v.relationshipDetails}&quot;</p>
                          )}
                        </div>
                        <span className="text-[10px] text-rh-ink/45 shrink-0">
                          {new Date(v.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                    {colleagueVerifications.length > 3 && !showAllVerifications && (
                      <button
                        onClick={() => setShowAllVerifications(true)}
                        className="text-xs text-rh-ink hover:underline font-medium"
                      >
                        Show all {colleagueVerifications.length} verifications
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-rh-ink/45 italic">
                    No colleague verifications yet. Be the first!
                  </p>
                )}
              </div>

              {/* Patient Reviews */}
              <div className="bg-white rounded-[1.75rem] shadow-soft p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-semibold text-rh-ink/50 uppercase tracking-[0.14em]">
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
                      <div key={v.id} className="p-4 rounded-xl bg-rh-cream border border-rh-ink/[0.06]">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-rh-ink">{v.verifierName}</p>
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
                          <p className="text-sm text-rh-ink/70 leading-relaxed">{v.reviewText}</p>
                        )}
                        <p className="text-[10px] text-rh-ink/45 mt-2">
                          {new Date(v.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                    {patientReviews.length > 3 && !showAllVerifications && (
                      <button
                        onClick={() => setShowAllVerifications(true)}
                        className="text-xs text-rh-ink hover:underline font-medium"
                      >
                        Show all {patientReviews.length} reviews
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-rh-ink/45 italic">
                    No patient reviews yet.
                  </p>
                )}
              </div>
            </div>

            {/* Right column — Sidebar */}
            <div className="space-y-6">
              {/* Quick actions */}
              <div className="bg-white rounded-[1.75rem] shadow-soft p-5 space-y-3">
                <Button
                  onClick={() => setShowVerificationForm(true)}
                  className="w-full h-11 bg-rh-ink hover:bg-black text-white rounded-xl text-sm "
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
              <div className="bg-white rounded-[1.75rem] shadow-soft p-5 space-y-4">
                <h3 className="text-xs font-semibold text-rh-ink/50 uppercase tracking-[0.14em]">Details</h3>

                {profile.specialties.length > 0 && (
                  <div>
                    <p className="text-xs text-rh-ink/45 mb-1.5 flex items-center gap-1"><GraduationCap className="w-3 h-3" /> Specialties</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.specialties.map((s: string) => (
                        <span key={s} className="bg-rh-ink/[0.05] text-rh-ink/75 px-2 py-0.5 rounded-full text-xs border border-rh-ink/[0.06]">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {profile.languages.length > 0 && (
                  <div>
                    <p className="text-xs text-rh-ink/45 mb-1 flex items-center gap-1"><Globe className="w-3 h-3" /> Languages</p>
                    <p className="text-sm text-rh-ink/80">{profile.languages.join(', ')}</p>
                  </div>
                )}

                {(profile.practiceAddress || profile.practiceName) && (
                  <div>
                    <p className="text-xs text-rh-ink/45 mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Practice</p>
                    {profile.practiceName && <p className="text-sm font-medium text-rh-ink/80">{profile.practiceName}</p>}
                    {profile.practiceAddress && <p className="text-sm text-rh-ink/70">{profile.practiceAddress}</p>}
                  </div>
                )}

                <div>
                  <p className="text-xs text-rh-ink/45 mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> License</p>
                  <p className="text-sm text-rh-ink/80">{profile.licenseNumber} • {profile.licenseCountry}</p>
                  <p className="text-xs text-rh-ink/60">Expires: {profile.licenseExpiryDate}</p>
                </div>

                {profile.websiteUrl && (
                  <div>
                    <p className="text-xs text-rh-ink/45 mb-1 flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Website</p>
                    <a
                      href={profile.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-rh-ink hover:underline break-all"
                    >
                      {profile.websiteUrl}
                    </a>
                  </div>
                )}

                {profile.isRehabifyApproved && (
                  <div className="bg-rh-ink rounded-xl p-3">
                    <div className="flex items-center gap-2 text-white text-xs font-semibold">
                      <ShieldCheck className="w-4 h-4 text-rh-lime" />
                      Verified by Rehabify
                    </div>
                  </div>
                )}
              </div>

              {/* Share CTA for owners */}
              {isOwner && (
                <div className="bg-gradient-to-br from-rh-cream to-rh-cream rounded-2xl border border-rh-ink/[0.06] p-5">
                  <h3 className="font-bold text-rh-ink text-sm mb-2">
                    🚀 Become a top Physiotherapist
                  </h3>
                  <p className="text-xs text-rh-ink/70 mb-3 leading-relaxed">
                    Share your profile to get your colleagues to verify you.
                    The more verifications you get, the higher you rank!
                  </p>
                  <Button
                    onClick={handleShare}
                    className="w-full h-10 bg-rh-ink hover:bg-black text-white rounded-xl text-xs"
                  >
                    <Share2 className="w-3.5 h-3.5 mr-2" />
                    Share Your Profile
                  </Button>
                </div>
              )}

              {/* Referral link for owners */}
              {isOwner && profile.licenseNumber && (
                <div className="bg-white rounded-[1.75rem] shadow-soft p-5">
                  <h3 className="font-bold text-rh-ink text-sm mb-2">
                    📤 Refer a Colleague
                  </h3>
                  <p className="text-xs text-rh-ink/60 mb-3">
                    Share this link with colleagues. When they register via your link, your ranking score increases!
                  </p>
                  <div className="bg-rh-cream rounded-xl p-3 border border-rh-ink/10">
                    <p className="text-[10px] text-rh-ink/45 mb-1">Your referral link:</p>
                    <p className="text-xs text-rh-ink font-mono break-all">
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
        slug={slug}
      />
    </>
  );
}
