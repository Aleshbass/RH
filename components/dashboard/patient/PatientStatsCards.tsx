import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Heart, Activity, CheckCircle } from '@/components/icons';
import { format } from 'date-fns';

interface PatientStatsCardsProps {
  upcomingCount: number;
  nextAppointmentDate?: number; // epoch ms
  activeTreatments: number;
  healthScore: number; // percentage 0-100
  completedSessions: number;
}

export function PatientStatsCards({
  upcomingCount,
  nextAppointmentDate,
  activeTreatments,
  healthScore,
  completedSessions,
}: PatientStatsCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {/* Upcoming */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Upcoming Appointments</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{upcomingCount}</div>
          <p className="text-xs text-muted-foreground">
            Next: {nextAppointmentDate ? format(new Date(nextAppointmentDate), 'MMM dd') : 'None scheduled'}
          </p>
        </CardContent>
      </Card>

      {/* Active treatments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Treatments</CardTitle>
          <Heart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{activeTreatments}</div>
          <p className="text-xs text-muted-foreground">Ongoing treatments</p>
        </CardContent>
      </Card>

      {/* Health score */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Health Score</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{healthScore}%</div>
          <p className="text-xs text-muted-foreground">Progress</p>
        </CardContent>
      </Card>

      {/* Completed sessions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Completed Sessions</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{completedSessions}</div>
          <p className="text-xs text-muted-foreground">Total sessions</p>
        </CardContent>
      </Card>
    </div>
  );
} 