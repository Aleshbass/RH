'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Calendar, Clock, User, X } from 'lucide-react';
import { format } from 'date-fns';

interface ConflictingAppointment {
  patientName?: string;
  serviceType?: string;
  startTime: number;
  endTime: number;
}

interface TimeConflictModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflictingAppointment?: ConflictingAppointment;
  requestedStartTime: number;
  requestedEndTime: number;
  onChooseDifferentTime: () => void;
  onCancel: () => void;
}

export function TimeConflictModal({
  open,
  onOpenChange,
  conflictingAppointment,
  requestedStartTime,
  requestedEndTime,
  onChooseDifferentTime,
  onCancel,
}: TimeConflictModalProps) {
  const formatTime = (timestamp: number) => {
    return format(new Date(timestamp), 'h:mm a');
  };

  const formatDate = (timestamp: number) => {
    return format(new Date(timestamp), 'EEEE, MMMM d, yyyy');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-orange-500 via-red-500 to-pink-500 p-6 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 backdrop-blur-sm p-3 rounded-full">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold text-white mb-1">
                  Time Slot Conflict
                </DialogTitle>
                <DialogDescription className="text-white/90 text-sm">
                  This time slot is already booked
                </DialogDescription>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Requested Time */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              Requested Time Slot
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-gray-900">
                  {formatDate(requestedStartTime)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="ml-6 text-sm">
                  <span className="font-bold text-blue-600">
                    {formatTime(requestedStartTime)}
                  </span>
                  <span className="text-gray-600 mx-2">→</span>
                  <span className="font-bold text-blue-600">
                    {formatTime(requestedEndTime)}
                  </span>
                  <span className="text-gray-600 ml-2">
                    ({Math.round((requestedEndTime - requestedStartTime) / (1000 * 60))} min)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Conflicting Appointment */}
          {conflictingAppointment && (
            <div className="bg-gradient-to-br from-red-50 to-pink-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                Existing Appointment
              </h3>
              <div className="space-y-2">
                {conflictingAppointment.patientName && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-red-600" />
                    <span className="font-medium text-gray-900">
                      {conflictingAppointment.patientName}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-red-600" />
                  <span className="font-medium text-gray-900">
                    {formatTime(conflictingAppointment.startTime)}
                  </span>
                  <span className="text-gray-600">→</span>
                  <span className="font-medium text-gray-900">
                    {formatTime(conflictingAppointment.endTime)}
                  </span>
                </div>
                {conflictingAppointment.serviceType && (
                  <div className="ml-6 text-sm text-gray-600">
                    Service: {conflictingAppointment.serviceType}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Helper Message */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-900">
              <strong>💡 Tip:</strong> Choose a different time slot to avoid scheduling conflicts. 
              You can also check the calendar to see all available times.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              onClick={onChooseDifferentTime}
              className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
              size="lg"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Choose Different Time
            </Button>
            <Button
              onClick={onCancel}
              variant="outline"
              className="flex-1"
              size="lg"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
