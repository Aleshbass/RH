"use client";

import React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar, Phone } from "@/components/icons";
import { Id } from "@/convex/_generated/dataModel";

type Details = {
  patient?: { firstName?: string; lastName?: string; imageUrl?: string; phoneNumber?: string };
  profile?: { dateOfBirth?: string };
} | null | undefined;

export function PatientProfileMiniCard({ patientId }: { patientId: Id<'users'> }) {
  const details = useQuery(
    api.patients.getPatientDetails,
    patientId ? ({ patientId } as { patientId: Id<'users'> }) : "skip"
  ) as Details;

  if (!patientId) return null;

  return (
    <Card className="border-emerald-100 bg-emerald-50/50">
      <CardContent className="p-3">
        {!details ? (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-100 animate-pulse" />
            <div className="space-y-1">
              <div className="h-3 w-40 bg-emerald-100 rounded animate-pulse" />
              <div className="h-3 w-24 bg-emerald-100 rounded animate-pulse" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 ring-2 ring-white/70">
              <AvatarImage src={details?.patient?.imageUrl || undefined} />
              <AvatarFallback>
                {`${details?.patient?.firstName?.[0] || ""}${details?.patient?.lastName?.[0] || ""}` || "P"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">
                {details?.patient?.firstName} {details?.patient?.lastName}
              </div>
              <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <Phone className="h-3 w-3" /> {details?.patient?.phoneNumber || "No phone"}
              </div>
              {details?.profile?.dateOfBirth && (
                <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> DOB: {details?.profile?.dateOfBirth}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
