'use client';

import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

interface NPSFormProps {
  patientId: string;
  onComplete?: () => void;
}

export function NPSAssessmentForm({ patientId, onComplete }: NPSFormProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [notes, setNotes] = useState('');
  const { toast } = useToast();
  const createAssessment = useMutation(api.assessments.createNPSAssessment);

  const handleSubmit = async () => {
    if (rating === null) {
      toast({ title: 'Error', description: 'Please select a rating.', variant: 'destructive' });
      return;
    }

    try {
      await createAssessment({
        patientId: patientId as any,
        responses: {
          rating,
          feedback: feedback || undefined
        },
        notes: notes || undefined,
      });
      
      toast({
        title: 'Assessment Completed',
        description: 'NPS has been saved successfully.',
      });
      
      onComplete?.();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save assessment.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Net Promoter Score (NPS)</CardTitle>
          <CardDescription>
            How likely is the patient to recommend your clinic or services to a friend or colleague?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          
          <div className="space-y-4">
            <Label className="text-lg">Rating (0-10)</Label>
            <div className="flex justify-between gap-1 sm:gap-2 overflow-x-auto pb-2">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  onClick={() => setRating(num)}
                  className={`min-w-10 h-10 sm:w-12 sm:h-12 rounded-lg border font-semibold flex items-center justify-center transition-colors ${
                    rating === num
                      ? num >= 9 ? 'bg-green-500 text-white border-green-600'
                      : num >= 7 ? 'bg-yellow-500 text-white border-yellow-600'
                      : 'bg-red-500 text-white border-red-600'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0 (Not at all likely)</span>
              <span>10 (Extremely likely)</span>
            </div>
          </div>

          <div>
            <Label>Patient Feedback/Reasoning (Optional)</Label>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Why did they give this rating?"
              className="mt-2"
            />
          </div>

          <div>
            <Label>Internal Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              className="mt-2"
            />
          </div>

          <div className="flex justify-end mt-6">
            <Button onClick={handleSubmit} disabled={rating === null}>
              Complete Assessment
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
