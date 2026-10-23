'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Loader2, CheckCircle2, Frown, Meh, Smile } from '@/components/icons';
import { toast } from 'sonner';

interface ExerciseCompletionModalProps {
    isOpen: boolean;
    onClose: () => void;
    treatmentPlanId: string;
    exerciseId: string;
    exerciseName: string;
    phaseOrder: number;
    defaultSets: number;
    defaultReps: number;
}

export function ExerciseCompletionModal({
    isOpen,
    onClose,
    treatmentPlanId,
    exerciseId,
    exerciseName,
    phaseOrder,
    defaultSets,
    defaultReps,
}: ExerciseCompletionModalProps) {
    const [sets, setSets] = useState(defaultSets);
    const [reps, setReps] = useState(defaultReps);
    const [difficulty, setDifficulty] = useState(3); // 1-5
    const [painLevel, setPainLevel] = useState(0); // 0-10
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const logCompletion = useMutation(api.exerciseCompletions.logExerciseCompletion);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            await logCompletion({
                treatmentPlanId: treatmentPlanId as any,
                exerciseId,
                phaseOrder,
                setsCompleted: sets,
                repsCompleted: reps,
                difficultyRating: difficulty,
                painLevel,
                notes: notes.trim() || undefined,
            });
            toast.success('Exercise logged!', {
                description: 'Great job keeping up with your plan.',
            });
            onClose();
        } catch (error) {
            console.error('Failed to log exercise:', error);
            toast.error('Failed to save progress');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getPainColor = (level: number) => {
        if (level === 0) return 'text-green-500';
        if (level <= 3) return 'text-yellow-500';
        if (level <= 6) return 'text-orange-500';
        return 'text-red-500';
    };

    const getDifficultyLabel = (level: number) => {
        switch (level) {
            case 1: return 'Very Easy';
            case 2: return 'Easy';
            case 3: return 'Moderate';
            case 4: return 'Hard';
            case 5: return 'Very Hard';
            default: return 'Moderate';
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        Log Exercise: {exerciseName}
                    </DialogTitle>
                    <DialogDescription>
                        Record your completion details and any feedback for your physiotherapist.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Performance */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Sets Completed</Label>
                            <Input
                                type="number"
                                min={1}
                                value={sets}
                                onChange={(e) => setSets(parseInt(e.target.value) || 0)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Reps per Set</Label>
                            <Input
                                type="number"
                                min={1}
                                value={reps}
                                onChange={(e) => setReps(parseInt(e.target.value) || 0)}
                            />
                        </div>
                    </div>

                    {/* Difficulty */}
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <Label>Difficulty</Label>
                            <span className="text-sm font-medium text-muted-foreground">{getDifficultyLabel(difficulty)}</span>
                        </div>
                        <Slider
                            value={[difficulty]}
                            onValueChange={(vals) => setDifficulty(vals[0])}
                            min={1}
                            max={5}
                            step={1}
                            className="py-2"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground px-1">
                            <span>Easy</span>
                            <span>Hard</span>
                        </div>
                    </div>

                    {/* Pain Level */}
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <Label>Pain Level (0-10)</Label>
                            <span className={`text-sm font-bold ${getPainColor(painLevel)}`}>{painLevel}</span>
                        </div>
                        <Slider
                            value={[painLevel]}
                            onValueChange={(vals) => setPainLevel(vals[0])}
                            min={0}
                            max={10}
                            step={1}
                            className="py-2"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground px-1">
                            <span>No Pain</span>
                            <span>Severe Pain</span>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label>Notes (Optional)</Label>
                        <Textarea
                            placeholder="How did it feel? Any discomfort?"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="resize-none"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            'Save Progress'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
