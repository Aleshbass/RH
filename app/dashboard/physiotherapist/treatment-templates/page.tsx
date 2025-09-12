'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BookOpen, Plus, Copy, Edit } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useUser } from '@clerk/nextjs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Activity } from 'lucide-react';

// @ts-nocheck
export default function TreatmentTemplatesPage() {
  const { isLoaded } = useUser();
  const templates = useQuery(api.treatmentPlans.getTreatmentTemplates);

  const getDifficultyColor = (difficulty: string) => {
    if (difficulty.includes('Beginner')) return 'bg-green-100 text-green-800';
    if (difficulty.includes('Intermediate')) return 'bg-yellow-100 text-yellow-800';
    if (difficulty.includes('Advanced')) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  if (!isLoaded) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-4 w-96 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

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

      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold mb-2">Treatment Templates</h1>
          <p className="text-muted-foreground">
            Pre-built treatment protocols for common conditions. Customize and apply to your patients.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/physiotherapist/treatment-templates/create">
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Link>
        </Button>
      </div>

      {templates === undefined ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Alert>
          <Activity className="h-4 w-4" />
          <AlertDescription>
            No treatment templates found. Create your first template to get started.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template: { _id: string; title: string; category?: string; description: string; phases?: Array<{ exercises?: Array<unknown> }>; duration?: string; difficulty?: string }) => (
            <Card key={template._id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg mb-2">{template.title}</CardTitle>
                    <Badge variant="outline" className="mb-2">
                      {template.category || 'General'}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/dashboard/physiotherapist/treatment-templates/${template._id}/edit`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button size="sm" variant="ghost">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm mb-4">{template.description}</p>
                
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Exercises:</span>
                    <span>{(template.phases?.reduce((acc: number, p: { exercises?: Array<unknown> }) => acc + (p.exercises?.length || 0), 0)) || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Duration:</span>
                    <span>{template.duration || 'Flexible'}</span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span className="font-medium">Difficulty:</span>
                    <Badge className={getDifficultyColor(template.difficulty || 'Beginner')}>
                      {template.difficulty || 'Beginner'}
                    </Badge>
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <Button size="sm" className="flex-1" asChild>
                    <Link href={`/dashboard/physiotherapist/treatment-templates/${template._id}/use`}>
                      Use Template
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/dashboard/physiotherapist/treatment-templates/${template._id}`}>
                      Preview
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8 text-center">
        <Card className="border-dashed">
          <CardContent className="py-8">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Create Custom Template</h3>
            <p className="text-muted-foreground mb-4">
              Build your own treatment protocols based on your clinical experience
            </p>
            <Button asChild>
              <Link href="/dashboard/physiotherapist/treatment-templates/create">
                <Plus className="h-4 w-4 mr-2" />
                Start Building
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
