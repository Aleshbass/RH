'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Search, ShieldCheck, ShieldAlert, Clock, Award, MapPin, Globe, Briefcase, GraduationCap, ChevronDown, ChevronUp, ZoomIn, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Id } from '@/convex/_generated/dataModel';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';

interface VerifiedEntry {
    id: string;
    fullName: string;
    licenseNumber: string;
    regulatoryBody: string;
    licenseCountry: string;
    licenseExpiryDate: string;
    specialties: string[];
    languages: string[];
    bio: string;
    yearsOfExperience: number;
    practiceAddress: string;
    verificationStatus: string;
    verifiedAt?: number;
    profilePhotoStorageId?: Id<"_storage">;
    profileImageUrl?: string;
    source: "registry" | "platform";
}

function ProfilePhoto({ storageId, imageUrl, onClick }: { storageId?: Id<"_storage"> | null, imageUrl?: string, onClick?: () => void }) {
    const url = useQuery(
        api.physioRegistry.getProfilePhotoUrl,
        storageId ? { storageId } : "skip"
    );

    const finalUrl = imageUrl || url;

    if (!finalUrl) {
        return (
            <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center shrink-0 border-2 border-white shadow-sm">
                <ShieldCheck className="w-8 h-8 text-[#005b57]" />
            </div>
        );
    }

    return (
        <div className="relative group shrink-0 cursor-pointer" onClick={onClick}>
            <img src={finalUrl} alt="Profile" className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm transition-transform group-hover:scale-105" />
            <div className="absolute inset-0 bg-black/20 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <ZoomIn className="w-4 h-4 text-white" />
            </div>
        </div>
    );
}

function ResultCard({ entry }: { entry: VerifiedEntry }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showImageModal, setShowImageModal] = useState(false);

    const isExpiringSoon = (expiryDate: string) => {
        const expiry = new Date(expiryDate);
        const now = new Date();
        const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return daysUntil > 0 && daysUntil <= 90;
    };

    const isExpired = (expiryDate: string) => {
        return new Date(expiryDate) < new Date();
    };

    // Use fetched photo URL for full screen preview
    const storageUrl = useQuery(
        api.physioRegistry.getProfilePhotoUrl,
        entry.profilePhotoStorageId ? { storageId: entry.profilePhotoStorageId } : "skip"
    );
    const fullImageUrl = entry.profileImageUrl || storageUrl;

    return (
        <>
            <div 
                className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-start gap-5">
                    <ProfilePhoto 
                        storageId={entry.profilePhotoStorageId} 
                        imageUrl={entry.profileImageUrl} 
                        onClick={() => {
                            if (fullImageUrl) setShowImageModal(true);
                        }} 
                    />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold text-[#002e2c] group-hover:text-[#005b57] transition-colors">{entry.fullName}</h3>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                    <ShieldCheck className="w-3 h-3" /> Verified
                                </span>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-teal-600 rounded-full">
                                {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 mt-2">
                            <div>
                                <span className="text-gray-400">License #:</span>{' '}
                                <strong className="text-[#002e2c]">{entry.licenseNumber}</strong>
                            </div>
                            <div>
                                <span className="text-gray-400">Body:</span>{' '}
                                <strong>{entry.regulatoryBody}</strong>
                            </div>
                        </div>

                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <div className="pt-3 pb-1">
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
                                            <div>
                                                <span className="text-gray-400">Country:</span>{' '}
                                                <strong>{entry.licenseCountry}</strong>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">Expiry:</span>{' '}
                                                <strong className={cn(
                                                    isExpired(entry.licenseExpiryDate) && "text-red-600",
                                                    isExpiringSoon(entry.licenseExpiryDate) && "text-amber-600"
                                                )}>
                                                    {entry.licenseExpiryDate}
                                                    {isExpired(entry.licenseExpiryDate) && ' (Expired)'}
                                                    {isExpiringSoon(entry.licenseExpiryDate) && ' ⚠️'}
                                                </strong>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">Experience:</span>{' '}
                                                <strong>{entry.yearsOfExperience} years</strong>
                                            </div>
                                        </div>

                                        {(entry.specialties.length > 0 || entry.languages.length > 0) && (
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 pt-4 border-t border-gray-100">
                                                {entry.specialties.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        <GraduationCap className="w-4 h-4 text-teal-600 mr-1" />
                                                        {entry.specialties.map((s: string) => (
                                                            <span key={s} className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full text-xs border border-teal-100">
                                                                {s}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {entry.languages.length > 0 && (
                                                    <div className="flex items-center text-sm text-gray-600">
                                                        <Globe className="w-4 h-4 text-teal-600 mr-1.5" />
                                                        {entry.languages.join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {(entry.practiceAddress || entry.bio) && (
                                            <div className="mt-4 space-y-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
                                                {entry.practiceAddress && (
                                                    <div className="flex items-start gap-2 text-sm text-gray-600">
                                                        <MapPin className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                                                        <span>{entry.practiceAddress}</span>
                                                    </div>
                                                )}
                                                {entry.bio && (
                                                    <p className="text-sm text-gray-600 leading-relaxed italic">
                                                        "{entry.bio}"
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {entry.verifiedAt && (
                                            <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                Verified on {new Date(entry.verifiedAt).toLocaleDateString()}
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Fullscreen Image Modal */}
            <AnimatePresence>
                {showImageModal && fullImageUrl && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowImageModal(false)}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="relative max-w-2xl w-full max-h-[90vh] flex flex-col items-center justify-center"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Button 
                                variant="ghost" 
                                size="icon"
                                className="absolute -top-12 right-0 md:-right-12 text-white hover:bg-white/20 rounded-full"
                                onClick={() => setShowImageModal(false)}
                            >
                                <X className="w-6 h-6" />
                            </Button>
                            <img 
                                src={fullImageUrl} 
                                alt={entry.fullName} 
                                className="w-full h-auto max-h-[80vh] object-contain rounded-xl shadow-2xl"
                            />
                            <h3 className="text-white text-xl font-medium mt-4">{entry.fullName}</h3>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

export default function VerifyPhysioPage() {
    const [searchType, setSearchType] = useState<'name' | 'license'>('name');
    const [searchInput, setSearchInput] = useState('');
    const [query, setQuery] = useState('');
    const [licenseQuery, setLicenseQuery] = useState('');
    const [hasSearched, setHasSearched] = useState(false);

    const results = useQuery(
        api.physioRegistry.searchRegistry,
        searchType === 'license'
            ? { licenseNumber: licenseQuery || undefined }
            : { searchQuery: query || undefined }
    );

    // Trigger confetti on successful license search
    useEffect(() => {
        if (hasSearched && searchType === 'license' && results && results.length > 0) {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#005b57', '#14b8a6', '#fdd835']
            });
            
            // Play success sound
            try {
                const audio = new Audio('/sound/public_sound_Magic Sweep 2.wav');
                audio.volume = 0.5;
                audio.play().catch(e => console.log('Audio playback prevented:', e));
            } catch (error) {
                console.error('Error playing sound:', error);
            }
        }
    }, [results, hasSearched, searchType]);

    const handleSearch = () => {
        setHasSearched(true);
        if (searchType === 'license') {
            setLicenseQuery(searchInput.trim());
            setQuery('');
        } else {
            setQuery(searchInput.trim());
            setLicenseQuery('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSearch();
    };

    };

    return (
        <main className="min-h-screen bg-gradient-to-b from-white via-teal-50/30 to-white pt-24 pb-16">
            <div className="max-w-2xl mx-auto px-4">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-[#005b57] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-900/20">
                        <Search className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-[#002e2c] mb-2">Verify a Physiotherapist</h1>
                    <p className="text-gray-500">
                        Search by name or MRTB license number to verify a physiotherapist&apos;s credentials
                    </p>
                </div>

                {/* Search */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-8">
                    {/* Toggle */}
                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => { setSearchType('name'); setSearchInput(''); setHasSearched(false); }}
                            className={cn(
                                "flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all",
                                searchType === 'name'
                                    ? "bg-[#005b57] text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            )}
                        >
                            Search by Name
                        </button>
                        <button
                            onClick={() => { setSearchType('license'); setSearchInput(''); setHasSearched(false); }}
                            className={cn(
                                "flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all",
                                searchType === 'license'
                                    ? "bg-[#005b57] text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            )}
                        >
                            Search by License #
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <Input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={searchType === 'name' ? "Enter full name..." : "Enter MRTB license number..."}
                            className="h-12"
                        />
                        <Button
                            onClick={handleSearch}
                            disabled={!searchInput.trim()}
                            className="h-12 px-6 bg-[#005b57] hover:bg-[#00443e]"
                        >
                            <Search className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Results */}
                {hasSearched && results && (
                    <div className="space-y-4">
                        {results.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
                                <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <h3 className="text-lg font-semibold text-gray-700 mb-1">No verified physiotherapist found</h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    {searchType === 'license'
                                        ? "No verified physiotherapist matches this license number."
                                        : "No verified physiotherapist matches this name."}
                                </p>
                                <p className="text-xs text-gray-400">
                                    Only verified physiotherapists appear in search results.
                                </p>
                            </div>
                        ) : (
                            <>
                                <p className="text-sm text-gray-500">{results.length} result{results.length !== 1 ? 's' : ''} found</p>
                                {results.map((entry: VerifiedEntry) => (
                                    <ResultCard key={entry.id} entry={entry} />
                                ))}
                            </>
                        )}
                    </div>
                )}

                {/* CTA */}
                {!hasSearched && (
                    <div className="text-center mt-8">
                        <p className="text-sm text-gray-500 mb-3">Are you a physiotherapist?</p>
                        <Link
                            href="/physio-register/register"
                            className="inline-flex items-center gap-2 text-sm font-semibold text-[#005b57] hover:underline"
                        >
                            <Award className="w-4 h-4" />
                            Register your credentials
                        </Link>
                    </div>
                )}
            </div>
        </main>
    );
}
