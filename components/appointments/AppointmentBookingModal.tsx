import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Clock, User, AlertCircle, Video, Check, ExternalLink } from '@/components/icons';
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
  manualMeetingLink?: string;
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
  const [step, setStep] = useState<'selection' | 'confirmation' | 'success'>('selection');
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
    manualMeetingLink: 'google_meet',
  });

  const [guests, setGuests] = useState<string[]>([]);
  const [guestInput, setGuestInput] = useState('');
  const [showGuestInput, setShowGuestInput] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  type PatientOption = { _id: string; firstName?: string; lastName?: string; email?: string; phoneNumber?: string }
  const apiRoot = api as unknown as Record<string, unknown>
  const patientsModule = apiRoot['patients'] as Record<string, unknown>
  const getMyPatientsQuery = patientsModule['getMyPatients']
  const patients = useQueryUntyped(getMyPatientsQuery, { limit: 100 }) as PatientOption[] | undefined

  useEffect(() => {
    if (isOpen) {
      setStep('selection');
      setGuests([]);
    }
  }, [isOpen]);

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

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.date || !formData.time) {
      toast.error('Please select date and time');
      return;
    }
    if (!formData.patientId) {
      toast.error('Please select a patient');
      return;
    }
    if (providerConflict) {
      toast.error('Selected time conflicts with an existing appointment.');
      return;
    }
    setStep('confirmation');
  };

  const handleAddGuest = () => {
    if (guestInput && /\S+@\S+\.\S+/.test(guestInput)) {
      setGuests([...guests, guestInput]);
      setGuestInput('');
      setShowGuestInput(false);
    } else {
      toast.error('Please enter a valid email');
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const startTime = new Date(`${formData.date}T${formData.time}`).getTime();
    const endTime = addMinutes(new Date(startTime), formData.duration).getTime();

    const appointmentData: AppointmentSubmitPayload = {
      patientId: formData.patientId,
      serviceType: formData.serviceType,
      startTime,
      endTime,
      notesForTherapist: formData.notes,
      selectedResources: formData.selectedResources,
      priority: 'low' as const,
      appointmentType: 'telehealth' as const,
      isPinned: false,
      manualMeetingLink: formData.manualMeetingLink || undefined,
    };

    try {
      setIsSubmitting(true);
      await onSubmit(appointmentData);
      setStep('success');
    } catch (error) {
      console.error('Booking error:', error);
      toast.error('Failed to book appointment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-full max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-6xl max-h-[90vh] !p-0 !gap-0 rounded-xl overflow-hidden block">
        <div className="flex flex-col lg:flex-row w-full h-full max-h-[90vh]">

          {/* LEFT COLUMN - Form/Content */}
          <div className="flex-1 flex flex-col overflow-hidden lg:w-3/5">
            {step === 'selection' ? (
              <>
                <div className="bg-gradient-to-r from-brand to-brand-dark px-6 py-5 shrink-0">
                  <DialogTitle className="flex items-center gap-3 text-white text-xl font-bold m-0 p-0">
                    <div className="bg-white/20 p-2 rounded-lg">
                      <Calendar className="h-6 w-6 text-white" />
                    </div>
                    Book Telehealth Appointment
                  </DialogTitle>
                  <p className="text-white/90 text-sm mt-2">Schedule a new appointment with your patient</p>
                </div>

                <div className="overflow-y-auto flex-1 bg-gray-50 px-6 py-6">
                  <form onSubmit={handleContinue} className="space-y-6">
                    {/* Patient Info */}
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

                    {/* Appointment Details */}
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

                    {/* Video Platform */}
                    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                      <div>
                        <Label className="text-gray-900 font-semibold text-base flex items-center gap-2 mb-3">
                          <span>📹</span> Video Platform
                        </Label>

                        <div className="grid grid-cols-2 gap-4">
                          <div
                            className={`cursor-pointer border rounded-lg p-4 flex flex-col items-center gap-2 transition-all ${!formData.manualMeetingLink ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'border-gray-200 hover:border-gray-300'
                              }`}
                            onClick={() => setFormData(prev => ({ ...prev, manualMeetingLink: '' }))}
                          >
                            <div className="bg-white p-2 rounded-full shadow-sm">
                              <Video className="w-6 h-6 text-brand" />
                            </div>
                            <span className="font-medium text-sm">Rehabify Video</span>
                          </div>

                          <div
                            className={`cursor-pointer border rounded-lg p-4 flex flex-col items-center gap-2 transition-all ${formData.manualMeetingLink === 'google_meet' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'
                              }`}
                            onClick={() => setFormData(prev => ({ ...prev, manualMeetingLink: 'google_meet' }))}
                          >
                            <div className="bg-white p-2 rounded-full shadow-sm">
                              <svg className="w-6 h-6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.05H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.95l3.66-2.84z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z" fill="#EA4335" />
                              </svg>
                            </div>
                            <span className="font-medium text-sm">Google Meet</span>
                          </div>
                        </div>

                        {formData.manualMeetingLink === 'google_meet' && (
                          <div className="mt-3 text-xs text-blue-600 bg-blue-50 p-3 rounded-md flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <p>A Google Meet link will be automatically generated and added to your Google Calendar.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Bar */}
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
                        disabled={providerConflict || !formData.patientId || !formData.date || !formData.time}
                        className="flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark text-brand-dark font-semibold px-6 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Continue
                      </Button>
                    </div>
                  </form>
                </div>
              </>
            ) : step === 'confirmation' ? (
              // CONFIRMATION STEP
              <div className="flex flex-col h-full bg-white text-gray-900">
                <div className="p-6 border-b">
                  <h2 className="text-xl font-bold">Confirm details</h2>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">
                  {/* Summary Pill */}
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      <span className="font-medium text-gray-900">{format(new Date(formData.date), 'EEEE, MMMM do, yyyy')}</span>
                    </div>
                    <span className="text-gray-300">|</span>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <span className="font-medium text-gray-900">{formData.time}</span>
                    </div>
                    <span className="text-gray-300">|</span>
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-gray-900">{formData.duration}m</span>
                    </div>
                  </div>

                  {/* Details Form */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Patient</Label>
                      <div className="p-2 border rounded-md bg-gray-50 text-gray-700">
                        {formData.patientName}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Email address</Label>
                      <div className="p-2 border rounded-md bg-gray-50 text-gray-700">
                        {formData.patientEmail}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes">Additional notes</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Notes for this appointment..."
                        rows={4}
                        className="resize-none"
                      />
                    </div>

                    {/* Add Guests */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowGuestInput(true)}
                        className="flex items-center gap-2 text-blue-600 font-medium hover:text-blue-700"
                      >
                        <User className="h-4 w-4" />
                        Add guests
                      </button>

                      {showGuestInput && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="email"
                            value={guestInput}
                            onChange={(e) => setGuestInput(e.target.value)}
                            placeholder="Guest email"
                            className="flex-1 p-2 border rounded-md text-sm"
                          />
                          <Button type="button" size="sm" onClick={handleAddGuest}>Add</Button>
                        </div>
                      )}

                      {guests.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {guests.map((guest, i) => (
                            <Badge key={i} variant="secondary" className="flex items-center gap-1">
                              {guest}
                              <button onClick={() => setGuests(guests.filter((_, idx) => idx !== i))} className="ml-1 hover:text-red-500">×</button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Google Meet Indicator */}
                    {formData.manualMeetingLink === 'google_meet' && (
                      <div className="flex items-center gap-2 pt-2">
                        <div className="bg-white p-1 rounded-full border shadow-sm">
                          <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.05H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.95l3.66-2.84z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z" fill="#EA4335" />
                          </svg>
                        </div>
                        <span className="font-medium text-gray-700">Google Meet</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6 border-t mt-auto flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep('selection')}
                    disabled={isSubmitting}
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="bg-gray-900 hover:bg-gray-800 text-white px-8"
                  >
                    {isSubmitting ? (
                      <>
                        <Clock className="h-4 w-4 mr-2 animate-spin" />
                        Confirming...
                      </>
                    ) : (
                      'Confirm'
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              // SUCCESS STEP
              <div className="flex flex-col h-full bg-white text-gray-900 items-center justify-center p-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                  <Check className="w-8 h-8 text-green-600" />
                </div>

                <h2 className="text-2xl font-bold mb-2">Meeting Scheduled</h2>
                <p className="text-gray-600 mb-8 max-w-md">
                  An email with the calendar invitation has been sent to the patient.
                </p>

                <div className="w-full max-w-md bg-gray-50 rounded-xl p-6 text-left space-y-4 mb-8">
                  <div className="grid grid-cols-[60px_1fr] gap-4">
                    <span className="font-medium text-gray-900">What</span>
                    <span className="text-gray-600">{formData.serviceType} with {formData.patientName}</span>
                  </div>

                  <div className="grid grid-cols-[60px_1fr] gap-4">
                    <span className="font-medium text-gray-900">When</span>
                    <div className="text-gray-600">
                      <div>{format(new Date(formData.date), 'EEEE, MMMM do, yyyy')}</div>
                      <div>{formData.time} ({formData.duration} mins)</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-[60px_1fr] gap-4">
                    <span className="font-medium text-gray-900">Who</span>
                    <div className="text-gray-600">
                      <div>{formData.patientName}</div>
                      <div className="text-sm text-gray-500">{formData.patientEmail}</div>
                      {guests.map((g, i) => <div key={i} className="text-sm text-gray-500">{g}</div>)}
                    </div>
                  </div>

                  {formData.manualMeetingLink === 'google_meet' && (
                    <div className="grid grid-cols-[60px_1fr] gap-4">
                      <span className="font-medium text-gray-900">Where</span>
                      <div className="flex items-center gap-1 text-gray-600">
                        <span>Google Meet</span>
                        <ExternalLink className="w-4 h-4" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-4">
                  <Button onClick={onClose} variant="outline">Close</Button>
                  <Button onClick={() => window.open('https://calendar.google.com/calendar/r', '_blank')} className="bg-gray-900 text-white hover:bg-gray-800">
                    Open Google Calendar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN - Image (Desktop Only) */}
          <div className="hidden lg:block lg:w-2/5 relative bg-gradient-to-br from-brand to-brand-dark overflow-hidden">
            <div className="absolute inset-0">
              <img
                src="/logos/images/IMG_6328_a4bxtu.webp"
                alt="Professional healthcare"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-brand/80 to-brand-dark/80"></div>
            </div>

            <div className="relative h-full flex flex-col justify-between p-8 text-white">
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
