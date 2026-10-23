'use client';

import React, { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, User } from '@/components/icons';

import { Skeleton } from '@/components/ui/skeleton';
import { Id } from '@/convex/_generated/dataModel';

interface PhysiotherapistSelectionStepProps {
    onSelect: (physiotherapist: { _id: Id<"users">; firstName: string; lastName: string; email: string; imageUrl?: string }) => void;
}

export function PhysiotherapistSelectionStep({ onSelect }: PhysiotherapistSelectionStepProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const staff = useQuery(api.clinics.getClinicStaff);

    const filteredStaff = staff?.filter((member: any) => {
        const fullName = `${member.user.firstName} ${member.user.lastName}`.toLowerCase();
        return fullName.includes(searchTerm.toLowerCase()) && member.role === 'physiotherapist';
    }) || [];

    if (staff === undefined) {
        return (
            <div className="space-y-4 p-1">
                <Skeleton className="h-10 w-full" />
                <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 h-full flex flex-col">
            <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900">Select Physiotherapist</h3>
                <p className="text-gray-500 text-sm">Choose who will perform the service</p>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                    placeholder="Search physiotherapists..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 -mx-2 px-2">
                {filteredStaff.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        No physiotherapists found.
                    </div>
                ) : (
                    filteredStaff.map((member: any) => (
                        <Card
                            key={member._id}
                            className="p-4 cursor-pointer hover:border-blue-500 transition-colors flex items-center gap-4"
                            onClick={() => onSelect({
                                _id: member.user._id,
                                firstName: member.user.firstName,
                                lastName: member.user.lastName,
                                email: member.user.email,
                                imageUrl: member.user.imageUrl
                            })}
                        >
                            <Avatar className="h-10 w-10">
                                <AvatarImage src={member.user.imageUrl} />
                                <AvatarFallback>{member.user.firstName[0]}{member.user.lastName[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                                <h4 className="font-medium text-gray-900">
                                    {member.user.firstName} {member.user.lastName}
                                </h4>
                                <p className="text-sm text-gray-500">{member.user.email}</p>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
