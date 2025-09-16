"use client";

import React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Stethoscope } from "lucide-react";

export function MyPhysiotherapistCard() {
  const careTeam = useQuery(api.patients.getPatientCareTeam) as Array<{
    physiotherapist?: { firstName?: string; lastName?: string; email?: string; imageUrl?: string } | null;
    profile?: { licenseNumber?: string; certificationBoard?: string; certificationYear?: number; specializations?: string[]; bio?: string } | null;
    clinic?: { name?: string } | null;
    relationship?: { isPrimary?: boolean } | null;
  }> | undefined;

  if (!careTeam || careTeam.length === 0) return null;

  // Show primary or first physiotherapist
  const primary = careTeam.find((m) => m?.relationship?.isPrimary) || careTeam[0];
  const therapist = primary?.physiotherapist || {};
  const profile = primary?.profile || undefined;
  const clinic = primary?.clinic || undefined;

  return (
    <Card className="border-emerald-100 bg-gradient-to-br from-emerald-50 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-emerald-900">
          <Stethoscope className="h-5 w-5 text-emerald-700" />
          Your Physiotherapist
        </CardTitle>
        <CardDescription className="text-emerald-700">
          Professional details visible to you for transparency and trust.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Avatar className="h-14 w-14 ring-2 ring-white/70 shadow-sm">
            <AvatarImage src={therapist?.imageUrl || undefined} />
            <AvatarFallback>
              {`${therapist?.firstName?.[0] || ""}${therapist?.lastName?.[0] || ""}` || "PT"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-foreground truncate">
              {therapist?.firstName} {therapist?.lastName}
            </div>
            {clinic?.name && (
              <div className="text-sm text-muted-foreground truncate">{clinic.name}</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 text-sm">
              {profile?.licenseNumber && (
                <div>
                  <div className="text-muted-foreground">License</div>
                  <div className="font-medium">{profile.licenseNumber}</div>
                </div>
              )}
              {(profile?.certificationBoard || profile?.certificationYear) && (
                <div>
                  <div className="text-muted-foreground">Certification</div>
                  <div className="font-medium">
                    {profile?.certificationBoard}
                    {profile?.certificationBoard && profile?.certificationYear ? ", " : ""}
                    {profile?.certificationYear || ""}
                  </div>
                </div>
              )}
              {Array.isArray(profile?.specializations) && profile.specializations.length > 0 && (
                <div>
                  <div className="text-muted-foreground">Specializations</div>
                  <div className="font-medium truncate">{profile.specializations.slice(0,3).join(", ")}</div>
                </div>
              )}
            </div>
            {profile?.bio && (
              <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{profile.bio}</p>
            )}
          </div>
          <div className="sm:self-start">
            <Button variant="outline" size="sm" onClick={() => window.location.assign("/dashboard/patient/appointments")}>Contact</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
