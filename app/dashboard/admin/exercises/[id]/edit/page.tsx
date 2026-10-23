'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { Dumbbell } from '@/components/icons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExerciseForm } from '@/components/admin/exercises/ExerciseForm';
import { AdminPage, EmptyState, Panel, softButtonClass } from '@/components/admin/ui';

export default function EditExercisePage() {
    const params = useParams<{ id: string }>();
    const exerciseId = params.id as Id<'exercises'>;

    const exercise = useQuery(api.exercises.getExercise, { id: exerciseId });

    if (exercise === undefined) {
        return (
            <AdminPage className="max-w-5xl">
                <Skeleton className="h-12 w-72 rounded-xl dark:bg-white/[0.06]" />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <Skeleton className="h-96 rounded-2xl dark:bg-white/[0.06] lg:col-span-2" />
                    <Skeleton className="h-96 rounded-2xl dark:bg-white/[0.06]" />
                </div>
            </AdminPage>
        );
    }

    if (exercise === null) {
        return (
            <AdminPage className="max-w-5xl">
                <Panel>
                    <EmptyState
                        icon={<Dumbbell />}
                        title="Exercise not found"
                        description="It may have been deleted."
                        action={
                            <Button asChild className={softButtonClass}>
                                <Link href="/dashboard/admin/exercises">Back to exercises</Link>
                            </Button>
                        }
                    />
                </Panel>
            </AdminPage>
        );
    }

    return (
        <AdminPage className="max-w-5xl">
            <ExerciseForm initialData={exercise} isEditing />
        </AdminPage>
    );
}
