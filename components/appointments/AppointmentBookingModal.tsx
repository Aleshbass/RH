import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Clock, User, AlertCircle } from 'lucide-react';
import { format, addMinutes } from 'date-fns';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import { useQueryUntyped } from '@/lib/convexUntyped';

// Payload expected by onSubmit
type AppointmentSubmitPayload = {
  patientId?: string;
  startTime: number;
  endTime: number;
  serviceType: string;
  notesForTherapist?: string;
  selectedResources?: string[];
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  appointmentType?: 'in-person' | 'telehealth';
  isPinned?: boolean;
  colorCode?: string;
};

interface AppointmentBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (appointmentData: AppointmentSubmitPayload) => void;
  selectedDate?: Date;
  selectedTime?: string;
  clinicId?: string;
  physiotherapistId: string;
  existingAppointments?: { startTime: number; endTime: number; status?: string }[];
  providerScheduleReady?: boolean;
}

export const AppointmentBookingModal: React.FC<AppointmentBookingModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  selectedDate,
  selectedTime,
  clinicId,
  physiotherapistId,
  existingAppointments,
  providerScheduleReady: _scheduleReadyProp,
}) => {
  const [formData, setFormData] = useState({
    patientId: '',
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

  const [isSubmitting, setIsSubmitting] = useState(false);

  type PatientOption = { _id: string; firstName?: string; lastName?: string; email?: string; phoneNumber?: string }
  const apiRoot = api as unknown as Record<string, unknown>
  const patientsModule = apiRoot['patients'] as Record<string, unknown>
  const getMyPatientsQuery = patientsModule['getMyPatients']
  const patients = useQueryUntyped(getMyPatientsQuery, { limit: 100 }) as PatientOption[] | undefined

  useEffect(() => {
    if (selectedDate) {
      setFormData(prev => ({ ...prev, date: format(selectedDate, 'yyyy-MM-dd') }));
    }
    if (selectedTime) {
      setFormData(prev => ({ ...prev, time: selectedTime }));
    }
  }, [selectedDate, selectedTime]);

  useEffect(() => {
    if (formData.patientId && patients) {
      const selectedPatient = patients.find(p => p._id === formData.patientId);
      if (selectedPatient) {
        setFormData(prev => ({
          ...prev,
          patientName: `${selectedPatient.firstName || ''} ${selectedPatient.lastName || ''}`.trim(),
          patientEmail: selectedPatient.email || '',
          patientPhone: selectedPatient.phoneNumber || '',
        }));
      }
    }
  }, [formData.patientId, patients]);

  // Compute provider time conflicts based on existing appointments
  const startTimeMs = formData.date && formData.time ? new Date(`${formData.date}T${formData.time}`).getTime() : null;
  const endTimeMs = startTimeMs ? addMinutes(new Date(startTimeMs), formData.duration).getTime() : null;
  const providerConflict = !!(startTimeMs && endTimeMs && (existingAppointments || []).some((a: any) => {
    if (a.status === 'cancelled_by_patient' || a.status === 'cancelled_by_therapist') return false;
    return (
      (startTimeMs >= a.startTime && startTimeMs < a.endTime) ||
      (endTimeMs > a.startTime && endTimeMs <= a.endTime) ||
      (startTimeMs <= a.startTime && endTimeMs >= a.endTime)
    );
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return; // prevent double submit

    if (!formData.date || !formData.time) {
      toast.error('Please select date and time');
      return;
    }

    if (!formData.patientId) {
      toast.error('Please select a patient');
      return;
    }

    // Proceed even if provider schedule hasn't fully loaded; server-side will validate conflicts.

    const startTime = new Date(`${formData.date}T${formData.time}`).getTime();
    const endTime = addMinutes(new Date(startTime), formData.duration).getTime();

    if (providerConflict) {
      toast.error('Selected time conflicts with an existing appointment. Please choose a different time.');
      return;
    }

    // Note: resource conflicts feature removed in this design iteration

    const appointmentData: AppointmentSubmitPayload = {
      patientId: formData.patientId,
      serviceType: formData.serviceType,
      startTime,
      endTime,
      notesForTherapist: formData.notes,
      selectedResources: formData.selectedResources,
      priority: 'low' as 'low',
      appointmentType: 'telehealth' as 'telehealth',
      isPinned: false,
    };

    try {
      setIsSubmitting(true);
      await onSubmit(appointmentData);
      // Success toast is handled by parent onSubmit caller to avoid duplicates
    } catch (error) {
      // Error toast is handled by parent; keep this as a fallback only
      console.error('Booking error:', error);
      toast.error('Failed to book appointment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-full max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-6xl max-h-[90vh] !p-0 !gap-0 rounded-xl overflow-hidden block">
        {/* Two-column layout: Form on left, Image on right (desktop only) */}
        <div className="flex flex-col lg:flex-row w-full h-full max-h-[90vh]">
          
          {/* LEFT COLUMN - Form */}
          <div className="flex-1 flex flex-col overflow-hidden lg:w-3/5">
            {/* Modern Header */}
            <div className="bg-gradient-to-r from-brand to-brand-dark px-6 py-5 shrink-0">
              <DialogTitle className="flex items-center gap-3 text-white text-xl font-bold m-0 p-0">
                <div className="bg-white/20 p-2 rounded-lg">
                  <Calendar className="h-6 w-6 text-white" />
                </div>
                Book Telehealth Appointment
              </DialogTitle>
              <p className="text-white/90 text-sm mt-2">Schedule a new appointment with your patient</p>
            </div>

            {/* Scrollable Content Area */}
            <div className="overflow-y-auto flex-1 bg-gray-50 px-6 py-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-3">
                    <div className="bg-brand/10 p-2 rounded-lg">
                      <User className="h-5 w-5 text-brand" />
                    </div>
                    Patient Information
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="patientSelect">Patient *</Label>
                    <Select value={formData.patientId} onValueChange={(value) => setFormData(prev => ({ ...prev, patientId: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select existing patient" />
                      </SelectTrigger>
                      <SelectContent>
                        {(patients || []).map((p) => (
                          <SelectItem key={p._id} value={p._id}>
                            {(p.firstName || '') + ' ' + (p.lastName || '')} {p.email ? `(${p.email})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
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

                <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-3">
                    <div className="bg-brand/10 p-2 rounded-lg">
                      <Clock className="h-5 w-5 text-brand" />
                    </div>
                    Appointment Details
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

                  {providerConflict && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5" />
                      <div className="text-sm text-amber-800">
                        <p className="font-medium">Time conflict with an existing appointment.</p>
                        <p>Pick a different time or duration.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                  <Label htmlFor="notes" className="text-gray-900 font-semibold text-base">Notes for Therapist</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Any additional notes or special requirements..."
                    rows={3}
                    className="mt-2 focus:border-brand focus:ring-brand border-gray-300"
                  />
                </div>

                {/* Action Bar - scrolls with content, not fixed */}
                <div className="-mx-6 mt-6 px-6 pt-4 pb-4 bg-white border-t border-gray-100 flex flex-col sm:flex-row justify-end gap-3">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={onClose} 
                    className="w-full sm:w-auto border-gray-300 hover:bg-gray-50 text-gray-700 font-medium cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={providerConflict || !formData.patientId || !formData.date || !formData.time || isSubmitting}
                    className="flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark text-brand-dark font-semibold px-6 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Clock className="h-5 w-5" />
                    {isSubmitting ? 'Booking…' : 'Book Appointment'}
                  </Button>
                </div>
              </form>
            </div>
          </div>

          {/* RIGHT COLUMN - Image (Desktop Only) */}
          <div className="hidden lg:block lg:w-2/5 relative bg-gradient-to-br from-brand to-brand-dark overflow-hidden">
            {/* Image with overlay */}
            <div className="absolute inset-0">
              <img 
                src="/logos/images/IMG_6328_a4bxtu.webp" 
                alt="Professional healthcare" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-brand/80 to-brand-dark/80"></div>
            </div>
            
            <div className="relative h-full flex flex-col justify-between p-8 text-white">
              {/* Top Section - Decorative */}
              <div className="space-y-6">
                <div className="inline-block bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium">
                  ⚡ Quick & Easy Booking
                </div>
                <h2 className="text-3xl font-bold leading-tight tracking-tight text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">
                  Seamless Appointment Scheduling
                </h2>
                <p className="text-white/95 text-lg leading-relaxed drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">
                  Book appointments with your patients in seconds. Our streamlined process ensures efficient practice management.
                </p>
              </div>

              {/* Middle Section - Features */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="bg-white/20 p-2 rounded-lg mt-1">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">Smart Scheduling</h4>
                    <p className="text-sm text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">Automatic conflict detection and resource management</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-white/20 p-2 rounded-lg mt-1">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">Patient Management</h4>
                    <p className="text-sm text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">Access patient info and history instantly</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-white/20 p-2 rounded-lg mt-1">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">Real-Time Updates</h4>
                    <p className="text-sm text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">Instant notifications and calendar sync</p>
                  </div>
                </div>
              </div>

              {/* Bottom - Logo or branding space */}
              <div className="flex items-center justify-center opacity-30">
                <Calendar className="h-20 w-20" />
              </div>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};
