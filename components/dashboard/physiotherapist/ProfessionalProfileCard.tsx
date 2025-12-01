"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useMutationUntyped } from "@/lib/convexUntyped";
import { Loader2, ShieldCheck } from "lucide-react";
import { ProfilePhotoUploader } from "@/components/dashboard/shared/ProfilePhotoUploader";
import LocationSearch from "@/components/marketplace/LocationSearch";

export type ProfessionalProfileValues = {
  licenseNumber?: string;
  certificationBoard?: string;
  certificationYear?: number | string;
  bio?: string;
  location?: string;
};

type ProfessionalProfileCardProps = {
  initialValues?: ProfessionalProfileValues | null;
  currentImageUrl?: string | null;
};

export function ProfessionalProfileCard({ initialValues, currentImageUrl }: ProfessionalProfileCardProps) {
  const [licenseNumber, setLicenseNumber] = useState(initialValues?.licenseNumber || "");
  const [certBoard, setCertBoard] = useState(initialValues?.certificationBoard || "");
  const [certYear, setCertYear] = useState(
    initialValues?.certificationYear ? String(initialValues.certificationYear) : ""
  );
  const [bio, setBio] = useState(initialValues?.bio || "");
  const [location, setLocation] = useState(initialValues?.location || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initialValues) return;
    setLicenseNumber(initialValues.licenseNumber || "");
    setCertBoard(initialValues.certificationBoard || "");
    setCertYear(initialValues.certificationYear ? String(initialValues.certificationYear) : "");
    setBio(initialValues.bio || "");
    setLocation(initialValues.location || "");
  }, [initialValues]);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const apiRoot = api as unknown as Record<string, unknown>
  const physioModule = apiRoot["physiotherapists"] as Record<string, unknown>
  const upsert = useMutationUntyped(physioModule["upsertPhysiotherapistProfessionalDetails"]) as (
    args: {
      licenseNumber?: string;
      certificationBoard?: string;
      certificationYear?: number;
      bio?: string;
      location?: string;
    }
  ) => Promise<string>;

  const onSave = async () => {
    // Basic validation
    if (certYear) {
      const yearNum = Number(certYear);
      if (Number.isNaN(yearNum) || yearNum < 1950 || yearNum > currentYear) {
        toast.error(`Please enter a valid year between 1950 and ${currentYear}.`);
        return;
      }
    }

    try {
      setSaving(true);
      await upsert({
        licenseNumber: licenseNumber || undefined,
        certificationBoard: certBoard || undefined,
        certificationYear: certYear ? Number(certYear) : undefined,
        bio: bio || undefined,
        location: location || undefined,
      });
      toast.success("Professional profile saved");
    } catch (e) {
      const err = e as Error;
      toast.error(err.message || "Failed to save professional profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto border-emerald-100 rounded-xl shadow-sm bg-gradient-to-br from-emerald-50 to-white">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-emerald-900 flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-emerald-700" />
              Professional Profile
            </CardTitle>
            <CardDescription className="text-emerald-700">
              These details are visible to patients and help establish trust.
            </CardDescription>
          </div>
          <Button onClick={onSave} disabled={saving} size="sm" className="shadow-sm">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <ProfilePhotoUploader
              currentImageUrl={currentImageUrl || undefined}
              title="Profile Photo"
              description="Upload a clear headshot."
              size="md"
            />
          </div>
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <Label htmlFor="licenseNumber">License Number</Label>
              <Input
                id="licenseNumber"
                placeholder="e.g., PT-12345678"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="certBoard">Certification Board</Label>
              <Input
                id="certBoard"
                placeholder="e.g., National PT Board"
                value={certBoard}
                onChange={(e) => setCertBoard(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="certYear">Certification Year</Label>
              <Input
                id="certYear"
                inputMode="numeric"
                placeholder="e.g., 2020"
                value={certYear}
                onChange={(e) => setCertYear(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Practice Location</Label>
              <LocationSearch
                value={location}
                onChange={setLocation}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bio">Professional Bio</Label>
              <Textarea
                id="bio"
                placeholder="Share a short, friendly introduction and your expertise…"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="min-h-[84px]"
              />
              <p className="text-xs text-emerald-700">Tip: Keep it concise and patient-friendly.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
