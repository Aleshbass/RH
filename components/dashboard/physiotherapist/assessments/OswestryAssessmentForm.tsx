'use client';

import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';

interface OswestryFormProps {
  patientId: string;
  onComplete?: () => void;
}

const oswestryQuestions = [
  {
    id: 'painIntensity',
    question: 'Pain Intensity',
    options: [
      { value: 0, label: 'I have no pain at the moment' },
      { value: 1, label: 'The pain is very mild at the moment' },
      { value: 2, label: 'The pain is moderate at the moment' },
      { value: 3, label: 'The pain is fairly severe at the moment' },
      { value: 4, label: 'The pain is very severe at the moment' },
      { value: 5, label: 'The pain is the worst imaginable at the moment' },
    ],
  },
  {
    id: 'personalCare',
    question: 'Personal Care (Washing, Dressing, etc.)',
    options: [
      { value: 0, label: 'I can look after myself normally without causing extra pain' },
      { value: 1, label: 'I can look after myself normally but it causes extra pain' },
      { value: 2, label: 'It is painful to look after myself and I am slow and careful' },
      { value: 3, label: 'I need some help but manage most of my personal care' },
      { value: 4, label: 'I need help every day in most aspects of self-care' },
      { value: 5, label: 'I do not get dressed, wash with difficulty, and stay in bed' },
    ],
  },
  {
    id: 'lifting',
    question: 'Lifting',
    options: [
      { value: 0, label: 'I can lift heavy weights without extra pain' },
      { value: 1, label: 'I can lift heavy weights but it gives extra pain' },
      { value: 2, label: 'Pain prevents me from lifting heavy weights off the floor' },
      { value: 3, label: 'Pain prevents me from lifting heavy weights but I can manage light to medium weights if they are conveniently positioned' },
      { value: 4, label: 'I can lift only very light weights' },
      { value: 5, label: 'I cannot lift or carry anything at all' },
    ],
  },
  {
    id: 'walking',
    question: 'Walking',
    options: [
      { value: 0, label: 'Pain does not prevent me from walking any distance' },
      { value: 1, label: 'Pain prevents me from walking more than 1 mile' },
      { value: 2, label: 'Pain prevents me from walking more than 1/2 mile' },
      { value: 3, label: 'Pain prevents me from walking more than 100 yards' },
      { value: 4, label: 'I can only walk using a stick or crutches' },
      { value: 5, label: 'I am in bed most of the time and have to crawl to the toilet' },
    ],
  },
  {
    id: 'sitting',
    question: 'Sitting',
    options: [
      { value: 0, label: 'I can sit in any chair as long as I like' },
      { value: 1, label: 'I can only sit in my favorite chair as long as I like' },
      { value: 2, label: 'Pain prevents me from sitting more than one hour' },
      { value: 3, label: 'Pain prevents me from sitting more than 30 minutes' },
      { value: 4, label: 'Pain prevents me from sitting more than 10 minutes' },
      { value: 5, label: 'Pain prevents me from sitting at all' },
    ],
  },
  {
    id: 'standing',
    question: 'Standing',
    options: [
      { value: 0, label: 'I can stand as long as I want without extra pain' },
      { value: 1, label: 'I can stand as long as I want but it gives me extra pain' },
      { value: 2, label: 'Pain prevents me from standing for more than 1 hour' },
      { value: 3, label: 'Pain prevents me from standing for more than 30 minutes' },
      { value: 4, label: 'Pain prevents me from standing for more than 10 minutes' },
      { value: 5, label: 'Pain prevents me from standing at all' },
    ],
  },
  {
    id: 'sleeping',
    question: 'Sleeping',
    options: [
      { value: 0, label: 'My sleep is never disturbed by pain' },
      { value: 1, label: 'My sleep is occasionally disturbed by pain' },
      { value: 2, label: 'Because of pain I have less than 6 hours sleep' },
      { value: 3, label: 'Because of pain I have less than 4 hours sleep' },
      { value: 4, label: 'Because of pain I have less than 2 hours sleep' },
      { value: 5, label: 'Pain prevents me from sleeping at all' },
    ],
  },
  {
    id: 'sexLife',
    question: 'Sex Life',
    options: [
      { value: 0, label: 'My sex life is normal and causes no extra pain' },
      { value: 1, label: 'My sex life is normal but causes some extra pain' },
      { value: 2, label: 'My sex life is nearly normal but is very painful' },
      { value: 3, label: 'My sex life is severely restricted by pain' },
      { value: 4, label: 'My sex life is nearly absent because of pain' },
      { value: 5, label: 'Pain prevents any sex life at all' },
    ],
  },
  {
    id: 'socialLife',
    question: 'Social Life',
    options: [
      { value: 0, label: 'My social life is normal and gives me no extra pain' },
      { value: 1, label: 'My social life is normal but increases the degree of pain' },
      { value: 2, label: 'Pain has no significant effect on my social life apart from limiting energetic interests' },
      { value: 3, label: 'Pain has restricted my social life and I do not go out as often' },
      { value: 4, label: 'Pain has restricted social life to my home' },
      { value: 5, label: 'I have no social life because of pain' },
    ],
  },
  {
    id: 'traveling',
    question: 'Traveling',
    options: [
      { value: 0, label: 'I can travel anywhere without pain' },
      { value: 1, label: 'I can travel anywhere but it gives extra pain' },
      { value: 2, label: 'Pain is bad but I manage journeys over two hours' },
      { value: 3, label: 'Pain restricts me to journeys of less than one hour' },
      { value: 4, label: 'Pain restricts me to short necessary journeys under 30 minutes' },
      { value: 5, label: 'Pain prevents me from traveling except to receive treatment' },
    ],
  },
];

export function OswestryAssessmentForm({ patientId, onComplete }: OswestryFormProps) {
  const [responses, setResponses] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const { toast } = useToast();
  const createAssessment = useMutation(api.assessments.createOswestryAssessment);

  const handleResponseChange = (questionId: string, value: number) => {
    setResponses(prev => ({ ...prev, [questionId]: value }));
  };

  const handleNext = () => {
    if (currentQuestion < oswestryQuestions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    try {
      await createAssessment({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patientId: patientId as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responses: responses as any,
        notes: notes || undefined,
      });
      
      toast({
        title: 'Assessment Completed',
        description: 'Oswestry Disability Index has been saved successfully.',
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

  const isCurrentQuestionAnswered = () => {
    return responses[oswestryQuestions[currentQuestion].id] !== undefined;
  };

  const progress = ((currentQuestion + 1) / oswestryQuestions.length) * 100;
  const totalScore = Object.values(responses).reduce((sum, val) => sum + val, 0);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Oswestry Disability Index</CardTitle>
          <CardDescription>
            Complete this assessment to evaluate the patient&apos;s functional disability level.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">
                {currentQuestion + 1} of {oswestryQuestions.length}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">
                {oswestryQuestions[currentQuestion].question}
              </h3>
              
              <RadioGroup
                value={responses[oswestryQuestions[currentQuestion].id]?.toString()}
                onValueChange={(value) => 
                  handleResponseChange(oswestryQuestions[currentQuestion].id, parseInt(value))
                }
                className="space-y-3"
              >
                {oswestryQuestions[currentQuestion].options.map((option) => (
                  <div key={option.value} className="flex items-start space-x-3">
                    <RadioGroupItem 
                      value={option.value.toString()} 
                      id={`option-${option.value}`}
                    />
                    <Label 
                      htmlFor={`option-${option.value}`} 
                      className="text-sm cursor-pointer flex-1"
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {currentQuestion === oswestryQuestions.length - 1 && (
              <div>
                <Label htmlFor="notes">Additional Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Enter any additional observations or notes..."
                  className="mt-2"
                />
              </div>
            )}

            {currentQuestion === oswestryQuestions.length - 1 && totalScore > 0 && (
              <Alert>
                <AlertDescription>
                  <strong>Current Score: {totalScore}/50</strong>
                  <br />
                  {totalScore <= 10 && 'Minimal disability (0-20%)'}
                  {totalScore > 10 && totalScore <= 20 && 'Moderate disability (20-40%)'}
                  {totalScore > 20 && totalScore <= 30 && 'Severe disability (40-60%)'}
                  {totalScore > 30 && totalScore <= 40 && 'Crippled (60-80%)'}
                  {totalScore > 40 && 'Bed-bound or exaggerating (80-100%)'}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex justify-between mt-6">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentQuestion === 0}
            >
              Previous
            </Button>
            
            {currentQuestion < oswestryQuestions.length - 1 ? (
              <Button
                onClick={handleNext}
                disabled={!isCurrentQuestionAnswered()}
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!isCurrentQuestionAnswered()}
              >
                Complete Assessment
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
