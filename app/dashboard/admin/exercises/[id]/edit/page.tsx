'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { ExerciseForm } from '@/components/admin/exercises/ExerciseForm';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function EditExercisePage() {
    const params = useParams();
    const exerciseId = params.id as string;

    // We need a getExercise query. I implemented listExercises but not getExercise by ID.
    // I should add getExercise to convex/exercises.ts or just use listExercises and find it client side?
    // No, that's inefficient. I should add getExercise.
    // Wait, convex has `db.get(id)`. I can create a query for it.
    // Or I can use `api.exercises.getExercise` if I create it.

    // Let's create getExercise in convex/exercises.ts first.
    // For now I'll stub this page and then update the backend.

    const exercise = useQuery(api.exercises.getExercise, { id: exerciseId as any });

    if (exercise === undefined) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            </div>
        );
    }

    if (exercise === null) {
        return (
            <div className="p-8 text-center">
                <h1 className="text-2xl font-bold">Exercise not found</h1>
            </div>
        );
    }

    return (
        <div className="p-8">
            <ExerciseForm initialData={exercise} isEditing />
        </div>
    );
}
