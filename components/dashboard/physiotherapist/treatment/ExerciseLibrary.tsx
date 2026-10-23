'use client';

import React, { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Dumbbell, Play } from '@/components/icons';
import { Exercise as AssessmentExercise } from '@/types/assessments';
import { Loader2 } from '@/components/icons';
import { CreateExerciseDialog } from './CreateExerciseDialog';

interface ExerciseLibraryProps {
  onExerciseSelect?: (exercise: AssessmentExercise) => void;
  selectedExercises?: AssessmentExercise[];
}

export function ExerciseLibrary({ onExerciseSelect, selectedExercises = [] }: ExerciseLibraryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [selectedBodyPart, setSelectedBodyPart] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);

  const isStandalone = !onExerciseSelect;

  // Fetch exercises from Convex
  const exercises = useQuery(api.exercises.listExercises, {
    search: searchTerm || undefined,
    difficulty: selectedDifficulty !== 'all' ? selectedDifficulty : undefined,
    bodyPart: selectedBodyPart !== 'all' ? selectedBodyPart : undefined,
  });

  const isSelected = (exerciseId: string) => {
    return selectedExercises.some(ex => ex._id === exerciseId);
  };

  const handleExerciseSelect = (convexExercise: any) => {
    if (onExerciseSelect) {
      // Map Convex exercise to AssessmentExercise type
      const exercise: AssessmentExercise = {
        _id: convexExercise._id,
        name: convexExercise.name,
        description: convexExercise.description,
        instructions: convexExercise.instructions,
        targetMuscles: convexExercise.targetMuscles,
        difficulty: convexExercise.difficultyLevel,
        equipment: convexExercise.equipmentNeeded,
        sets: convexExercise.defaultSets,
        reps: convexExercise.defaultReps,
        frequency: convexExercise.defaultFrequency,
        precautions: convexExercise.precautions || [],
        videoUrl: convexExercise.videoUrl,
        imageUrl: convexExercise.imageUrl,
        exerciseDbId: undefined, // No longer using ExerciseDB ID
      };
      onExerciseSelect(exercise);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-none bg-transparent">
        <CardHeader className="px-0 pt-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-bold">Exercise Library</CardTitle>
              <CardDescription>
                Browse and select exercises from the platform library
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <CreateExerciseDialog onSuccess={() => setRefreshKey(k => k + 1)} />
              {isStandalone && (
                <div className="text-sm text-muted-foreground bg-[#005b57]/5 text-[#005b57] px-3 py-1 rounded-full">
                  Browse Mode
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6 bg-white p-4 rounded-xl border shadow-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search exercises..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedBodyPart} onValueChange={setSelectedBodyPart}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Body Part" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Body Parts</SelectItem>
                <SelectItem value="Legs">Legs</SelectItem>
                <SelectItem value="Arms">Arms</SelectItem>
                <SelectItem value="Back">Back</SelectItem>
                <SelectItem value="Core">Core</SelectItem>
                <SelectItem value="Shoulders">Shoulders</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Grid */}
          {exercises === undefined ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
          ) : exercises.length === 0 ? (
            <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-300">
              <div className="w-16 h-16 mx-auto bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                <Dumbbell className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">No exercises found</h3>
              <p className="text-muted-foreground mt-1">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {exercises.map((exercise: any) => (
                <Card
                  key={exercise._id}
                  className={`group overflow-hidden hover:shadow-lg transition-all duration-200 border-gray-200 ${isSelected(exercise._id) ? 'ring-2 ring-green-500 border-green-500' : ''
                    }`}
                >
                  <div className="relative aspect-video bg-gray-100 overflow-hidden">
                    {exercise.imageUrl ? (
                      <img
                        src={exercise.imageUrl}
                        alt={exercise.name}
                        className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-50">
                        <Dumbbell className="w-10 h-10 text-gray-300" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <Badge className={`
                        ${exercise.difficultyLevel === 'beginner' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}
                        ${exercise.difficultyLevel === 'intermediate' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100' : ''}
                        ${exercise.difficultyLevel === 'advanced' ? 'bg-red-100 text-red-700 hover:bg-red-100' : ''}
                      `}>
                        {exercise.difficultyLevel}
                      </Badge>
                    </div>
                    {exercise.videoUrl && (
                      <div className="absolute bottom-2 right-2 bg-black/50 p-1.5 rounded-full">
                        <Play className="w-3 h-3 text-white" fill="currentColor" />
                      </div>
                    )}
                  </div>

                  <CardContent className="p-4">
                    <div className="mb-3">
                      <h3 className="font-semibold text-gray-900 line-clamp-1 text-lg">{exercise.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1 h-10">
                        {exercise.description}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1 mb-4">
                      {exercise.targetMuscles.slice(0, 3).map((muscle: any) => (
                        <span key={muscle} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full capitalize">
                          {muscle}
                        </span>
                      ))}
                      {exercise.targetMuscles.length > 3 && (
                        <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                          +{exercise.targetMuscles.length - 3}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <div className="text-xs text-gray-500">
                        {exercise.defaultSets} sets × {exercise.defaultReps} reps
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleExerciseSelect(exercise)}
                        disabled={isStandalone || isSelected(exercise._id)}
                        className={isSelected(exercise._id) ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-green-600 hover:bg-green-700'}
                      >
                        {isSelected(exercise._id) ? (
                          <>Added</>
                        ) : (
                          <>
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
