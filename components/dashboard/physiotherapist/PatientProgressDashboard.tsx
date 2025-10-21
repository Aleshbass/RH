'use client';

import React, { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  CheckCircle2, 
  AlertCircle,
  Calendar,
  Eye
} from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import LoadingSpinner from '@/components/ui/loading-spinner';

export function PatientProgressDashboard() {
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  
  // @ts-ignore
  const patientSummaries = useQuery(api.therapistDashboard.getPatientProgressSummary);
  // @ts-ignore
  const completionLogs = useQuery(
    api.therapistDashboard.getPatientCompletionLogs,
    selectedPatientId ? { patientId: selectedPatientId as any, limit: 20 } : 'skip'
  );
  // @ts-ignore
  const adherenceData = useQuery(
    api.therapistDashboard.calculatePatientAdherence,
    selectedPatientId ? { patientId: selectedPatientId as any, days: 7 } : 'skip'
  );

  if (!patientSummaries) {
    return <LoadingSpinner message="Loading patient progress..." />;
  }

  // Calculate overall stats
  const totalPatients = patientSummaries.length;
  const patientsNeedingAttention = patientSummaries.filter((p: any) => p.needsAttention).length;
  const averageAdherence = totalPatients > 0
    ? Math.round(
        patientSummaries.reduce((sum: number, p: any) => sum + p.adherencePercentage, 0) /
          totalPatients
      )
    : 0;

  const getAdherenceColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600 bg-green-50 border-green-200';
    if (percentage >= 50) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getAdherenceIcon = (percentage: number) => {
    if (percentage >= 80) return <TrendingUp className="h-4 w-4" />;
    if (percentage >= 50) return <Activity className="h-4 w-4" />;
    return <TrendingDown className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Patients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalPatients}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active treatment plans
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Adherence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{averageAdherence}%</div>
            <Progress value={averageAdherence} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {patientsNeedingAttention}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              No activity in 3+ days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Patient Progress Cards */}
      <Card>
        <CardHeader>
          <CardTitle>Patient Progress Overview</CardTitle>
          <CardDescription>
            Track exercise completion and adherence for all your patients
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {patientSummaries.map((patient: any) => (
              <Card
                key={patient.patientId}
                className={`transition-all hover:shadow-md cursor-pointer ${
                  selectedPatientId === patient.patientId ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setSelectedPatientId(patient.patientId)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={patient.imageUrl} />
                        <AvatarFallback>
                          {patient.patientName
                            .split(' ')
                            .map((n: string) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{patient.patientName}</h4>
                          {patient.needsAttention && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Attention
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground text-xs">Exercises</div>
                            <div className="font-medium">{patient.totalExercises} assigned</div>
                          </div>

                          <div>
                            <div className="text-muted-foreground text-xs">This Week</div>
                            <div className="font-medium flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              {patient.completedThisWeek} completed
                            </div>
                          </div>

                          <div>
                            <div className="text-muted-foreground text-xs">Adherence</div>
                            <div
                              className={`font-medium flex items-center gap-1 ${
                                patient.adherencePercentage >= 80
                                  ? 'text-green-600'
                                  : patient.adherencePercentage >= 50
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {getAdherenceIcon(patient.adherencePercentage)}
                              {patient.adherencePercentage}%
                            </div>
                          </div>

                          <div>
                            <div className="text-muted-foreground text-xs">Last Activity</div>
                            <div className="font-medium flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {patient.lastActivityDate
                                ? `${patient.daysSinceActivity}d ago`
                                : 'Never'}
                            </div>
                          </div>
                        </div>

                        <Progress value={patient.adherencePercentage} className="h-2" />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/dashboard/physiotherapist/patients/${patient.patientId}`}>
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {patientSummaries.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No patients with active treatment plans yet</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Completion Logs */}
      {selectedPatientId && completionLogs && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Exercise completion logs for selected patient
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {completionLogs.map((log: any) => (
                <div
                  key={log._id}
                  className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50"
                >
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium">{log.exerciseName}</div>
                    <div className="text-sm text-muted-foreground">{log.planTitle}</div>
                    {log.notes && (
                      <div className="text-sm text-muted-foreground mt-1 italic">
                        "{log.notes}"
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(log.entryDate), 'MMM d, h:mm a')}
                  </div>
                </div>
              ))}

              {completionLogs.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  No exercise completions logged yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Adherence Details */}
      {selectedPatientId && adherenceData && (
        <Card>
          <CardHeader>
            <CardTitle>7-Day Adherence Analysis</CardTitle>
            <CardDescription>
              Detailed adherence metrics for the past week
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold">{adherenceData.expectedCompletions}</div>
                <div className="text-sm text-muted-foreground">Expected</div>
              </div>

              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {adherenceData.actualCompletions}
                </div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>

              <div className="text-center p-4 border rounded-lg">
                <div
                  className={`text-2xl font-bold ${
                    adherenceData.adherencePercentage >= 80
                      ? 'text-green-600'
                      : adherenceData.adherencePercentage >= 50
                      ? 'text-yellow-600'
                      : 'text-red-600'
                  }`}
                >
                  {adherenceData.adherencePercentage}%
                </div>
                <div className="text-sm text-muted-foreground">Adherence</div>
              </div>

              <div className="text-center p-4 border rounded-lg">
                <Badge
                  variant={
                    adherenceData.status === 'excellent'
                      ? 'default'
                      : adherenceData.status === 'good'
                      ? 'secondary'
                      : 'destructive'
                  }
                  className="text-sm"
                >
                  {adherenceData.status.toUpperCase()}
                </Badge>
                <div className="text-sm text-muted-foreground mt-2">Status</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
