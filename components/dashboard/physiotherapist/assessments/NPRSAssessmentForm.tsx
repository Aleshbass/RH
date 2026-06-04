'use client';

import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

interface NPRSFormProps {
  patientId: string;
  onComplete?: () => void;
}

export function NPRSAssessmentForm({ patientId, onComplete }: NPRSFormProps) {
  const [currentPain, setCurrentPain] = useState(0);
  const [bestPain, setBestPain] = useState(0);
  const [worstPain, setWorstPain] = useState(0);
  const [notes, setNotes] = useState('');
  const { toast } = useToast();
  const createAssessment = useMutation(api.assessments.createNPRSAssessment);

  const handleSubmit = async () => {
    try {
      await createAssessment({
        patientId: patientId as any,
        responses: {
          currentPain,
          bestPain,
          worstPain
        },
        notes: notes || undefined,
      });
      
      toast({
        title: 'Assessment Completed',
        description: 'NPRS has been saved successfully.',
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
          <CardTitle>Numeric Pain Rating Scale (NPRS)</CardTitle>
          <CardDescription>
            Ask the patient to rate their pain from 0 (No pain) to 10 (Worst imaginable pain).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          
          <div className="space-y-4">
            <Label className="text-lg">Current Pain: <span className="font-bold text-teal-600">{currentPain}</span></Label>
            <Slider
              value={[currentPain]}
              max={10}
              step={1}
              onValueChange={(v) => setCurrentPain(v[0])}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0 (No pain)</span>
              <span>10 (Worst pain)</span>
            </div>
          </div>

          <div className="space-y-4">
            <Label className="text-lg">Best Pain (Last 24h): <span className="font-bold text-teal-600">{bestPain}</span></Label>
            <Slider
              value={[bestPain]}
              max={10}
              step={1}
              onValueChange={(v) => setBestPain(v[0])}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0 (No pain)</span>
              <span>10 (Worst pain)</span>
            </div>
          </div>

          <div className="space-y-4">
            <Label className="text-lg">Worst Pain (Last 24h): <span className="font-bold text-teal-600">{worstPain}</span></Label>
            <Slider
              value={[worstPain]}
              max={10}
              step={1}
              onValueChange={(v) => setWorstPain(v[0])}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0 (No pain)</span>
              <span>10 (Worst pain)</span>
            </div>
          </div>

          <div>
            <Label>Additional Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Pain is worse in the morning..."
              className="mt-2"
            />
          </div>

          <div className="flex justify-end mt-6">
            <Button onClick={handleSubmit}>
              Complete Assessment
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
