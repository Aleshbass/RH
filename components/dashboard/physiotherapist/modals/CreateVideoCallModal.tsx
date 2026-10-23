'use client';

import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, X } from '@/components/icons';
import { DateSelectionStep } from '@/components/appointments/scheduling/DateSelectionStep';
import { TimeSelectionStep } from '@/components/appointments/scheduling/TimeSelectionStep';
import { VideoCallConfirmationStep } from './VideoCallConfirmationStep';
import { AnimatePresence, motion } from 'framer-motion';
import { WizardData } from '@/components/appointments/scheduling/SchedulingWizard';
import { Patient } from '@/app/types';

interface CreateVideoCallModalProps {
    isOpen: boolean;
    onClose: () => void;
    preselectedPatientId?: string;
}

export function CreateVideoCallModal({ isOpen, onClose, preselectedPatientId }: CreateVideoCallModalProps) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [data, setData] = useState<WizardData>({
        duration: 60,
        manualMeetingLink: '',
        serviceType: 'Telehealth Consultation'
    });

    const patients = useQuery(api.patients.getMyPatients, {}) as Patient[] | undefined;
    const me = useQuery(api.users.getMyUser);

    // Pre-fill patient data when modal opens or patientId changes
    useEffect(() => {
        if (preselectedPatientId && patients) {
            const patient = patients.find(p => p._id === preselectedPatientId);
            if (patient) {
                setData(prev => ({
                    ...prev,
                    patientId: patient._id,
                    patientName: `${patient.firstName} ${patient.lastName}`,
                    patientEmail: patient.email
                }));
            }
        }
    }, [preselectedPatientId, patients, isOpen]);

    const handleNext = () => setStep((s) => Math.min(s + 1, 3) as any);
    const handleBack = () => setStep((s) => Math.max(s - 1, 1) as any);

    const updateData = (updates: Partial<WizardData>) => {
        setData((prev) => ({ ...prev, ...updates }));
    };

    const handleClose = () => {
        setStep(1);
        setData(prev => ({
            ...prev,
            date: undefined,
            time: undefined,
            notes: undefined
        }));
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden bg-white rounded-xl h-[600px] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        {step > 1 && (
                            <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        )}
                        <DialogTitle className="text-lg font-semibold text-gray-900">
                            {step === 1 && 'Select Date'}
                            {step === 2 && 'Select Time'}
                            {step === 3 && 'Confirm Details'}
                        </DialogTitle>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Progress Bar */}
                <div className="h-1 bg-gray-100 w-full">
                    <div
                        className="h-full bg-[#005b57] transition-all duration-300 ease-in-out"
                        style={{ width: `${(step / 3) * 100}%` }}
                    />
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 relative">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={step}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={{ duration: 0.2 }}
                            className="h-full"
                        >
                            {step === 1 && (
                                <DateSelectionStep
                                    selectedDate={data.date}
                                    onSelect={(date) => {
                                        updateData({ date });
                                        handleNext();
                                    }}
                                />
                            )}
                            {step === 2 && (
                                <TimeSelectionStep
                                    selectedDate={data.date!}
                                    selectedTime={data.time}
                                    duration={data.duration || 60}
                                    physiotherapistId={me?._id || ''}
                                    onSelect={(time) => {
                                        updateData({ time });
                                        handleNext();
                                    }}
                                />
                            )}
                            {step === 3 && (
                                <VideoCallConfirmationStep
                                    data={data}
                                    onUpdate={updateData}
                                    onSuccess={() => {
                                        // Success is handled within the step (showing success screen)
                                        // But if we wanted to close automatically after some time, we could do it here
                                        // For now, the user clicks "Close" in the step
                                        handleClose();
                                    }}
                                />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </DialogContent>
        </Dialog>
    );
}
