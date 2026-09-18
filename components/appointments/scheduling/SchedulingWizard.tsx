'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, X } from 'lucide-react';
import { PhysiotherapistSelectionStep } from './PhysiotherapistSelectionStep';
import { PatientSelectionStep } from './PatientSelectionStep';
import { DateSelectionStep } from './DateSelectionStep';
import { TimeSelectionStep } from './TimeSelectionStep';
import { ConfirmationStep } from './ConfirmationStep';
import { AnimatePresence, motion } from 'framer-motion';

interface SchedulingWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
    physiotherapistId?: string; // Optional now
}

import { WizardData } from './types';
export type { WizardData } from './types';

export function SchedulingWizard({ isOpen, onClose, onComplete, physiotherapistId }: SchedulingWizardProps) {
    // If physiotherapistId is provided, start at step 1 (Patient), else step 0 (Physio)
    const initialStep = physiotherapistId ? 1 : 0;
    const [step, setStep] = useState<number>(initialStep);

    // Initialize data with provided physio ID if available
    const [data, setData] = useState<WizardData>({
        duration: 60,
        manualMeetingLink: 'google_meet',
        physiotherapistId: physiotherapistId
    });

    // Reset step when opening
    React.useEffect(() => {
        if (isOpen) {
            setStep(physiotherapistId ? 1 : 0);
            setData(prev => ({ ...prev, physiotherapistId: physiotherapistId }));
        }
    }, [isOpen, physiotherapistId]);

    const handleNext = () => setStep((s) => Math.min(s + 1, 4));
    const handleBack = () => setStep((s) => Math.max(s - 1, physiotherapistId ? 1 : 0));

    const updateData = (updates: Partial<WizardData>) => {
        setData((prev) => ({ ...prev, ...updates }));
    };

    const handleClose = () => {
        setStep(physiotherapistId ? 1 : 0);
        setData({ duration: 60, physiotherapistId: physiotherapistId });
        onClose();
    };

    // Use the selected physio ID or the prop
    const activePhysiotherapistId = data.physiotherapistId || physiotherapistId || '';

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden bg-white rounded-xl h-[600px] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        {step > (physiotherapistId ? 1 : 0) && (
                            <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        )}
                        <DialogTitle className="text-lg font-semibold text-gray-900">
                            {step === 0 && 'Select Physiotherapist'}
                            {step === 1 && 'Select Patient'}
                            {step === 2 && 'Select Date'}
                            {step === 3 && 'Select Time'}
                            {step === 4 && 'Confirm Details'}
                        </DialogTitle>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Progress Bar */}
                <div className="h-1 bg-gray-100 w-full">
                    <div
                        className="h-full bg-blue-600 transition-all duration-300 ease-in-out"
                        style={{ width: `${((step + (physiotherapistId ? 0 : 1)) / 5) * 100}%` }}
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
                            {step === 0 && (
                                <PhysiotherapistSelectionStep
                                    onSelect={(physio) => {
                                        updateData({
                                            physiotherapistId: physio._id,
                                            physiotherapistName: `${physio.firstName} ${physio.lastName}`
                                        });
                                        handleNext();
                                    }}
                                />
                            )}
                            {step === 1 && (
                                <PatientSelectionStep
                                    onSelect={(patient) => {
                                        updateData({
                                            patientId: patient._id,
                                            patientName: `${patient.firstName} ${patient.lastName}`,
                                            patientEmail: patient.email
                                        });
                                        handleNext();
                                    }}
                                />
                            )}
                            {step === 2 && (
                                <DateSelectionStep
                                    selectedDate={data.date}
                                    onSelect={(date) => {
                                        updateData({ date });
                                        handleNext();
                                    }}
                                />
                            )}
                            {step === 3 && (
                                <TimeSelectionStep
                                    selectedDate={data.date!}
                                    selectedTime={data.time}
                                    duration={data.duration || 60}
                                    physiotherapistId={activePhysiotherapistId}
                                    onSelect={(time) => {
                                        updateData({ time });
                                        handleNext();
                                    }}
                                />
                            )}
                            {step === 4 && (
                                <ConfirmationStep
                                    data={data}
                                    onUpdate={updateData}
                                    onConfirm={async () => {
                                        // Logic to be passed from parent or handled here
                                    }}
                                    onSuccess={() => {
                                        onComplete();
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
