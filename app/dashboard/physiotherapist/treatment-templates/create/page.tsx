'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// Badge component not used in this component
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import TemplateBuilder, { TemplatePhase } from '@/components/dashboard/physiotherapist/treatment/TemplateBuilder';

export default function CreateTreatmentTemplatePage() {
  const router = useRouter();
  const createTemplate = useMutation(api.treatmentPlans.createTreatmentTemplate);
  const [builderPhases, setBuilderPhases] = useState<TemplatePhase[]>([]);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    duration: '',
    difficulty: 'Beginner',
    exercises: [],
    phases: [''],
    goals: ['']
  });

  const [newPhase, setNewPhase] = useState('');
  const [newGoal, setNewGoal] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const createdId = await createTemplate({
        title: formData.title,
        description: formData.description,
        category: formData.category,
        duration: formData.duration,
        difficulty: formData.difficulty,
        exercises: formData.exercises,
        phases: formData.phases.filter(p => p.trim() !== ''),
        goals: formData.goals.filter(g => g.trim() !== ''),
        builderPhases: (builderPhases && builderPhases.length > 0) ? builderPhases : undefined,
      });
      
      toast.success('Treatment template created successfully');
      // Continue directly to the builder on the edit page
      if (createdId) {
        router.push(`/dashboard/physiotherapist/treatment-templates/${createdId}/edit`);
      } else {
        router.push('/dashboard/physiotherapist/treatment-templates');
      }
    } catch {
      toast.error('Failed to create template');
    }
  };

  // Removed unused addExercise function

  const addPhase = () => {
    if (newPhase.trim()) {
      setFormData(prev => ({
        ...prev,
        phases: [...prev.phases, newPhase.trim()]
      }));
      setNewPhase('');
    }
  };

  const addGoal = () => {
    if (newGoal.trim()) {
      setFormData(prev => ({
        ...prev,
        goals: [...prev.goals, newGoal.trim()]
      }));
      setNewGoal('');
    }
  };

  const removeItem = (type: 'exercises' | 'phases' | 'goals', index: number) => {
    setFormData(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <Button variant="ghost" asChild>
          <Link href="/dashboard/physiotherapist/treatment-templates">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Templates
          </Link>
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Create Treatment Template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Template Title</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Lower Back Pain Protocol"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the treatment protocol and its purpose"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
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

              <div className="space-y-2">
                <label className="text-sm font-medium">Duration</label>
                <Input
                  value={formData.duration}
                  onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
                  placeholder="e.g., 6-8 weeks"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Difficulty</label>
                <Select
                  value={formData.difficulty}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, difficulty: value }))}
                >
                  <SelectTrigger>
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

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Treatment Phases</label>
                <div className="space-y-2">
                  {formData.phases.map((phase, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={phase}
                        onChange={(e) => {
                          const newPhases = [...formData.phases];
                          newPhases[index] = e.target.value;
                          setFormData(prev => ({ ...prev, phases: newPhases }));
                        }}
                        placeholder={`Phase ${index + 1}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem('phases', index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      value={newPhase}
                      onChange={(e) => setNewPhase(e.target.value)}
                      placeholder="Add new phase"
                    />
                    <Button type="button" variant="outline" onClick={addPhase}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Treatment Goals</label>
                <div className="space-y-2">
                  {formData.goals.map((goal, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={goal}
                        onChange={(e) => {
                          const newGoals = [...formData.goals];
                          newGoals[index] = e.target.value;
                          setFormData(prev => ({ ...prev, goals: newGoals }));
                        }}
                        placeholder={`Goal ${index + 1}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem('goals', index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      value={newGoal}
                      onChange={(e) => setNewGoal(e.target.value)}
                      placeholder="Add new goal"
                    />
                    <Button type="button" variant="outline" onClick={addGoal}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="submit" className="flex-1">
                Create Template
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/physiotherapist/treatment-templates">
                  Cancel
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Phases & Exercises Builder (Create Mode) */}
      <div className="mt-6">
        <TemplateBuilder mode="create" onPhasesChange={(phases) => setBuilderPhases(phases)} />
      </div>
    </div>
  );
}
