'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Filter, Dumbbell, MoreVertical, Trash2, Edit } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { toast } from 'sonner';

export default function AdminExercisesPage() {
    const [search, setSearch] = useState('');
    const [difficulty, setDifficulty] = useState<string>('all');
    const [bodyPart, setBodyPart] = useState<string>('all');

    const exercises = useQuery(api.exercises.listExercises, {
        search: search || undefined,
        difficulty: difficulty !== 'all' ? difficulty : undefined,
        bodyPart: bodyPart !== 'all' ? bodyPart : undefined,
    });

    const deleteExercise = useMutation(api.exercises.deleteExercise);

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this exercise?')) {
            try {
                await deleteExercise({ id: id as any });
                toast.success('Exercise deleted');
            } catch (error) {
                toast.error('Failed to delete exercise');
            }
        }
    };

    return (
        <div className="space-y-8 p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Exercise Library</h1>
                    <p className="text-muted-foreground mt-1">Manage the exercises available for treatment plans.</p>
                </div>
                <Link href="/dashboard/admin/exercises/new">
                    <Button className="bg-green-600 hover:bg-green-700">
                        <Plus className="w-4 h-4 mr-2" /> Add Exercise
                    </Button>
                </Link>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        placeholder="Search exercises..."
                        className="pl-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Difficulty" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Levels</SelectItem>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={bodyPart} onValueChange={setBodyPart}>
                    <SelectTrigger className="w-[180px]">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map((i) => (
                        <Card key={i} className="animate-pulse">
                            <div className="h-48 bg-gray-200 rounded-t-lg" />
                            <CardContent className="p-4 space-y-3">
                                <div className="h-6 bg-gray-200 rounded w-3/4" />
                                <div className="h-4 bg-gray-200 rounded w-1/2" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : exercises.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <div className="w-16 h-16 mx-auto bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                        <Dumbbell className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">No exercises found</h3>
                    <p className="text-muted-foreground mt-1 mb-4">Try adjusting your search or filters, or add a new exercise.</p>
                    <Link href="/dashboard/admin/exercises/new">
                        <Button variant="outline">Add New Exercise</Button>
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {exercises.map((exercise: any) => (
                        <Card key={exercise._id} className="group overflow-hidden hover:shadow-lg transition-all duration-200 border-gray-200">
                            <div className="relative aspect-video bg-gray-100 overflow-hidden">
                                {exercise.imageUrl ? (
                                    <img
                                        src={exercise.imageUrl}
                                        alt={exercise.name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
                            </div>
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <h3 className="font-semibold text-gray-900 line-clamp-1">{exercise.name}</h3>
                                        <p className="text-sm text-muted-foreground line-clamp-1">{Array.isArray(exercise.bodyParts) ? exercise.bodyParts.join(', ') : exercise.bodyParts}</p>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                                                <MoreVertical className="w-4 h-4 text-gray-500" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <Link href={`/dashboard/admin/exercises/${exercise._id}/edit`}>
                                                <DropdownMenuItem>
                                                    <Edit className="w-4 h-4 mr-2" /> Edit
                                                </DropdownMenuItem>
                                            </Link>
                                            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => handleDelete(exercise._id)}>
                                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                <div className="flex flex-wrap gap-1 mt-3">
                                    {(exercise.tags || []).slice(0, 3).map((tag: any) => (
                                        <span key={tag} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
