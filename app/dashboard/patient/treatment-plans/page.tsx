'use client';

import React from 'react';
import { PatientTreatmentPlanView } from '@/components/dashboard/patient/treatment/PatientTreatmentPlanView';
import { useUser } from '@clerk/nextjs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function PatientTreatmentPlansPage() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <Skeleton className="h-64 w-full rounded-3xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              Please sign in to view your treatment plans.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <PatientTreatmentPlanView />
    </div>
  );
}
