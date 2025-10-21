'use client';

import React from 'react';
import { PatientProgressDashboard } from '@/components/dashboard/physiotherapist/PatientProgressDashboard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download } from 'lucide-react';
import Link from 'next/link';

export default function PatientProgressPage() {
  const handleExport = () => {
    // TODO: Implement CSV/PDF export
    alert('Export functionality coming soon!');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-4">
            <Button variant="ghost" asChild>
              <Link href="/dashboard/physiotherapist">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <h1 className="text-3xl font-bold">Patient Progress Tracking</h1>
          <p className="text-muted-foreground mt-2">
            Monitor exercise completion, adherence rates, and patient engagement
          </p>
        </div>

        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </Button>
      </div>

      <PatientProgressDashboard />
    </div>
  );
}
