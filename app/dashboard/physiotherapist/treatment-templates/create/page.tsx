'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function CreateTreatmentTemplatePage() {
  const router = useRouter();
  const createTemplate = useMutation(api.treatmentPlans.createTreatmentTemplate);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    duration: '',
    difficulty: 'Beginner',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const createdId = await createTemplate({
        title: formData.title,
        description: formData.description,
        category: formData.category,
        duration: formData.duration,
        difficulty: formData.difficulty,
        exercises: [],
        phases: [],
        goals: [],
      });

      toast.success('Template created! Add exercises in the next step.');

      if (createdId) {
        router.push(`/dashboard/physiotherapist/treatment-templates/${createdId}/edit`);
      } else {
        router.push('/dashboard/physiotherapist/treatment-templates');
      }
    } catch {
      toast.error('Failed to create template');
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard/physiotherapist/treatment-templates"
          className="inline-flex items-center text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Treatment templates
        </Link>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">New template</h1>
      </div>

      {/* Form */}
      <div className="mx-auto max-w-3xl py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-5">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-900 mb-1.5">
                Template Name
              </label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Lower Back Pain Protocol"
                required
                className="text-base"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-900 mb-1.5">
                Description
              </label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief overview of this treatment protocol"
                required
                rows={3}
                className="text-base resize-none"
              />
            </div>
          </div>

          {/* Details Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-5">
            <h2 className="text-sm font-semibold text-gray-900">Details</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-900 mb-1.5">
                  Body Part
                </label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                  required
                >
                  <SelectTrigger id="category" className="text-base">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Spine">Spine</SelectItem>
                    <SelectItem value="Knee">Knee</SelectItem>
                    <SelectItem value="Shoulder">Shoulder</SelectItem>
                    <SelectItem value="Hip">Hip</SelectItem>
                    <SelectItem value="Ankle">Ankle</SelectItem>
                    <SelectItem value="Wrist">Wrist</SelectItem>
                    <SelectItem value="Neck">Neck</SelectItem>
                    <SelectItem value="General">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="difficulty" className="block text-sm font-medium text-gray-900 mb-1.5">
                  Difficulty
                </label>
                <Select
                  value={formData.difficulty}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, difficulty: value }))}
                >
                  <SelectTrigger id="difficulty" className="text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Beginner">Beginner</SelectItem>
                    <SelectItem value="Intermediate">Intermediate</SelectItem>
                    <SelectItem value="Advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label htmlFor="duration" className="block text-sm font-medium text-gray-900 mb-1.5">
                Duration
              </label>
              <Input
                id="duration"
                value={formData.duration}
                onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
                placeholder="e.g., 6-8 weeks"
                required
                className="text-base"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              asChild
              className="w-full sm:w-auto"
            >
              <Link href="/dashboard/physiotherapist/treatment-templates">
                Cancel
              </Link>
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-auto bg-[#005b57] hover:bg-[#00443e]"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Continue to Add Exercises'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
