"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Plus, Eye, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ExerciseLibraryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  
  const rawExercises = useQuery(api.exercises.listExercises, {});

  const knownCategories = ['stretching', 'strength', 'mobility', 'balance', 'cardio', 'rehabilitation'];

  const difficulties = ['all', 'beginner', 'intermediate', 'advanced'];

  type ExerciseListItem = {
    _id: string;
    name: string;
    description: string;
    category: string;
    difficulty: string;
    duration?: string;
    sets?: number;
    reps?: number;
  };

  // The exercises table has no `category` field: use a matching tag if there is one,
  // otherwise the first body part. Duration is stored in seconds.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exercises: ExerciseListItem[] | undefined = rawExercises?.map((ex: any) => {
    const tags: string[] = ex.tags || [];
    const bodyParts: string[] = ex.bodyParts || [];
    const seconds: number | undefined = ex.defaultDuration;
    return {
      _id: ex._id,
      name: ex.name || '',
      description: ex.description || '',
      category: tags.find((t) => knownCategories.includes(t)) || bodyParts[0] || 'general',
      difficulty: ex.difficultyLevel || 'beginner',
      duration: seconds
        ? seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} sec`
        : undefined,
      sets: ex.defaultSets,
      reps: ex.defaultReps,
    };
  });

  const categories = ['all', ...Array.from(new Set((exercises || []).map((ex) => ex.category))).sort()];

  const filteredExercises = exercises?.filter((exercise: ExerciseListItem) => {
    const matchesSearch = exercise.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exercise.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || exercise.category === selectedCategory;
    const matchesDifficulty = selectedDifficulty === 'all' || exercise.difficulty === selectedDifficulty;
    
    return matchesSearch && matchesCategory && matchesDifficulty;
  }) || [];

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-green-100 text-green-800';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'advanced': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'stretching': return 'bg-blue-100 text-blue-800';
      case 'strength': return 'bg-purple-100 text-purple-800';
      case 'mobility': return 'bg-orange-100 text-orange-800';
      case 'balance': return 'bg-pink-100 text-pink-800';
      case 'cardio': return 'bg-green-100 text-green-800';
      case 'rehabilitation': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (exercises === undefined) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Exercise Library</h1>
          <p className="text-muted-foreground">
            Browse and manage exercises for your treatment plans
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/physiotherapist/exercises/create">
            <Plus className="h-4 w-4 mr-2" />
            Add Exercise
          </Link>
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search exercises..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map(category => (
                <SelectItem key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {difficulties.map(difficulty => (
                <SelectItem key={difficulty} value={difficulty}>
                  {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {exercises.length === 0 ? (
        <Alert>
          <AlertDescription>
            No exercises found. Add your first exercise to get started.
          </AlertDescription>
        </Alert>
      ) : filteredExercises.length === 0 ? (
        <Alert>
          <AlertDescription>
            No exercises match your search criteria. Try adjusting your filters.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredExercises.map((exercise: ExerciseListItem) => (
            <Card key={exercise._id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{exercise.name}</CardTitle>
                    <div className="flex gap-2 mt-2">
                      <Badge className={getCategoryColor(exercise.category)}>
                        {exercise.category}
                      </Badge>
                      <Badge className={getDifficultyColor(exercise.difficulty)}>
                        {exercise.difficulty}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm mb-4">
                  {exercise.description}
                </p>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">Duration:</span>
                    <span>{exercise.duration || 'Flexible'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Sets:</span>
                    <span>{exercise.sets || 'As prescribed'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Reps:</span>
                    <span>{exercise.reps || 'As prescribed'}</span>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button size="sm" className="flex-1" asChild>
                    <Link href={`/dashboard/physiotherapist/exercises/${exercise._id}`}>
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/dashboard/physiotherapist/treatment-plans/create?exercise=${exercise._id}`}>
                      <PlusCircle className="h-4 w-4 mr-1" />
                      Add to Plan
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
