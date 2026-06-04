'use client';

import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PSFSFormProps {
  patientId: string;
  onComplete?: () => void;
}

export function PSFSAssessmentForm({ patientId, onComplete }: PSFSFormProps) {
  const [activities, setActivities] = useState([
    { name: '', score: '' },
    { name: '', score: '' },
    { name: '', score: '' }
  ]);
  const [notes, setNotes] = useState('');
  const { toast } = useToast();
  const createAssessment = useMutation(api.assessments.createPSFSAssessment);

  const handleSubmit = async () => {
    // Basic validation
    if (!activities[0].name.trim() || activities[0].score === '') {
      toast({ title: 'Error', description: 'Activity 1 is required.', variant: 'destructive' });
      return;
    }

    try {
      const responses: any = {
        activity1: { name: activities[0].name, score: Number(activities[0].score) }
      };

      if (activities[1].name.trim() && activities[1].score !== '') {
        responses.activity2 = { name: activities[1].name, score: Number(activities[1].score) };
      }
      if (activities[2].name.trim() && activities[2].score !== '') {
        responses.activity3 = { name: activities[2].name, score: Number(activities[2].score) };
      }

      await createAssessment({
        patientId: patientId as any,
        responses,
        notes: notes || undefined,
      });
      
      toast({
        title: 'Assessment Completed',
        description: 'PSFS has been saved successfully.',
      });
      
      onComplete?.();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save assessment. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Patient-Specific Functional Scale (PSFS)</CardTitle>
          <CardDescription>
            Identify up to 3 important activities that the patient is having difficulty with or is unable to perform.
            Rate difficulty on a scale from 0 (Unable to perform) to 10 (Able to perform at prior level).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="mb-4">
            <AlertDescription>
              0 = Unable to perform activity<br />
              10 = Able to perform activity at same level as before injury or problem
            </AlertDescription>
          </Alert>

          {activities.map((activity, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-lg">
              <div className="col-span-3">
                <Label>Activity {index + 1} {index === 0 && <span className="text-red-500">*</span>}</Label>
                <Input
                  placeholder="e.g. Walking up stairs"
                  value={activity.name}
                  onChange={(e) => {
                    const newAct = [...activities];
                    newAct[index].name = e.target.value;
                    setActivities(newAct);
                  }}
                />
              </div>
              <div className="col-span-1">
                <Label>Score (0-10) {index === 0 && <span className="text-red-500">*</span>}</Label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  value={activity.score}
                  onChange={(e) => {
                    const newAct = [...activities];
                    newAct[index].score = e.target.value;
                    setActivities(newAct);
                  }}
                />
              </div>
            </div>
          ))}

          <div>
            <Label>Additional Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter any additional observations..."
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
