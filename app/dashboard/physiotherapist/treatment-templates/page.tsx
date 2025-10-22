'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BookOpen, Plus, Copy, Edit, Info, HelpCircle, CheckCircle, Users, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useUser } from '@clerk/nextjs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Activity } from 'lucide-react';

// @ts-nocheck
export default function TreatmentTemplatesPage() {
  const { isLoaded } = useUser();
  const templates = useQuery(api.treatmentPlans.getTreatmentTemplates);
  const [showGuide, setShowGuide] = React.useState(false);

  // Show guide on first visit
  React.useEffect(() => {
    const hasSeenGuide = localStorage.getItem('templates-guide-seen');
    if (!hasSeenGuide && templates && templates.length === 0) {
      setShowGuide(true);
    }
  }, [templates]);

  const handleGuideClose = () => {
    localStorage.setItem('templates-guide-seen', 'true');
    setShowGuide(false);
  };

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
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">Treatment Templates</h1>
            <Dialog open={showGuide} onOpenChange={setShowGuide}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-[#005b57] hover:text-[#00443e]">
                  <HelpCircle className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-2xl flex items-center gap-2">
                    <Sparkles className="h-6 w-6 text-[#005b57]" />
                    How Treatment Templates Work
                  </DialogTitle>
                  <DialogDescription className="text-base">
                    Learn how to create, manage, and apply treatment templates to streamline your workflow
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 mt-4">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#005b57] text-white flex items-center justify-center font-bold">
                      1
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">Create Your Template</h3>
                      <p className="text-muted-foreground">
                        Build a reusable treatment protocol with phases, exercises, and instructions. Perfect for common conditions you treat regularly.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#005b57] text-white flex items-center justify-center font-bold">
                      2
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">Preview & Edit</h3>
                      <p className="text-muted-foreground">
                        Click <strong>Preview</strong> to review your template or <strong>Edit</strong> to make changes. Keep templates updated with the latest evidence-based practices.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#005b57] text-white flex items-center justify-center font-bold">
                      3
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">Apply to Patients</h3>
                      <p className="text-muted-foreground">
                        Click <strong>Use Template</strong> to assign it to a patient. You can customize it for their specific needs before assigning.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">Save Time</h3>
                      <p className="text-muted-foreground">
                        Reuse templates across multiple patients, reducing documentation time while maintaining high-quality care.
                      </p>
                    </div>
                  </div>
                </div>
                <Button onClick={handleGuideClose} className="w-full mt-4 bg-[#005b57] hover:bg-[#00443e]">
                  Got It!
                </Button>
              </DialogContent>
            </Dialog>
          </div>
          <p className="text-muted-foreground">
            Pre-built treatment protocols for common conditions. Customize and apply to your patients.
          </p>
        </div>
        <Button asChild className="bg-[#005b57] hover:bg-[#00443e]">
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
        <div className="space-y-6">
          <Alert className="border-[#005b57] bg-[#005b57]/5">
            <Info className="h-5 w-5 text-[#005b57]" />
            <AlertTitle className="text-lg font-semibold mb-2">Welcome to Treatment Templates!</AlertTitle>
            <AlertDescription className="text-base">
              Get started by creating your first template. Here's how it works:
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-2 border-dashed hover:border-[#005b57] transition-colors">
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                  <Plus className="h-6 w-6 text-blue-600" />
                </div>
                <CardTitle className="text-lg">Create Templates</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Build reusable treatment protocols with exercises, phases, and detailed instructions for conditions you treat regularly.
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-dashed hover:border-[#005b57] transition-colors">
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mb-3">
                  <Edit className="h-6 w-6 text-purple-600" />
                </div>
                <CardTitle className="text-lg">Customize & Refine</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Edit templates anytime to incorporate new research, adjust difficulty levels, or add alternative exercises.
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-dashed hover:border-[#005b57] transition-colors">
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle className="text-lg">Assign to Patients</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Apply templates to patients with one click. Personalize them further for each individual's needs.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <TooltipProvider>
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/dashboard/physiotherapist/treatment-templates/${template._id}/edit`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edit this template</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Duplicate template</p>
                      </TooltipContent>
                    </Tooltip>
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" className="flex-1 bg-[#005b57] hover:bg-[#00443e]" asChild>
                        <Link href={`/dashboard/physiotherapist/treatment-templates/${template._id}/use`}>
                          <Users className="h-4 w-4 mr-1" />
                          Assign to Patient
                        </Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Select a patient and assign this template to their treatment plan</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/dashboard/physiotherapist/treatment-templates/${template._id}`}>
                          <BookOpen className="h-4 w-4 mr-1" />
                          Preview
                        </Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>View template details and exercises</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        </TooltipProvider>
      )}

      {templates && templates.length > 0 && (
        <div className="mt-8">
          <Card className="border-2 border-dashed border-[#005b57]/30 bg-gradient-to-br from-[#005b57]/5 to-transparent">
            <CardContent className="py-8">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 rounded-full bg-[#005b57] flex items-center justify-center">
                    <Sparkles className="h-8 w-8 text-white" />
                  </div>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h3 className="text-xl font-semibold mb-2">Create More Templates</h3>
                  <p className="text-muted-foreground">
                    Build custom treatment protocols for different conditions, difficulty levels, or patient populations. The more templates you have, the faster your workflow becomes.
                  </p>
                </div>
                <Button asChild size="lg" className="bg-[#005b57] hover:bg-[#00443e]">
                  <Link href="/dashboard/physiotherapist/treatment-templates/create">
                    <Plus className="h-5 w-5 mr-2" />
                    New Template
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
