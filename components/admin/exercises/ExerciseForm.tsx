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
import { Card, CardContent } from '@/components/ui/card';
import { ImageKitUpload } from './ImageKitUpload';
import { Plus, Trash2, Save, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { toast } from 'sonner';

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
            router.push('/dashboard/admin/exercises');
        } catch (error) {
            console.error('Error saving exercise:', error);
            toast.error('Failed to save exercise');
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
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-5xl mx-auto pb-10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => router.back()} type="button" className="-ml-2 sm:ml-0">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">{isEditing ? 'Edit Exercise' : 'New Exercise'}</h1>
                            <p className="text-muted-foreground text-sm sm:text-base">Fill in the details to add a new exercise to the library.</p>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button variant="outline" type="button" onClick={() => router.back()} className="flex-1 sm:flex-none">Cancel</Button>
                        <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-none">
                            {isSubmitting ? 'Saving...' : <><Save className="w-4 h-4 mr-2" /> Save Exercise</>}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column - Main Info */}
                    <div className="lg:col-span-2 space-y-6">
                        <Card>
                            <CardContent className="p-6 space-y-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Exercise Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. Standing Calf Raise" {...field} />
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
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder="Brief overview of the exercise..." className="min-h-[100px]" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="category"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Categories</FormLabel>
                                                <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-white">
                                                    {categories.map((category) => {
                                                        const isSelected = field.value?.includes(category.id);
                                                        return (
                                                            <div
                                                                key={category.id}
                                                                className={`
                                                                    cursor-pointer px-3 py-1.5 rounded-full text-sm border transition-colors
                                                                    ${isSelected
                                                                        ? 'bg-green-100 border-green-200 text-green-700 font-medium'
                                                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}
                                                                `}
                                                                onClick={() => {
                                                                    const current = field.value || [];
                                                                    const updated = isSelected
                                                                        ? current.filter((c) => c !== category.id)
                                                                        : [...current, category.id];
                                                                    field.onChange(updated);
                                                                }}
                                                            >
                                                                {category.label}
                                                            </div>
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
                                                <FormLabel>Difficulty</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select difficulty" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
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
                                            <FormLabel>Body Parts (comma separated)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. Legs, Calves, Ankles" {...field} />
                                            </FormControl>
                                            <FormDescription>Enter body parts separated by commas</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="p-6 space-y-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-semibold text-lg">Step-by-Step Instructions</h3>
                                    <Button type="button" variant="outline" size="sm" onClick={() => append({ text: '' })}>
                                        <Plus className="w-4 h-4 mr-2" /> Add Step
                                    </Button>
                                </div>

                                <div className="space-y-3">
                                    {fields.map((field, index) => (
                                        <div key={field.id} className="flex gap-2 items-start">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600 mt-1">
                                                {index + 1}
                                            </div>
                                            <FormField
                                                control={form.control}
                                                name={`instructions.${index}.text`}
                                                render={({ field }) => (
                                                    <FormItem className="flex-1">
                                                        <FormControl>
                                                            <Textarea placeholder={`Step ${index + 1} instruction...`} className="min-h-[60px]" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            {fields.length > 1 && (
                                                <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-red-500 hover:text-red-600 hover:bg-red-50 mt-1">
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column - Media & Defaults */}
                    <div className="space-y-6">
                        <Card>
                            <CardContent className="p-6 space-y-4">
                                <h3 className="font-semibold text-lg mb-4">Exercise Media</h3>
                                <FormField
                                    control={form.control}
                                    name="imageUrl"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Demonstration Image</FormLabel>
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
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="p-6 space-y-4">
                                <h3 className="font-semibold text-lg mb-4">Default Prescription</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="defaultSets"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Sets (Optional)</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min="0" placeholder="e.g. 3" {...field} />
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
                                                <FormLabel>Reps (Optional)</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min="0" placeholder="e.g. 10" {...field} />
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
                                            <FormLabel>Duration (seconds)</FormLabel>
                                            <FormControl>
                                                <Input type="number" placeholder="Optional" {...field} />
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
                                            <FormLabel>Frequency</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select frequency" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
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
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </form>
        </Form>
    );
}
