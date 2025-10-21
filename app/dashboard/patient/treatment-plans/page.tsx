'use client';

import React from 'react';
import { PatientTreatmentPlanView } from '@/components/dashboard/patient/treatment/PatientTreatmentPlanView';
import { useUser } from '@clerk/nextjs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Activity } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

// Treatment plan interface
interface TreatmentPlan {
  _id: Id<'treatmentPlans'>;
  title: string;
  description: string;
  hasUnreadChanges?: boolean;
  unreadChanges?: number;
}

function TreatmentPlansList() {
  // @ts-nocheck
  const treatmentPlans = useQuery(api.treatmentPlanSync.getPatientTreatmentPlanUpdates);

  if (!treatmentPlans) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (treatmentPlans.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">No treatment plans assigned yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {treatmentPlans.map((plan: TreatmentPlan) => (
        <Card key={plan._id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{plan.title}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </div>
              {plan.hasUnreadChanges && (
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500" />
                  <span className="text-sm text-blue-600">{plan.unreadChanges} new updates</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <PatientTreatmentPlanView />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function PatientTreatmentPlansPage() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Treatment Plan</h1>
          <p className="text-muted-foreground">
            Follow your prescribed exercises and track your recovery progress
          </p>
        </div>
      </div>

      <Alert>
        <Activity className="h-4 w-4" />
        <AlertDescription>
          Complete your daily exercises and log your progress to help your physiotherapist track your recovery.
        </AlertDescription>
      </Alert>

      {/* Get user's treatment plans and display them */}
      <TreatmentPlansList />
    </div>
  );
}
