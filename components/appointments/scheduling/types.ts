export type WizardData = {
  patientId?: string;
  patientName?: string;
  patientEmail?: string;
  physiotherapistId?: string;
  physiotherapistName?: string;
  date?: Date;
  time?: string; // HH:mm
  serviceType?: string;
  notes?: string;
  duration?: number;
  manualMeetingLink?: string;
};
