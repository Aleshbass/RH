'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Play,
  ArrowLeft,
  BookOpen,
  TrendingUp
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/ui/use-toast';
import LoadingSpinner from '@/components/ui/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function MyExerciseLibraryPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<string>('');
  const [bodyPart, setBodyPart] = useState<string>('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // @ts-ignore
  const myTemplates = useQuery(api.exerciseTemplates.getMyExerciseTemplates, {
    search: search || undefined,
    difficulty: difficulty || undefined,
    bodyPart: bodyPart || undefined,
  });

  // @ts-ignore
  const publicTemplates = useQuery(api.exerciseTemplates.getPublicExerciseTemplates, {
    search: search || undefined,
    difficulty: difficulty || undefined,
    bodyPart: bodyPart || undefined,
  });

  const deleteTemplate = useMutation(api.exerciseTemplates.deleteExerciseTemplate);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTemplate({ templateId: deleteId as any });
      toast({
        title: 'Template Deleted',
        description: 'Exercise template has been removed from your library',
      });
      setDeleteId(null);
    } catch (e) {
      toast({
        title: 'Error',
        description: 'Failed to delete template',
        variant: 'destructive',
      });
    }
  };

  const getDifficultyColor = (level: string) => {
    switch (level) {
      case 'beginner':
        return 'bg-green-100 text-green-800';
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-800';
      case 'advanced':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!myTemplates || !publicTemplates) {
    return <LoadingSpinner message="Loading exercise library..." />;
  }

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
          <h1 className="text-3xl font-bold">My Exercise Library</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage reusable exercise templates
          </p>
        </div>

        <Button asChild>
          <Link href="/dashboard/physiotherapist/my-exercise-library/create">
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search exercises..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger>
                <SelectValue placeholder="All Difficulties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Difficulties</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>

            <Select value={bodyPart} onValueChange={setBodyPart}>
              <SelectTrigger>
                <SelectValue placeholder="All Body Parts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Body Parts</SelectItem>
                <SelectItem value="back">Back</SelectItem>
                <SelectItem value="neck">Neck</SelectItem>
                <SelectItem value="shoulder">Shoulder</SelectItem>
                <SelectItem value="knee">Knee</SelectItem>
                <SelectItem value="ankle">Ankle</SelectItem>
                <SelectItem value="hip">Hip</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* My Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            My Templates ({myTemplates.length})
          </CardTitle>
          <CardDescription>
            Exercise templates you've created
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myTemplates.map((template: any) => (
              <Card key={template._id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <h4 className="font-semibold">{template.name}</h4>
                      <Badge className={getDifficultyColor(template.difficultyLevel)}>
                        {template.difficultyLevel}
                      </Badge>
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {template.description}
                    </p>

                    <div className="flex flex-wrap gap-1">
                      {template.bodyParts.slice(0, 3).map((part: string) => (
                        <Badge key={part} variant="outline" className="text-xs">
                          {part}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                      <span>Used {template.timesAssigned || 0} times</span>
                    </div>

                    <div className="text-sm">
                      <div className="font-medium">
                        {template.defaultSets} sets × {template.defaultReps} reps
                      </div>
                      <div className="text-muted-foreground">{template.defaultFrequency}</div>
                    </div>

                    <div className="flex gap-2">
                      {template.videoUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(template.videoUrl, '_blank')}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Video
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <Link href={`/dashboard/physiotherapist/my-exercise-library/${template._id}/edit`}>
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteId(template._id)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {myTemplates.length === 0 && (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No templates created yet</p>
                <Button asChild className="mt-4">
                  <Link href="/dashboard/physiotherapist/my-exercise-library/create">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Template
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Public/Shared Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Shared Library ({publicTemplates.length})
          </CardTitle>
          <CardDescription>
            Validated exercises shared by the community
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {publicTemplates.slice(0, 6).map((template: any) => (
              <Card key={template._id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <h4 className="font-semibold">{template.name}</h4>
                      <Badge className={getDifficultyColor(template.difficultyLevel)}>
                        {template.difficultyLevel}
                      </Badge>
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {template.description}
                    </p>

                    <div className="flex flex-wrap gap-1">
                      {template.bodyParts.slice(0, 3).map((part: string) => (
                        <Badge key={part} variant="outline" className="text-xs">
                          {part}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                      <span>Used {template.timesAssigned || 0} times</span>
                    </div>

                    <div className="text-sm">
                      <div className="font-medium">
                        {template.defaultSets} sets × {template.defaultReps} reps
                      </div>
                      <div className="text-muted-foreground">{template.defaultFrequency}</div>
                    </div>

                    {template.videoUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => window.open(template.videoUrl, '_blank')}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Watch Demo
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {publicTemplates.length === 0 && (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No public templates available yet</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Exercise Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the exercise template
              from your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
