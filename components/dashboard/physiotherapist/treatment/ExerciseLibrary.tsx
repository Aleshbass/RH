'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Play, Plus } from 'lucide-react';
import { Exercise as AssessmentExercise } from '@/types/assessments';
import { exerciseService, Exercise as ExerciseDBExercise } from '@/lib/exercisedb/exerciseService';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

interface ExerciseLibraryProps {
  onExerciseSelect?: (exercise: AssessmentExercise) => void;
  selectedExercises?: AssessmentExercise[];
}

// Removed unused extractYouTubeId helper

export function ExerciseLibrary({ onExerciseSelect, selectedExercises = [] }: ExerciseLibraryProps) {
  const [exercises, setExercises] = useState<AssessmentExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [selectedMuscle, setSelectedMuscle] = useState('all');
  const [source, setSource] = useState<'platform' | 'exercisedb'>('platform');

  // Platform exercises via Convex (public + clinic scope when available)
  const platformResults = useQuery(api.exercises.searchExercises, {
    searchTerm: searchTerm || undefined,
    includePublic: true,
    limit: 50,
  });

  const categories = ['all', 'strength', 'stretching', 'cardio', 'balance'];
  const difficulties = ['all', 'beginner', 'intermediate', 'advanced'];
  const muscleGroups = [
    'all', 'abdominals', 'biceps', 'calves', 'chest', 'forearms', 
    'glutes', 'hamstrings', 'lats', 'lower_back', 'middle_back', 
    'neck', 'quadriceps', 'shoulders', 'traps', 'triceps'
  ];

  // Map incoming difficulty to our allowed union
  const sanitizeDifficulty = (v?: string): 'beginner' | 'intermediate' | 'advanced' => {
    const low = (v || '').toLowerCase()
    return (low === 'beginner' || low === 'intermediate' || low === 'advanced') ? low : 'intermediate'
  }

  // Transform ExerciseDB exercise to our Assessment Exercise type
  const transformToExercise = (dbExercise: ExerciseDBExercise): AssessmentExercise => ({
    _id: dbExercise.id,
    name: dbExercise.name,
    description: dbExercise.overview || `${dbExercise.bodyParts.join(', ')} exercise using ${dbExercise.equipments.join(', ')}`,
    instructions: dbExercise.instructions,
    targetMuscles: dbExercise.targetMuscles,
    difficulty: 'intermediate' as const, // ExerciseDB doesn't provide difficulty, defaulting
    equipment: dbExercise.equipments,
    sets: 3,
    reps: 12,
    frequency: '3x per week',
    precautions: ['Maintain proper form', 'Stop if you feel pain'],
    exerciseDbId: dbExercise.id,
    videoUrl: dbExercise.videoUrl,
    imageUrl: dbExercise.imageUrl
  });

  useEffect(() => {
    if (source === 'exercisedb') {
      fetchFromExerciseDB();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Merge and filter depending on source
  const platformTransformed: AssessmentExercise[] = (
    (platformResults || []) as Array<{
      _id: string;
      name: string;
      description?: string;
      instructions?: string[];
      targetMuscles?: string[];
      difficultyLevel?: string;
      equipmentNeeded?: string[];
      defaultSets?: number;
      defaultReps?: number;
      defaultFrequency?: string;
      precautions?: string[];
      videoUrl?: string;
      imageUrl?: string;
    }>
  ).map((ex) => ({
    _id: ex._id,
    name: ex.name,
    description: ex.description || '',
    instructions: ex.instructions || [],
    targetMuscles: ex.targetMuscles || [],
    difficulty: sanitizeDifficulty(ex.difficultyLevel),
    equipment: ex.equipmentNeeded || [],
    sets: ex.defaultSets || 3,
    reps: ex.defaultReps || 10,
    frequency: ex.defaultFrequency || 'Daily',
    precautions: ex.precautions || [],
    exerciseDbId: ex._id,
    videoUrl: ex.videoUrl,
    imageUrl: ex.imageUrl,
  }));

  const currentList = source === 'platform' ? platformTransformed : exercises;

  const filteredExercises = currentList.filter(exercise => {
    const matchesSearch = exercise.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exercise.targetMuscles.some(muscle => muscle.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || exercise.instructions.some(inst => inst.toLowerCase().includes(selectedCategory));
    const matchesDifficulty = selectedDifficulty === 'all' || exercise.difficulty === selectedDifficulty;
    const matchesMuscle = selectedMuscle === 'all' || exercise.targetMuscles.includes(selectedMuscle);
    
    return matchesSearch && matchesCategory && matchesDifficulty && matchesMuscle;
  });

  const isSelected = (exerciseId: string) => {
    return selectedExercises.some(ex => ex._id === exerciseId);
  };

  const handleExerciseSelect = (exercise: AssessmentExercise) => {
    if (onExerciseSelect) {
      onExerciseSelect(exercise);
    }
  };

  const fetchFromExerciseDB = async () => {
    setLoading(true);
    try {
      const dbExercises = await exerciseService.getExercises({ limit: 50 });
      console.log('Fetched exercises:', dbExercises); // Debug log
      const transformedExercises = dbExercises.map(transformToExercise);
      setExercises(transformedExercises);
    } catch (error) {
      console.error('Error fetching exercises:', error);
      // Fallback to basic exercises if API fails
      setExercises([
        {
          _id: 'fallback_001',
          name: 'Bird Dog',
          description: 'Core stability exercise for lower back pain',
          instructions: [
            'Start on hands and knees in a tabletop position',
            'Extend your right arm forward and left leg back simultaneously',
            'Hold for 5 seconds while maintaining balance',
            'Return to starting position and repeat with opposite arm and leg'
          ],
          targetMuscles: ['spine', 'abs', 'glutes'],
          difficulty: 'beginner' as const,
          equipment: ['body weight'],
          sets: 3,
          reps: 10,
          frequency: 'Daily',
          precautions: ['Avoid arching lower back', 'Keep neck neutral'],
          exerciseDbId: 'fallback_001',
          videoUrl: 'https://v2.exercisedb.dev/video/0001',
          imageUrl: 'https://v2.exercisedb.dev/image/0001'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Exercise Library</CardTitle>
          <CardDescription>
            Browse and select exercises from Platform or ExerciseDB, or add a custom link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <Select value={source} onValueChange={(v: 'platform' | 'exercisedb') => setSource(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="platform">Platform</SelectItem>
                <SelectItem value="exercisedb">ExerciseDB</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search exercises..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
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
              <SelectTrigger>
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                {difficulties.map(difficulty => (
                  <SelectItem key={difficulty} value={difficulty}>
                    {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedMuscle} onValueChange={setSelectedMuscle}>
              <SelectTrigger>
                <SelectValue placeholder="Muscle Group" />
              </SelectTrigger>
              <SelectContent>
                {muscleGroups.map(muscle => (
                  <SelectItem key={muscle} value={muscle}>
                    {muscle.replace('_', ' ').charAt(0).toUpperCase() + muscle.replace('_', ' ').slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {source === 'exercisedb' && (
            <Button 
              onClick={fetchFromExerciseDB}
              disabled={loading}
              variant="outline"
              className="mb-4"
            >
              {loading ? 'Loading...' : 'Refresh from ExerciseDB'}
            </Button>
          )}

          {/* Manual Add */}
          <div className="border rounded p-3 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input id="manual-name" placeholder="Exercise name or ID" />
              <Input id="manual-youtube" placeholder="YouTube URL (optional)" />
              <Input id="manual-video" placeholder="Video URL (optional)" />
            </div>
            <div className="flex justify-end mt-2">
              <Button size="sm" variant="secondary" onClick={() => {
                const nameEl = (document.getElementById('manual-name') as HTMLInputElement);
                const ytEl = (document.getElementById('manual-youtube') as HTMLInputElement);
                const vidEl = (document.getElementById('manual-video') as HTMLInputElement);
                const val = nameEl?.value?.trim();
                if (!val) return;
                const youtubeUrl = ytEl?.value?.trim();
                const videoUrl = vidEl?.value?.trim();
                const finalVideoUrl = youtubeUrl || videoUrl || '';
                const custom: AssessmentExercise = {
                  _id: `custom_${Date.now()}`,
                  name: val,
                  description: '',
                  instructions: [],
                  targetMuscles: [],
                  difficulty: 'beginner' as const,
                  equipment: [],
                  sets: 3,
                  reps: 10,
                  frequency: 'Daily',
                  precautions: [],
                  exerciseDbId: val,
                  videoUrl: finalVideoUrl || undefined,
                  imageUrl: undefined,
                };
                onExerciseSelect?.(custom);
                nameEl.value = '';
                ytEl.value = '';
                vidEl.value = '';
              }}>Add Manual</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredExercises.map((exercise) => (
              <Card key={exercise._id} className={isSelected(exercise._id) ? 'border-primary' : ''}>
                {/* Video/Image Display */}
                <div className="relative w-full h-48 bg-gray-100 rounded-t-lg overflow-hidden">
                  {exercise.videoUrl && exercise.videoUrl !== '' ? (
                    <video 
                      className="w-full h-full object-cover"
                      poster={exercise.imageUrl || undefined}
                      controls
                      preload="metadata"
                    >
                      <source src={exercise.videoUrl} type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  ) : exercise.imageUrl && exercise.imageUrl !== '' ? (
                    <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                      <div className="text-center text-sm text-muted-foreground">
                        <Play className="h-8 w-8 mx-auto mb-2" />
                        Exercise Image
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
                      <div className="text-center">
                        <Play className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                        <p className="text-sm text-gray-500">{exercise.name}</p>
                      </div>
                    </div>
                  )}
                </div>
                
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{exercise.name}</CardTitle>
                      <CardDescription className="text-sm">
                        {exercise.description}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant={exercise.difficulty === 'beginner' ? 'default' : 
                                     exercise.difficulty === 'intermediate' ? 'secondary' : 'destructive'}>
                        {exercise.difficulty}
                      </Badge>
                      {isSelected(exercise._id) && (
                        <Badge variant="outline">Selected</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm font-medium">Target Muscles:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {exercise.targetMuscles.map((muscle, index) => (
                          <Badge key={`${muscle}-${index}`} variant="outline" className="text-xs">
                            {muscle}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <span className="text-sm font-medium">Equipment:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {exercise.equipment.map((equip, index) => (
                          <Badge key={`${equip}-${index}`} variant="secondary" className="text-xs">
                            {equip}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="text-sm">
                      <span className="font-medium">Sets:</span> {exercise.sets} × 
                      <span className="font-medium"> Reps:</span> {exercise.reps}
                    </div>

                    <div className="text-sm">
                      <span className="font-medium">Frequency:</span> {exercise.frequency}
                    </div>

                    <div className="flex gap-2 mt-4">
                      <Button
                        size="sm"
                        onClick={() => handleExerciseSelect(exercise)}
                        disabled={isSelected(exercise._id)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add to Plan
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredExercises.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No exercises found matching your criteria.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
