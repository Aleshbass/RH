'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BookOpen, Plus, Users, Activity } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useUser } from '@clerk/nextjs';
import { Skeleton } from '@/components/ui/skeleton';

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
      <div className="container mx-auto p-4 sm:p-6">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-4 w-96 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      {/* Back Button */}
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/physiotherapist">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Treatment Templates</h1>
          <p className="text-sm sm:text-base text-gray-600">
            Create and manage reusable treatment plans
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto bg-[#005b57] hover:bg-[#00443e]">
          <Link href="/dashboard/physiotherapist/treatment-templates/create">
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Link>
        </Button>
      </div>

      {/* Content */}
      {templates === undefined ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 sm:py-20">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#005b57]/10 flex items-center justify-center mb-4">
            <Activity className="h-8 w-8 text-[#005b57]" />
          </div>
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No templates yet</h3>
          <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto mb-6">
            Create your first treatment template to get started
          </p>
          <Button asChild size="lg" className="bg-[#005b57] hover:bg-[#00443e]">
            <Link href="/dashboard/physiotherapist/treatment-templates/create">
              <Plus className="h-5 w-5 mr-2" />
              Create Template
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template: { _id: string; title: string; category?: string; description: string; phases?: Array<{ exercises?: Array<unknown> }>; duration?: string; difficulty?: string }) => (
            <Card key={template._id} className="hover:shadow-md transition-shadow border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <CardTitle className="text-base sm:text-lg mb-2 line-clamp-1">{template.title}</CardTitle>
                    {template.category && (
                      <Badge variant="outline" className="text-xs">
                        {template.category}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs sm:text-sm text-gray-600 line-clamp-2">{template.description}</p>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs sm:text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{(template.phases?.reduce((acc: number, p: { exercises?: Array<unknown> }) => acc + (p.exercises?.length || 0), 0)) || 0}</span>
                    <span>exercises</span>
                  </div>
                  <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
                  <div>{template.duration || 'Flexible'}</div>
                  <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
                  <Badge className={`text-xs ${getDifficultyColor(template.difficulty || 'Beginner')}`}>
                    {template.difficulty || 'Beginner'}
                  </Badge>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" className="flex-1 bg-[#005b57] hover:bg-[#00443e]" asChild>
                    <Link href={`/dashboard/physiotherapist/treatment-templates/${template._id}/use`}>
                      <Users className="h-3.5 w-3.5 mr-1.5" />
                      Assign
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" asChild>
                    <Link href={`/dashboard/physiotherapist/treatment-templates/${template._id}`}>
                      <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                      Preview
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
