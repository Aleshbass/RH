'use client';

import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface CreateExerciseDialogProps {
    onSuccess?: () => void;
}

export function CreateExerciseDialog({ onSuccess }: CreateExerciseDialogProps) {
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const createExercise = useMutation(api.exercises.createExercise);

    // Form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [instructions, setInstructions] = useState('');
    const [bodyParts, setBodyParts] = useState<string[]>([]);
    const [targetMuscles, setTargetMuscles] = useState<string[]>([]);
    const [equipmentNeeded, setEquipmentNeeded] = useState<string[]>([]);
    const [difficultyLevel, setDifficultyLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
    const [defaultSets, setDefaultSets] = useState(3);
    const [defaultReps, setDefaultReps] = useState(10);
    const [defaultFrequency, setDefaultFrequency] = useState('3 times per week');
    const [videoUrl, setVideoUrl] = useState('');

    const bodyPartOptions = [
        'Lower Back', 'Upper Back', 'Neck', 'Shoulder', 'Hip', 'Knee', 'Ankle',
        'Wrist', 'Elbow', 'Core', 'Chest', 'Leg', 'Arm', 'Full Body'
    ];

    const handleBodyPartToggle = (part: string) => {
        setBodyParts(prev =>
            prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]
        );
        // Also add to target muscles for simplicity
        setTargetMuscles(prev =>
            prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]
        );
    };

    const resetForm = () => {
        setName('');
        setDescription('');
        setInstructions('');
        setBodyParts([]);
        setTargetMuscles([]);
        setEquipmentNeeded([]);
        setDifficultyLevel('beginner');
        setDefaultSets(3);
        setDefaultReps(10);
        setDefaultFrequency('3 times per week');
        setVideoUrl('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            toast.error('Please enter an exercise name');
            return;
        }

        if (bodyParts.length === 0) {
            toast.error('Please select at least one body part');
            return;
        }

        setIsSubmitting(true);
        try {
            await createExercise({
                name: name.trim(),
                description: description.trim() || 'Custom exercise',
                instructions: instructions.split('\n').filter(i => i.trim()),
                bodyParts,
                targetMuscles: targetMuscles.length > 0 ? targetMuscles : bodyParts,
                conditions: [], // PT can specify conditions if needed
                equipmentNeeded,
                difficultyLevel,
                defaultSets,
                defaultReps,
                defaultFrequency,
                isPublic: false, // PT-created exercises are private by default
                videoUrl: videoUrl.trim() || undefined,
                tags: ['custom', 'physiotherapist-created'],
            });

            toast.success('Exercise created successfully!');
            resetForm();
            setOpen(false);
            onSuccess?.();
        } catch (error) {
            console.error('Failed to create exercise:', error);
            toast.error('Failed to create exercise. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="border-dashed">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Custom Exercise
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create Custom Exercise</DialogTitle>
                    <DialogDescription>
                        Add a new exercise to your personal library. This exercise will be available only to you.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Exercise Name *</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Seated Hip Stretch"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Brief description of the exercise..."
                                rows={2}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="instructions">Instructions (one per line)</Label>
                            <Textarea
                                id="instructions"
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                placeholder="1. Start in a seated position&#10;2. Cross your right ankle over your left knee&#10;3. Lean forward gently..."
                                rows={4}
                            />
                        </div>
                    </div>

                    {/* Body Parts */}
                    <div className="space-y-2">
                        <Label>Target Body Parts *</Label>
                        <div className="flex flex-wrap gap-2">
                            {bodyPartOptions.map((part) => (
                                <Button
                                    key={part}
                                    type="button"
                                    variant={bodyParts.includes(part) ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => handleBodyPartToggle(part)}
                                >
                                    {part}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Difficulty and Defaults */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Difficulty Level</Label>
                            <Select value={difficultyLevel} onValueChange={(v) => setDifficultyLevel(v as typeof difficultyLevel)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="beginner">Beginner</SelectItem>
                                    <SelectItem value="intermediate">Intermediate</SelectItem>
                                    <SelectItem value="advanced">Advanced</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="frequency">Frequency</Label>
                            <Input
                                id="frequency"
                                value={defaultFrequency}
                                onChange={(e) => setDefaultFrequency(e.target.value)}
                                placeholder="e.g., 3 times per week"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="sets">Default Sets</Label>
                            <Input
                                id="sets"
                                type="number"
                                min={1}
                                value={defaultSets}
                                onChange={(e) => setDefaultSets(parseInt(e.target.value) || 1)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="reps">Default Reps</Label>
                            <Input
                                id="reps"
                                type="number"
                                min={1}
                                value={defaultReps}
                                onChange={(e) => setDefaultReps(parseInt(e.target.value) || 1)}
                            />
                        </div>
                    </div>

                    {/* Video URL */}
                    <div className="space-y-2">
                        <Label htmlFor="videoUrl">Video URL (optional)</Label>
                        <Input
                            id="videoUrl"
                            type="url"
                            value={videoUrl}
                            onChange={(e) => setVideoUrl(e.target.value)}
                            placeholder="https://www.youtube.com/watch?v=..."
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Create Exercise
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
