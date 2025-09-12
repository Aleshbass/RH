'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { InteractiveTreatmentPlan } from '@/components/dashboard/physiotherapist/treatment/InteractiveTreatmentPlan';
// Card components not used in this component
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function TreatmentPlanPage() {
  const params = useParams();
  const patientId = params.patientId as string;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Button variant="ghost" asChild>
          <Link href={`/dashboard/physiotherapist/patients/${patientId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Patient Profile
          </Link>
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Treatment Plan</h1>
        <p className="text-muted-foreground">
          Create and manage interactive treatment plans with exercise integration and progress tracking
        </p>
      </div>

      <InteractiveTreatmentPlan patientId={patientId} />
    </div>
  );
}
