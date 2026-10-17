'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ImageKitUpload } from './ImageKitUpload';
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { playSound } from '@/lib/sounds';
import { PageHeader, Panel, inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui';

const exerciseSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    description: z.string().min(10, 'Description must be at least 10 characters'),
    bodyParts: z.string().min(1, 'Select at least one body part'),
    difficultyLevel: z.enum(['beginner', 'intermediate', 'advanced']),
    defaultSets: z.coerce.number().optional(),
    defaultReps: z.coerce.number().optional(),
    defaultDuration: z.coerce.number().optional(),
    defaultFrequency: z.string().min(1, 'Frequency is required'),
    instructions: z.array(z.object({ text: z.string().min(1, 'Instruction cannot be empty') })),
    imageUrl: z.string().optional(),
    videoUrl: z.string().optional(),
    category: z.array(z.string()).optional(), // Changed to array of strings
});

type ExerciseFormValues = z.infer<typeof exerciseSchema>;

interface ExerciseFormProps {
    initialData?: any;
    isEditing?: boolean;
}

const labelClass = 'text-rh-night dark:text-neutral-200';
const textareaClass = inputClass;
const selectContentClass = 'dark:border-white/10 dark:bg-rh-ink-2';

export function ExerciseForm({ initialData, isEditing = false }: ExerciseFormProps) {
    const router = useRouter();
    const createExercise = useMutation(api.exercises.createExercise);
    const updateExercise = useMutation(api.exercises.updateExercise);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<ExerciseFormValues>({
        resolver: zodResolver(exerciseSchema),
        defaultValues: initialData ? {
            ...initialData,
            bodyParts: Array.isArray(initialData.bodyParts) ? initialData.bodyParts.join(', ') : initialData.bodyParts,
            instructions: initialData.instructions.map((text: string) => ({ text })),
            category: initialData.tags || [],
        } : {
            name: '',
            description: '',
            bodyParts: '',
            difficultyLevel: 'beginner',
            defaultSets: 3,
            defaultReps: 10,
            defaultFrequency: 'Daily',
            instructions: [{ text: '' }],
            category: [],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'instructions',
    });

    const onSubmit = async (data: ExerciseFormValues) => {
        setIsSubmitting(true);
        try {
            const exerciseData = {
                name: data.name,
                description: data.description,
                bodyParts: typeof data.bodyParts === 'string' ? data.bodyParts.split(',').map(s => s.trim()) : data.bodyParts,
                targetMuscles: [], // Optional in form, required in schema - adding empty for now
                conditions: [],
                equipmentNeeded: [],
                difficultyLevel: data.difficultyLevel,
                instructions: data.instructions.map(i => i.text),
                defaultSets: data.defaultSets || 0,
                defaultReps: data.defaultReps || 0,
                defaultDuration: data.defaultDuration,
                defaultFrequency: data.defaultFrequency,
                imageUrl: data.imageUrl,
                videoUrl: data.videoUrl,
                isPublic: true,
                tags: data.category || [],
            };

            if (isEditing && initialData?._id) {
                await updateExercise({
                    id: initialData._id,
                    ...exerciseData,
                });
                toast.success('Exercise updated successfully');
            } else {
                await createExercise(exerciseData);
                toast.success('Exercise created successfully');
            }
            playSound('success');
            router.push('/dashboard/admin/exercises');
        } catch (error) {
            playSound('error');
            toast.error('Failed to save exercise', { description: (error as Error)?.message?.replace(/^.*ConvexError: /, '') });
        } finally {
            setIsSubmitting(false);
        }
    };

    const categories = [
        { id: 'mobility', label: 'Mobility' },
        { id: 'flexibility', label: 'Flexibility' },
        { id: 'strength', label: 'Strength' },
        { id: 'posture', label: 'Posture' },
        { id: 'balance', label: 'Balance' },
        { id: 'cardio', label: 'Cardio' },
        { id: 'coordination', label: 'Coordination' },
    ];

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-10">
                <div className="flex items-start gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                        type="button"
                        aria-label="Back"
                        className="-ml-2 mt-1 h-9 w-9 shrink-0 rounded-xl text-rh-night hover:bg-white dark:text-white dark:hover:bg-white/[0.06]"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="min-w-0 flex-1">
                        <PageHeader
                            eyebrow="Exercise library"
                            title={isEditing ? 'Edit exercise' : 'New exercise'}
                            description={isEditing ? 'Update the details physiotherapists see when prescribing this exercise.' : 'Fill in the details to add a new exercise to the library.'}
                            actions={
                                <>
                                    <Button type="button" onClick={() => router.back()} className={cn(softButtonClass, 'flex-1 sm:flex-none')}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={isSubmitting} className={cn(primaryButtonClass, 'flex-1 sm:flex-none')}>
                                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        {isSubmitting ? 'Saving…' : 'Save exercise'}
                                    </Button>
                                </>
                            }
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* Left Column - Main Info */}
                    <div className="space-y-6 lg:col-span-2">
                        <Panel title="Details" bodyClassName="space-y-4 p-5 pt-3">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={labelClass}>Exercise name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. Standing Calf Raise" className={inputClass} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={labelClass}>Description</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Brief overview of the exercise…" className={cn(textareaClass, 'min-h-[100px]')} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="category"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className={labelClass}>Categories</FormLabel>
                                            <div className="flex flex-wrap gap-1.5 rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-rh-ink-3">
                                                {categories.map((category) => {
                                                    const isSelected = field.value?.includes(category.id);
                                                    return (
                                                        <button
                                                            type="button"
                                                            key={category.id}
                                                            aria-pressed={isSelected}
                                                            className={cn(
                                                                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                                                                isSelected
                                                                    ? 'bg-rh-teal text-white dark:bg-rh-aqua dark:text-rh-night'
                                                                    : 'bg-rh-canvas text-neutral-600 hover:text-rh-night dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:text-white'
                                                            )}
                                                            onClick={() => {
                                                                const current = field.value || [];
                                                                const updated = isSelected
                                                                    ? current.filter((c) => c !== category.id)
                                                                    : [...current, category.id];
                                                                field.onChange(updated);
                                                            }}
                                                        >
                                                            {category.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <FormDescription>Select all that apply</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="difficultyLevel"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className={labelClass}>Difficulty</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className={cn(inputClass, 'w-full')}>
                                                        <SelectValue placeholder="Select difficulty" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className={selectContentClass}>
                                                    <SelectItem value="beginner">Beginner</SelectItem>
                                                    <SelectItem value="intermediate">Intermediate</SelectItem>
                                                    <SelectItem value="advanced">Advanced</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="bodyParts"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={labelClass}>Body parts</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. Legs, Calves, Ankles" className={inputClass} {...field} />
                                        </FormControl>
                                        <FormDescription>Separate body parts with commas</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </Panel>

                        <Panel
                            title="Step-by-step instructions"
                            actions={
                                <Button type="button" size="sm" onClick={() => append({ text: '' })} className={cn(softButtonClass, 'h-8 text-xs')}>
                                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add step
                                </Button>
                            }
                            bodyClassName="space-y-3 p-5 pt-3"
                        >
                            {fields.map((field, index) => (
                                <div key={field.id} className="flex items-start gap-2">
                                    <span className="mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rh-mist text-xs font-semibold text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">
                                        {index + 1}
                                    </span>
                                    <FormField
                                        control={form.control}
                                        name={`instructions.${index}.text`}
                                        render={({ field }) => (
                                            <FormItem className="flex-1">
                                                <FormControl>
                                                    <Textarea placeholder={`Step ${index + 1} instruction…`} className={cn(textareaClass, 'min-h-[60px]')} {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {fields.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => remove(index)}
                                            aria-label={`Remove step ${index + 1}`}
                                            className="mt-1 rounded-lg text-rose-500 hover:bg-rh-blush hover:text-rose-600 dark:text-rose-300 dark:hover:bg-rose-400/10"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </Panel>
                    </div>

                    {/* Right Column - Media & Defaults */}
                    <div className="space-y-6">
                        <Panel title="Exercise media" bodyClassName="p-5 pt-3">
                            <FormField
                                control={form.control}
                                name="imageUrl"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={labelClass}>Demonstration image</FormLabel>
                                        <FormControl>
                                            <ImageKitUpload
                                                currentImageUrl={field.value}
                                                onUploadSuccess={(res) => {
                                                    form.setValue('imageUrl', res.url);
                                                }}
                                                onRemove={() => form.setValue('imageUrl', '')}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </Panel>

                        <Panel title="Default prescription" bodyClassName="space-y-4 p-5 pt-3">
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="defaultSets"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className={labelClass}>Sets</FormLabel>
                                            <FormControl>
                                                <Input type="number" min="0" placeholder="e.g. 3" className={inputClass} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="defaultReps"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className={labelClass}>Reps</FormLabel>
                                            <FormControl>
                                                <Input type="number" min="0" placeholder="e.g. 10" className={inputClass} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="defaultDuration"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={labelClass}>Duration (seconds)</FormLabel>
                                        <FormControl>
                                            <Input type="number" placeholder="Optional" className={inputClass} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="defaultFrequency"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={labelClass}>Frequency</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger className={cn(inputClass, 'w-full')}>
                                                    <SelectValue placeholder="Select frequency" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className={selectContentClass}>
                                                <SelectItem value="Daily">Daily</SelectItem>
                                                <SelectItem value="Weekly">Weekly</SelectItem>
                                                <SelectItem value="2x Daily">2x Daily</SelectItem>
                                                <SelectItem value="3x Weekly">3x Weekly</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </Panel>
                    </div>
                </div>
            </form>
        </Form>
    );
}
