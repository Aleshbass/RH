'use client';

import { ExerciseForm } from '@/components/admin/exercises/ExerciseForm';
import { AdminPage } from '@/components/admin/ui';

export default function NewExercisePage() {
    return (
        <AdminPage className="max-w-5xl">
            <ExerciseForm />
        </AdminPage>
    );
}
