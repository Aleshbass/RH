"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, ShieldCheck, Activity, ArrowRight, Building2, Stethoscope } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function TrackLookupPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = query.trim();
    if (!term) {
      setError("Please enter a tracking code or partner reference ID.");
      return;
    }
    setError("");
    router.push(`/track/${encodeURIComponent(term)}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-xl space-y-8">
        {/* Brand & Heading */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-xs font-semibold">
            <Activity className="w-3.5 h-3.5 text-teal-600" />
            Rehabify Health Care Tracker
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Track Patient Care Journey
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Check real-time clinical milestones, assigned MRTBN physiotherapists, and session progress.
          </p>
        </div>

        {/* Search Card */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-md bg-white dark:bg-slate-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Enter Reference or Tracking ID</CardTitle>
            <CardDescription className="text-xs">
              Supports both <strong>Rehabify Tracking Codes</strong> (e.g. <code>RHB-72941</code>) and{" "}
              <strong>Partner Generated IDs</strong> (e.g. <code>HMO-REF-0091</code>).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <Input
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder="e.g. RHB-49210 or HMO-REF-9921"
                    className="pl-9 h-11 text-sm bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  />
                </div>
                <Button type="submit" className="h-11 px-5 bg-teal-600 hover:bg-teal-700 text-white font-medium">
                  Track
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>

              {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}

              {/* Sample Quick Links */}
              <div className="pt-2 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                <span>Looking for partner documentation?</span>
                <Link href="/docs" className="text-teal-600 font-semibold hover:underline">
                  Visit Developer Docs
                </Link>
                <span>•</span>
                <Link href="/partnerships" className="text-teal-600 font-semibold hover:underline">
                  Partnership Hub
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Feature Badges */}
        <div className="grid grid-cols-3 gap-3 text-center text-xs text-slate-500 dark:text-slate-400">
          <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <ShieldCheck className="w-5 h-5 text-teal-600 mx-auto mb-1" />
            <span className="font-semibold text-slate-700 dark:text-slate-300 block">MRTBN Verified</span>
            Licensed Physiotherapists
          </div>
          <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <Activity className="w-5 h-5 text-teal-600 mx-auto mb-1" />
            <span className="font-semibold text-slate-700 dark:text-slate-300 block">Live Progress</span>
            Real-time session updates
          </div>
          <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <Building2 className="w-5 h-5 text-teal-600 mx-auto mb-1" />
            <span className="font-semibold text-slate-700 dark:text-slate-300 block">Enterprise Ready</span>
            Closed-loop reporting
          </div>
        </div>
      </div>
    </div>
  );
}
