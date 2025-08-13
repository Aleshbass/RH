import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, MapPin, User, Wrench, AlertTriangle, CheckCircle } from 'lucide-react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { useResourceManagement } from '@/hooks/useResourceManagement';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

interface CalendarResourceViewProps {
  clinicId: string;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

interface ResourceBooking {
  _id: string;
  resourceId: string;
  startTime: number;
  endTime: number;
  appointmentId?: string;
  bookedBy: string;
  purpose: string;
  status: 'active' | 'completed' | 'cancelled';
}

interface Resource {
  _id: Id<'resources'>;
  clinicId: Id<'clinics'>;
  name: string;
  type: 'equipment' | 'room' | 'staff' | 'vehicle';
  description?: string;
  location?: string;
  isActive: boolean;
  operatingHours?: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }[];
  maintenanceSchedule?: {
    startTime: string;
    endTime: string;
    description?: string;
    status?: string;
  }[];
  tags?: string[];
  capacity?: number;
  createdAt: number;
  updatedAt: number;
}

export const CalendarResourceView: React.FC<CalendarResourceViewProps> = ({
  clinicId,
  selectedDate,
}) => {
  const [selectedResourceType, setSelectedResourceType] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'day' | 'week'>('week');

  // Get resources and bookings
  const {} = useResourceManagement();
  const allResources = useQuery(api.resourceManagement.getResources, { clinicId }) as Resource[] | undefined;
  const clinicResources = allResources?.filter((resource: Resource) => 
    resource.clinicId === clinicId && resource.isActive
  ) || [];

  // Filter resources by type
  const filteredResources = selectedResourceType === 'all' 
    ? clinicResources 
    : clinicResources.filter((resource: Resource) => resource.type === selectedResourceType);

  // Get resource bookings for the selected period
  const startDate = viewMode === 'week' ? startOfWeek(selectedDate) : selectedDate;
  const endDate = viewMode === 'week' ? endOfWeek(selectedDate) : selectedDate;
  
  const resourceBookings = useQuery(api.resourceManagement.getBookings, {
    clinicId,
    startTime: startDate.getTime(),
    endTime: endDate.getTime(),
  }) as ResourceBooking[] | undefined;

  // Get unique resource types
  const resourceTypes = [...new Set(clinicResources.map((r: Resource) => r.type))];

  // Generate time slots (8 AM to 8 PM in 30-minute intervals)
  const timeSlots = Array.from({ length: 24 }, (_, i) => {
    const hour = Math.floor(8 + i * 0.5);
    const minute = (i % 2) * 30;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  });

  // Generate days for the view
  const days = viewMode === 'week' 
    ? eachDayOfInterval({ start: startDate, end: endDate })
    : [selectedDate];

  const getResourceIcon = (type: Resource['type']) => {
    switch (type) {
      case 'equipment': return <Wrench className="h-4 w-4" />;
      case 'room': return <MapPin className="h-4 w-4" />;
      case 'staff': return <User className="h-4 w-4" />;
      case 'vehicle': return <MapPin className="h-4 w-4" />;
      default: return <MapPin className="h-4 w-4" />;
    }
  };

  const getResourceTypeColor = (type: Resource['type']) => {
    switch (type) {
      case 'equipment': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'room': return 'bg-green-100 text-green-800 border-green-200';
      case 'staff': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'vehicle': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getBookingForResourceAndTime = (resourceId: string, day: Date, timeSlot: string) => {
    if (!resourceBookings) return null;

    const [hours, minutes] = timeSlot.split(':').map(Number);
    const slotStart = new Date(day);
    slotStart.setHours(hours, minutes, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000); // 30 minutes later

    return resourceBookings.find(booking => 
      booking.resourceId === resourceId &&
      booking.startTime < slotEnd.getTime() &&
      booking.endTime > slotStart.getTime()
    );
  };

  const isResourceInMaintenance = (resource: Resource, day: Date, timeSlot: string) => {
    if (!resource.maintenanceSchedule || resource.maintenanceSchedule.length === 0) return false;

    const [hours, minutes] = timeSlot.split(':').map(Number);
    const slotTime = new Date(day);
    slotTime.setHours(hours, minutes, 0, 0);

    return resource.maintenanceSchedule.some((maintenance) => {
      const maintenanceStart = new Date(maintenance.startTime);
      const maintenanceEnd = new Date(maintenance.endTime);
      return slotTime >= maintenanceStart && slotTime <= maintenanceEnd;
    });
  };

  const isResourceOperating = (resource: Resource, day: Date, timeSlot: string) => {
    if (!resource.operatingHours || resource.operatingHours.length === 0) return true;

    const dayOfWeek = day.getDay();
    const daySchedule = resource.operatingHours.find((schedule) => schedule.dayOfWeek === dayOfWeek);
    
    if (!daySchedule || !daySchedule.isAvailable) return false;

    const [hours, minutes] = timeSlot.split(':').map(Number);
    const slotTime = hours * 60 + minutes;
    
    const [startHours, startMinutes] = daySchedule.startTime.split(':').map(Number);
    const [endHours, endMinutes] = daySchedule.endTime.split(':').map(Number);
    
    const startTime = startHours * 60 + startMinutes;
    const endTime = endHours * 60 + endMinutes;

    return slotTime >= startTime && slotTime < endTime;
  };

  const getSlotStatus = (resource: Resource, day: Date, timeSlot: string) => {
    const booking = getBookingForResourceAndTime(resource._id, day, timeSlot);
    const inMaintenance = isResourceInMaintenance(resource, day, timeSlot);
    const isOperating = isResourceOperating(resource, day, timeSlot);

    if (inMaintenance) return 'maintenance';
    if (!isOperating) return 'closed';
    if (booking) return booking.status;
    return 'available';
  };

  const getSlotColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-red-100 border-red-300 text-red-800';
      case 'completed': return 'bg-gray-100 border-gray-300 text-gray-600';
      case 'cancelled': return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'maintenance': return 'bg-orange-100 border-orange-300 text-orange-800';
      case 'closed': return 'bg-gray-50 border-gray-200 text-gray-400';
      case 'available': return 'bg-green-50 border-green-200 text-green-700';
      default: return 'bg-white border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Clock className="h-3 w-3" />;
      case 'completed': return <CheckCircle className="h-3 w-3" />;
      case 'maintenance': return <AlertTriangle className="h-3 w-3" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'day' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('day')}
          >
            Day View
          </Button>
          <Button
            variant={viewMode === 'week' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('week')}
          >
            Week View
          </Button>
        </div>

        <div className="flex gap-2">
          <Select value={selectedResourceType} onValueChange={setSelectedResourceType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Resources</SelectItem>
              {resourceTypes.map((type: string) => (
                <SelectItem key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Legend */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-50 border border-green-200 rounded"></div>
              <span>Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
              <span>Booked</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-100 border border-orange-300 rounded"></div>
              <span>Maintenance</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-50 border border-gray-200 rounded"></div>
              <span>Closed</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resource Schedule Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Resource Schedule - {format(selectedDate, 'MMMM yyyy')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredResources.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No resources found for the selected criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-full">
                {/* Header */}
                <div className="grid grid-cols-1 gap-4">
                  <div className={`grid gap-2 ${viewMode === 'week' ? 'grid-cols-8' : 'grid-cols-2'}`}>
                    <div className="font-semibold p-2">Resource</div>
                    {days.map(day => (
                      <div key={day.toISOString()} className="font-semibold p-2 text-center">
                        {format(day, viewMode === 'week' ? 'EEE MMM d' : 'EEEE, MMMM d')}
                      </div>
                    ))}
                  </div>

                  {/* Resource Rows */}
                  {filteredResources.map((resource: Resource) => (
                    <div key={resource._id} className="border-t pt-4">
                      <div className={`grid gap-2 ${viewMode === 'week' ? 'grid-cols-8' : 'grid-cols-2'}`}>
                        {/* Resource Info */}
                        <div className="p-2">
                          <div className="flex items-center gap-2 mb-1">
                            {getResourceIcon(resource.type)}
                            <span className="font-medium">{resource.name}</span>
                          </div>
                          <Badge className={getResourceTypeColor(resource.type)}>
                            {resource.type}
                          </Badge>
                          {resource.location && (
                            <p className="text-xs text-gray-500 mt-1">📍 {resource.location}</p>
                          )}
                        </div>

                        {/* Daily Schedules */}
                        {days.map(day => (
                          <div key={`${resource._id}-${day.toISOString()}`} className="p-2">
                            <div className="grid grid-cols-2 gap-1">
                              {timeSlots.slice(0, 12).map(timeSlot => {
                                const status = getSlotStatus(resource, day, timeSlot);
                                const booking = getBookingForResourceAndTime(resource._id, day, timeSlot);
                                
                                return (
                                  <div
                                    key={timeSlot}
                                    className={`text-xs p-1 rounded border text-center ${getSlotColor(status)}`}
                                    title={booking ? `${booking.purpose} (${booking.bookedBy})` : `${timeSlot} - ${status}`}
                                  >
                                    <div className="flex items-center justify-center gap-1">
                                      {getStatusIcon(status)}
                                      <span>{timeSlot}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
