'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Video, Calendar, Clock, Copy, Users, PlayCircle, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Id } from '@/convex/_generated/dataModel';
import VideoCallManager from '@/components/video/VideoCallManager';

// Type definition for video calls
type VideoCall = {
  _id: Id<"videoCalls">;
  roomId: string;
  title?: string;
  patientId?: Id<"users">;
  physiotherapistId?: Id<"users">;
  scheduledAt?: number;
  startTime: number;
  endTime?: number;
  status: "scheduled" | "active" | "ended" | "cancelled" | "missed";
  callType: "appointment" | "consultation" | "emergency";
  duration?: number;
  participants: Id<"users">[];
  physiotherapist?: unknown;
  appointmentId?: Id<"appointments">;
};

export default function PatientVideoCallsPage() {
  const [showVideoManager, setShowVideoManager] = useState(false);
  const [selectedCall, setSelectedCall] = useState<VideoCall | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Fetch current user data
  const currentUser = useQuery(api.users.getMyUser);
  
  // Fetch patient's video calls
  const allVideoCalls = useQuery(api.videoCalls.getMyVideoCalls, {});

  if (!currentUser) {
    return (
      <div className="p-6">
        <div className="space-y-6">
          <Skeleton className="h-12 w-[250px]" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-[180px]" />
            <Skeleton className="h-[180px]" />
            <Skeleton className="h-[180px]" />
          </div>
        </div>
      </div>
    );
  }

  const videoCalls = allVideoCalls || [];

  // Filter video calls based on search and status
  const filteredCalls = videoCalls.filter((call: { title?: string; physiotherapist?: { firstName?: string; lastName?: string }; status: string }) => {
    const matchesSearch = !searchTerm || 
      call.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.physiotherapist?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.physiotherapist?.lastName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || call.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Separate calls by status for better organization
  const upcomingCalls = filteredCalls.filter((call: { status: string }) => call.status === 'scheduled');
  const activeCalls = filteredCalls.filter((call: { status: string }) => call.status === 'active');
  const pastCalls = filteredCalls.filter((call: { status: string }) => ['ended', 'cancelled', 'missed'].includes(call.status));

  const handleJoinCall = (call: VideoCall) => {
    setSelectedCall(call);
    setShowVideoManager(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'ended': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'missed': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'appointment': return 'bg-blue-100 text-blue-800';
      case 'consultation': return 'bg-purple-100 text-purple-800';
      case 'emergency': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (showVideoManager && selectedCall) {
    return (
      <VideoCallManager
        appointmentId={selectedCall.appointmentId}
        defaultParticipants={selectedCall.participants}
        onCallEnd={() => {
          setShowVideoManager(false);
          setSelectedCall(null);
        }}
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Video Calls</h1>
          <p className="text-gray-500">Your telehealth appointments and consultations</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Input
                placeholder="Search calls..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <select 
                className="w-full p-2 border rounded-md"
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="scheduled">Scheduled</option>
                <option value="active">Active</option>
                <option value="ended">Ended</option>
                <option value="cancelled">Cancelled</option>
                <option value="missed">Missed</option>
              </select>
            </div>
            <div className="flex items-center">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Calls</p>
                <p className="text-2xl font-bold">{videoCalls.length}</p>
              </div>
              <Video className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Now</p>
                <p className="text-2xl font-bold text-green-600">{activeCalls.length}</p>
              </div>
              <PlayCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Upcoming</p>
                <p className="text-2xl font-bold text-blue-600">{upcomingCalls.length}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Completed</p>
                <p className="text-2xl font-bold text-gray-600">
                  {videoCalls.filter((c: { status: string }) => c.status === 'ended').length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-gray-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Calls Section */}
      {activeCalls.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-green-600">🟢 Active Calls - Join Now!</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeCalls.map((call: { _id: string; callType: string; title?: string; physiotherapist?: { firstName?: string; lastName?: string }; startTime: number }) => (
              <Card key={call._id} className="border-green-200 bg-green-50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge className="bg-green-100 text-green-800 animate-pulse">
                      LIVE
                    </Badge>
                    <Badge className={getTypeColor(call.callType)}>
                      {call.callType}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">
                    {call.title || `${call.callType} Call`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {call.physiotherapist && (
                      <div className="flex items-center text-sm">
                        <Users className="h-4 w-4 mr-2 text-gray-500" />
                        Dr. {call.physiotherapist.firstName} {call.physiotherapist.lastName}
                      </div>
                    )}
                    <div className="flex items-center text-sm text-gray-500">
                      <Clock className="h-4 w-4 mr-2" />
                      Started: {format(new Date(call.startTime), 'p')}
                    </div>
                    
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700"
                      onClick={() => handleJoinCall(call)}
                    >
                      <Video className="h-4 w-4 mr-2" />
                      Join Call Now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Calls Section */}
      {upcomingCalls.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-blue-600">📅 Upcoming Calls</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {upcomingCalls.map((call: { _id: string; status: string; callType: string; title?: string; physiotherapist?: { firstName?: string; lastName?: string }; scheduledAt?: number; roomId: string }) => (
              <Card key={call._id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge className={getStatusColor(call.status)}>
                      {call.status}
                    </Badge>
                    <Badge className={getTypeColor(call.callType)}>
                      {call.callType}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">
                    {call.title || `${call.callType} Call`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {call.physiotherapist && (
                      <div className="flex items-center text-sm">
                        <Users className="h-4 w-4 mr-2 text-gray-500" />
                        Dr. {call.physiotherapist.firstName} {call.physiotherapist.lastName}
                      </div>
                    )}
                    <div className="flex items-center text-sm text-gray-500">
                      <Calendar className="h-4 w-4 mr-2" />
                      {call.scheduledAt && format(new Date(call.scheduledAt), 'PPP')}
                    </div>
                    <div className="flex items-center text-sm text-gray-500">
                      <Clock className="h-4 w-4 mr-2" />
                      {call.scheduledAt && format(new Date(call.scheduledAt), 'p')}
                    </div>
                    
                    <div className="flex space-x-2 mt-4">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(call.roomId);
                          toast.success('Room ID copied');
                        }}
                        title="Copy Room ID"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => handleJoinCall(call)}
                        disabled={call.status !== 'scheduled'}
                      >
                        <Video className="h-4 w-4 mr-2" />
                        Prepare to Join
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Past Calls Section */}
      {pastCalls.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-600">📚 Call History</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pastCalls.slice(0, 6).map((call: { _id: string; status: string; callType: string; title?: string; physiotherapist?: { firstName?: string; lastName?: string }; startTime: number; endTime?: number; duration?: number }) => (
              <Card key={call._id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge className={getStatusColor(call.status)}>
                      {call.status}
                    </Badge>
                    <Badge className={getTypeColor(call.callType)}>
                      {call.callType}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">
                    {call.title || `${call.callType} Call`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {call.physiotherapist && (
                      <div className="flex items-center text-sm">
                        <Users className="h-4 w-4 mr-2 text-gray-500" />
                        Dr. {call.physiotherapist.firstName} {call.physiotherapist.lastName}
                      </div>
                    )}
                    <div className="flex items-center text-sm text-gray-500">
                      <Calendar className="h-4 w-4 mr-2" />
                      {format(new Date(call.startTime), 'PPP')}
                    </div>
                    <div className="flex items-center text-sm text-gray-500">
                      <Clock className="h-4 w-4 mr-2" />
                      {format(new Date(call.startTime), 'p')}
                      {call.duration && ` (${Math.round(call.duration / 60)}m)`}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {pastCalls.length > 6 && (
            <div className="text-center">
              <Button variant="outline">
                View All History ({pastCalls.length} total)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {filteredCalls.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Video className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No video calls found</h3>
            <p className="text-gray-500 mb-4">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your filters to see more results.' 
                : 'You don\'t have any video calls scheduled yet. Your physiotherapist will schedule video sessions for you.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 