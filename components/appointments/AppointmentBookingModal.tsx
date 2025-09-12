import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, User, Wrench, MapPin, AlertCircle } from 'lucide-react';
import { format, addMinutes } from 'date-fns';
import { useResourceManagement } from '@/hooks/useResourceManagement';
import { toast } from 'sonner';
import { Id } from '@/convex/_generated/dataModel';

interface AppointmentBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (appointmentData: { patientId?: string; startTime: number; endTime: number; serviceType: string; notesForTherapist?: string; selectedResources?: string[] }) => void;
  selectedDate?: Date;
  selectedTime?: string;
  clinicId?: string;
  physiotherapistId: string;
}

export const AppointmentBookingModal: React.FC<AppointmentBookingModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  selectedDate,
  selectedTime,
  clinicId,
  physiotherapistId,
}) => {
  const [formData, setFormData] = useState({
    patientName: '',
    patientEmail: '',
    patientPhone: '',
    serviceType: '',
    duration: 60,
    date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '',
    time: selectedTime || '',
    notes: '',
    selectedResources: [] as string[],
  });

  const [showResourceConflicts, setShowResourceConflicts] = useState(false);
  const [resourceConflicts, setResourceConflicts] = useState<{ _id: string; name: string; type: string; resourceId: string; conflictTime: string; conflictReason?: string }[]>([]);

  // Get available resources for the clinic
  const { getResourcesWithAvailability, checkResourceAvailability } = useResourceManagement();
  const [clinicResources, setClinicResources] = useState<{ _id: string; name: string; type: string; description?: string; location?: string; capacity?: number; isAvailable: boolean }[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);

  // Get patients for selection - using available API with simplified typing
  // Removed unused patients variable

  useEffect(() => {
    if (selectedDate) {
      setFormData(prev => ({ ...prev, date: format(selectedDate, 'yyyy-MM-dd') }));
    }
    if (selectedTime) {
      setFormData(prev => ({ ...prev, time: selectedTime }));
    }
  }, [selectedDate, selectedTime]);

  // Load resources when modal opens and date/time are set
  useEffect(() => {
    const loadResourcesWithAvailability = async () => {
      if (!formData.date || !formData.time) return;
      if (!clinicId) {
        setClinicResources([]);
        return;
      }

      setLoadingResources(true);
      try {
        const startTime = new Date(`${formData.date}T${formData.time}`).getTime();
        const endTime = addMinutes(new Date(startTime), formData.duration).getTime();

        const resourcesWithAvailability = await getResourcesWithAvailability({
          clinicId: clinicId as Id<'clinics'>,
          startTime,
          endTime,
        });

        setClinicResources(resourcesWithAvailability || []);
      } catch (error) {
        console.error('Error loading resources:', error);
        setClinicResources([]);
      } finally {
        setLoadingResources(false);
      }
    };

    if (isOpen && formData.date && formData.time) {
      loadResourcesWithAvailability();
    }
  }, [isOpen, formData.date, formData.time, getResourcesWithAvailability, formData.duration, clinicId]);

  // Check resource availability when selected resources change
  useEffect(() => {
    const checkAvailability = async () => {
      if (!formData.date || !formData.time || formData.selectedResources.length === 0) return;

      const startTime: number = new Date(`${formData.date}T${formData.time}`).getTime();
      const endTime: number = addMinutes(new Date(startTime), formData.duration).getTime();

      const conflicts: { _id: string; name: string; type: string; resourceId: string; conflictTime: string; conflictReason?: string }[] = [];

      for (const resourceId of formData.selectedResources) {
        try {
          const isAvailable = await checkResourceAvailability({
            resourceId: resourceId as Id<'resources'>,
            startTime,
            endTime,
          });

          if (!isAvailable) {
            const resource = clinicResources.find((r: { _id: string; name: string; type: string }) => r._id === resourceId);
            if (resource) {
              conflicts.push({
                _id: resource._id,
                name: resource.name,
                type: resource.type,
                resourceId: resourceId,
                conflictTime: format(new Date(startTime), 'HH:mm'),
                conflictReason: 'Resource unavailable at this time'
              });
            }
          }
        } catch (error) {
          console.error('Error checking resource availability:', error);
        }
      }

      setResourceConflicts(conflicts);
      setShowResourceConflicts(conflicts.length > 0);
    };

    checkAvailability();
  }, [formData.selectedResources, formData.date, formData.time, formData.duration, clinicResources, checkResourceAvailability, clinicId]);

  const handleResourceToggle = (resourceId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedResources: prev.selectedResources.includes(resourceId)
        ? prev.selectedResources.filter(id => id !== resourceId)
        : [...prev.selectedResources, resourceId]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.date || !formData.time) {
      toast.error('Please select date and time');
      return;
    }

    if (resourceConflicts.length > 0) {
      toast.error('Please resolve resource conflicts before booking');
      return;
    }

    const startTime = new Date(`${formData.date}T${formData.time}`).getTime();
    const endTime = addMinutes(new Date(startTime), formData.duration).getTime();

    const appointmentData = {
      patientName: formData.patientName,
      patientEmail: formData.patientEmail,
      patientPhone: formData.patientPhone,
      serviceType: formData.serviceType,
      startTime,
      endTime,
      notesForTherapist: formData.notes,
      selectedResources: formData.selectedResources,
      clinicId,
      physiotherapistId,
    };

    try {
      await onSubmit(appointmentData);
      onClose();
      toast.success('Appointment booked successfully');
    } catch (error) {
      toast.error('Failed to book appointment');
      console.error('Booking error:', error);
    }
  };

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'equipment': return <Wrench className="h-4 w-4" />;
      case 'room': return <MapPin className="h-4 w-4" />;
      case 'staff': return <User className="h-4 w-4" />;
      default: return <MapPin className="h-4 w-4" />;
    }
  };

  const getResourceTypeColor = (type: string) => {
    switch (type) {
      case 'equipment': return 'bg-blue-100 text-blue-800';
      case 'room': return 'bg-green-100 text-green-800';
      case 'staff': return 'bg-purple-100 text-purple-800';
      case 'vehicle': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Book New Appointment
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Patient Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Patient Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="patientName">Patient Name *</Label>
                <Input
                  id="patientName"
                  value={formData.patientName}
                  onChange={(e) => setFormData(prev => ({ ...prev, patientName: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="patientEmail">Email</Label>
                <Input
                  id="patientEmail"
                  type="email"
                  value={formData.patientEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, patientEmail: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="patientPhone">Phone</Label>
                <Input
                  id="patientPhone"
                  value={formData.patientPhone}
                  onChange={(e) => setFormData(prev => ({ ...prev, patientPhone: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="serviceType">Service Type *</Label>
                <Select value={formData.serviceType} onValueChange={(value) => setFormData(prev => ({ ...prev, serviceType: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="physiotherapy">Physiotherapy</SelectItem>
                    <SelectItem value="massage">Massage Therapy</SelectItem>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="followup">Follow-up</SelectItem>
                    <SelectItem value="assessment">Assessment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Appointment Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Appointment Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="time">Time *</Label>
                <Input
                  id="time"
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Select value={formData.duration.toString()} onValueChange={(value) => setFormData(prev => ({ ...prev, duration: parseInt(value) }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                    <SelectItem value="90">90 minutes</SelectItem>
                    <SelectItem value="120">120 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Resource Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Required Resources</h3>
            {loadingResources ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600">Loading resources...</span>
              </div>
            ) : clinicResources.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {clinicResources.map((resource) => {
                  const isSelected = formData.selectedResources.includes(resource._id);
                  const isAvailable = resource.isAvailable;
                  
                  return (
                    <div
                      key={resource._id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : isAvailable
                          ? 'border-gray-200 hover:border-gray-300'
                          : 'border-red-200 bg-red-50 opacity-75'
                      }`}
                      onClick={() => isAvailable && handleResourceToggle(resource._id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getResourceIcon(resource.type)}
                          <span className={`font-medium ${
                            isAvailable ? 'text-gray-900' : 'text-red-600'
                          }`}>
                            {resource.name}
                          </span>
                          {!isAvailable && (
                            <Badge variant="destructive" className="text-xs">
                              Unavailable
                            </Badge>
                          )}
                          {isAvailable && (
                            <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                              Available
                            </Badge>
                          )}
                        </div>
                        <Badge className={getResourceTypeColor(resource.type)}>
                          {resource.type}
                        </Badge>
                      </div>
                      {resource.description && (
                        <p className="text-sm text-gray-600 mt-1">{resource.description}</p>
                      )}
                      {resource.location && (
                        <p className="text-xs text-gray-500 mt-1">📍 {resource.location}</p>
                      )}
                      {resource.capacity && (
                        <p className="text-xs text-gray-500 mt-1">👥 Capacity: {resource.capacity}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-2">No resources available for the selected time.</p>
                <p className="text-sm text-gray-400">Try selecting a different date or time.</p>
              </div>
            )}
          </div>

          {/* Resource Conflicts Warning */}
          {showResourceConflicts && resourceConflicts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-800 mb-2">
                <AlertCircle className="h-5 w-5" />
                <h4 className="font-semibold">Resource Conflicts Detected</h4>
              </div>
              <p className="text-red-700 mb-3">
                The following resources are not available at the selected time:
              </p>
              <div className="space-y-2">
                {resourceConflicts.map((resource) => (
                  <div key={resource._id} className="flex items-center justify-between p-2 bg-red-50 border border-red-200 rounded">
                    <div className="flex items-center gap-2 text-red-700">
                      {getResourceIcon(resource.type)}
                      <span className="font-medium">{resource.name}</span>
                      <Badge variant="outline" className="text-red-600 border-red-300">
                        {resource.type}
                      </Badge>
                    </div>
                    <div className="text-xs text-red-600">
                      {resource.conflictReason || 'Conflict detected'}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-red-600 text-sm mt-3">
                Please select a different time or remove conflicting resources.
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes for Therapist</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any additional notes or special requirements..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={resourceConflicts.length > 0}
              className="flex items-center gap-2"
            >
              <Clock className="h-4 w-4" />
              Book Appointment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
