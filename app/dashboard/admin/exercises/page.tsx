'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import { Dumbbell, Edit, MoreVertical, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { playSound } from '@/lib/sounds';
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatusBadge,
  Stagger,
  StaggerItem,
  cardClass,
  inputClass,
  primaryButtonClass,
  softButtonClass,
} from '@/components/admin/ui';

type Difficulty = 'all' | 'beginner' | 'intermediate' | 'advanced';

type ExerciseRow = {
  _id: Id<'exercises'>;
  name: string;
  difficultyLevel: string;
  bodyParts: string[] | string;
  imageUrl?: string;
  tags?: string[];
};

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'all', label: 'All levels' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const BODY_PARTS = ['Legs', 'Arms', 'Back', 'Core', 'Shoulders'];

const difficultyTone = (level: string) => (level === 'beginner' ? 'green' : level === 'intermediate' ? 'amber' : level === 'advanced' ? 'red' : 'neutral');

export default function AdminExercisesPage() {
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('all');
  const [bodyPart, setBodyPart] = useState<string>('all');
  const [pendingDelete, setPendingDelete] = useState<ExerciseRow | null>(null);

  const exercises = useQuery(api.exercises.listExercises, {
    search: search || undefined,
    difficulty: difficulty !== 'all' ? difficulty : undefined,
    bodyPart: bodyPart !== 'all' ? bodyPart : undefined,
  }) as ExerciseRow[] | undefined;

  const deleteExercise = useMutation(api.exercises.deleteExercise);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteExercise({ id: pendingDelete._id });
      playSound('reject');
      toast.success(`“${pendingDelete.name}” deleted`);
    } catch (error) {
      toast.error('Failed to delete exercise');
      throw error;
    }
  };

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Exercise library"
        title="Exercises"
        description="The exercises physiotherapists can add to treatment plans."
        actions={
          <Button asChild className={primaryButtonClass}>
            <Link href="/dashboard/admin/exercises/new">
              <Plus className="mr-2 h-4 w-4" /> Add exercise
            </Link>
          </Button>
        }
      />

      <Panel bodyClassName="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Search exercises…"
            className={cn(inputClass, 'pl-9')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search exercises"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FilterChips value={difficulty} onChange={setDifficulty} options={DIFFICULTIES} />
          <Select value={bodyPart} onValueChange={setBodyPart}>
            <SelectTrigger className={cn(inputClass, 'h-9 w-[170px]')} aria-label="Body part">
              <SelectValue placeholder="Body part" />
            </SelectTrigger>
            <SelectContent className="dark:border-white/10 dark:bg-rh-ink-2">
              <SelectItem value="all">All body parts</SelectItem>
              {BODY_PARTS.map((part) => (
                <SelectItem key={part} value={part}>
                  {part}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Panel>

      {exercises === undefined ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn(cardClass, 'overflow-hidden')}>
              <Skeleton className="aspect-video rounded-none dark:bg-white/[0.06]" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-5 w-3/4 dark:bg-white/[0.06]" />
                <Skeleton className="h-4 w-1/2 dark:bg-white/[0.06]" />
              </div>
            </div>
          ))}
        </div>
      ) : exercises.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Dumbbell />}
            title="No exercises found"
            description="Try adjusting your search or filters, or add a new exercise."
            action={
              <Button asChild className={softButtonClass}>
                <Link href="/dashboard/admin/exercises/new">Add new exercise</Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {exercises.map((exercise) => (
            <StaggerItem key={exercise._id}>
              <div className={cn(cardClass, 'group h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lift')}>
                <Link href={`/dashboard/admin/exercises/${exercise._id}/edit`} className="relative block aspect-video overflow-hidden bg-rh-canvas dark:bg-white/[0.04]">
                  {exercise.imageUrl ? (
                    <Image
                      src={exercise.imageUrl}
                      alt={exercise.name}
                      fill
                      unoptimized
                      sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      <Dumbbell className="h-10 w-10 text-neutral-300 dark:text-neutral-600" />
                    </span>
                  )}
                  <span className="absolute right-2 top-2">
                    <StatusBadge tone={difficultyTone(exercise.difficultyLevel)} className="capitalize shadow-sm">
                      {exercise.difficultyLevel}
                    </StatusBadge>
                  </span>
                </Link>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="line-clamp-1 font-semibold text-rh-night dark:text-white">{exercise.name}</h3>
                      <p className="line-clamp-1 text-sm text-neutral-500 dark:text-neutral-400">
                        {Array.isArray(exercise.bodyParts) ? exercise.bodyParts.join(', ') : exercise.bodyParts}
                      </p>
                    </div>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="-mr-2 h-8 w-8 shrink-0 rounded-lg dark:hover:bg-white/[0.06]" aria-label={`Actions for ${exercise.name}`}>
                          <MoreVertical className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl dark:border-white/10 dark:bg-rh-ink-2">
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/admin/exercises/${exercise._id}/edit`}>
                            <Edit className="mr-2 h-4 w-4" /> Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-rose-600 focus:text-rose-600 dark:text-rose-300 dark:focus:text-rose-300"
                          onSelect={() => setPendingDelete(exercise)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {(exercise.tags || []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {(exercise.tags || []).slice(0, 3).map((tag) => (
                        <StatusBadge key={tag} className="capitalize">
                          {tag}
                        </StatusBadge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this exercise?"
        description={
          pendingDelete
            ? `“${pendingDelete.name}” will be removed from the library for everyone. This can’t be undone.`
            : undefined
        }
        confirmLabel="Delete exercise"
        destructive
        onConfirm={confirmDelete}
      />
    </AdminPage>
  );
}
