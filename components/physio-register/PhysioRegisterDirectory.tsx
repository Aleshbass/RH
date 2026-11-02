'use client';

import React, { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import {
  Search, UserPlus, ArrowRight, Loader2, BookOpen,
  TrendingUp, Users, Stethoscope,
} from '@/components/icons';
import { WhatsApp } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import PhysioProfileCard from '@/components/physio-register/PhysioProfileCard';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SortBy = 'ranking' | 'newest' | 'experience' | 'name';

export default function PhysioRegisterDirectoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('ranking');

  // Debounce search
  const debounceRef = React.useRef<NodeJS.Timeout | null>(null);
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value);
    }, 300);
  };

  const data = useQuery(api.physioRegistry.listPublicRegistry, {
    searchQuery: debouncedQuery || undefined,
    sortBy,
    limit: 60,
  });

  const stats = useQuery(api.physioRegistry.getRegistryStats);

  const isLoading = data === undefined;
  const physios = data?.results || [];
  const totalCount = data?.total || 0;

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-[#002e2c] via-[#005b57] to-teal-600 text-white pt-24 pb-8 md:pt-32 md:pb-12 relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute right-0 top-0 w-[500px] h-[500px] bg-white rounded-full blur-[120px] -mr-32 -mt-32" />
          <div className="absolute left-0 bottom-0 w-80 h-80 bg-teal-400 rounded-full blur-[100px] -ml-16 -mb-16" />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto">


            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-5 tracking-tight leading-tight">
              The Physio Register
            </h1>
            <p className="text-lg md:text-xl text-teal-100/90 mb-8 font-light max-w-2xl mx-auto">
              Search registered rehabilitation experts across the country.
            </p>

            {/* Search Bar */}
            <div className="relative max-w-xl mx-auto mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, specialty, location, or license number..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-12 h-14 text-base bg-white shadow-2xl border-0 rounded-2xl focus:ring-2 focus:ring-teal-300 text-gray-900 placeholder:text-gray-400"
              />
              {searchQuery !== debouncedQuery && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
                </div>
              )}
            </div>


          </div>
        </div>
      </div>

      {/* Patient CTA Banner */}
      <div className="bg-amber-50 border-b border-amber-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 text-sm text-center sm:text-left">
          <div className="flex items-center justify-center gap-2">
            <Stethoscope className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-amber-800 font-medium">
              Are you a Patient looking for a Physiotherapist?
            </span>
          </div>
          <a
            href={`https://wa.me/2348122615453?text=${encodeURIComponent("Hi Joy! 👋🏾 I need help getting matched with a verified physiotherapist for my recovery.")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-bold text-[#005b57] hover:text-teal-700 hover:underline transition-colors"
          >
            <WhatsApp className="w-4 h-4 text-[#25D366]" />
            Chat with Joy on WhatsApp to book a session <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-end flex-wrap gap-4 mb-8 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="w-full sm:w-48 border-gray-200 bg-white h-10 rounded-xl text-sm">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ranking">Top Ranked</SelectItem>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="experience">Most Experienced</SelectItem>
                <SelectItem value="name">Name (A-Z)</SelectItem>
              </SelectContent>
            </Select>
            <Link href="/physio-register/register" className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto bg-[#005b57] hover:bg-[#00443e] text-white rounded-xl h-10 text-sm shadow-lg shadow-teal-900/10">
                <UserPlus className="w-4 h-4 mr-2" />
                Join the Register
              </Button>
            </Link>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-10 w-10 animate-spin text-[#005b57] mb-4" />
            <p className="text-gray-500 text-sm">Loading the register...</p>
          </div>
        )}

        {/* Cards Grid */}
        {!isLoading && physios.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {physios.map((physio: any) => (
              <PhysioProfileCard key={physio.id} data={physio} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && physios.length === 0 && (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
            <div className="w-16 h-16 mx-auto bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <Search className="h-8 w-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              {debouncedQuery ? 'No physiotherapists found' : 'The register is empty'}
            </h3>
            <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
              {debouncedQuery
                ? `No results for "${debouncedQuery}". Try a different search term.`
                : 'Be the first to join the Physio Register and build your professional profile.'}
            </p>
            {!debouncedQuery && (
              <Link href="/physio-register/register">
                <Button className="bg-[#005b57] hover:bg-[#00443e] text-white rounded-xl h-11 shadow-lg shadow-teal-900/10">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Register as a Physiotherapist
                </Button>
              </Link>
            )}
          </div>
        )}

        {/* Bottom CTA for physios */}
        {!isLoading && physios.length > 0 && (
          <div className="mt-12 text-center bg-gradient-to-r from-teal-50 to-emerald-50 rounded-2xl border border-teal-100 p-8">
            <h3 className="text-xl font-bold text-[#002e2c] mb-2">
              Are you a Physiotherapist?
            </h3>
            <p className="text-gray-600 text-sm mb-5 max-w-lg mx-auto">
              Join RehabifyHealth as an official clinician to access more patients and earning opportunities.
            </p>
            <Link href="/physiotherapist">
              <Button className="bg-[#005b57] hover:bg-[#00443e] text-white rounded-xl h-12 px-8 shadow-lg shadow-teal-900/10">
                <UserPlus className="w-4 h-4 mr-2" />
                Join RehabifyHealth
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
