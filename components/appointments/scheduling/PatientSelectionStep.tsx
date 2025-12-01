'use client';

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search, User } from 'lucide-react';
import { useQueryUntyped } from '@/lib/convexUntyped';
import { api } from '@/convex/_generated/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface PatientSelectionStepProps {
    onSelect: (patient: any) => void;
}

export function PatientSelectionStep({ onSelect }: PatientSelectionStepProps) {
    const [search, setSearch] = useState('');

    // Fetch patients
    const apiRoot = api as unknown as Record<string, unknown>;
    const patientsModule = apiRoot['patients'] as Record<string, unknown>;
    const getMyPatientsQuery = patientsModule['getMyPatients'];
    const patients = useQueryUntyped(getMyPatientsQuery, { limit: 100 }) as any[] | undefined;

    const filteredPatients = patients?.filter(p => {
        const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
        const email = (p.email || '').toLowerCase();
        const term = search.toLowerCase();
        return fullName.includes(term) || email.includes(term);
    });

    return (
        <div className="space-y-4 h-full flex flex-col">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                    placeholder="Search patients..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 h-12 text-lg"
                    autoFocus
                />
            </div>

            <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-2">
                {!patients ? (
                    <div className="text-center py-8 text-gray-400">Loading patients...</div>
                ) : filteredPatients?.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No patients found</div>
                ) : (
                    filteredPatients?.map((patient) => (
                        <button
                            key={patient._id}
                            onClick={() => onSelect(patient)}
                            className="w-full flex items-center gap-4 p-3 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-200 text-left group"
                        >
                            <Avatar className="h-10 w-10 border border-gray-200">
                                <AvatarImage src={patient.imageUrl} />
                                <AvatarFallback className="bg-blue-50 text-blue-600">
                                    {patient.firstName?.[0]}{patient.lastName?.[0]}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                                    {patient.firstName} {patient.lastName}
                                </p>
                                <p className="text-sm text-gray-500">{patient.email}</p>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
