'use client';

import React from 'react';
import { ExerciseLibrary } from '@/components/dashboard/physiotherapist/treatment/ExerciseLibrary';
// Card components not used in this component
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ExerciseLibraryPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Button variant="ghost" asChild>
          <Link href="/dashboard/physiotherapist">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Exercise Library</h1>
        <p className="text-muted-foreground">
          Browse exercises from ExerciseDB integration. Select exercises to create treatment plans for your patients.
        </p>
      </div>

      <ExerciseLibrary />
    </div>
  );
}
