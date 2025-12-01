'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Loader2, Stethoscope } from 'lucide-react'

export default function MyPhysiotherapistPage() {
    const router = useRouter()
    const careTeam = useQuery(api.patients.getPatientCareTeam)

    useEffect(() => {
        // If there's only one physiotherapist, redirect to their dynamic page automatically
        if (careTeam && careTeam.length === 1 && careTeam[0].physiotherapist?._id) {
            router.push(`/dashboard/patient/my-physiotherapist/${careTeam[0].physiotherapist._id}`)
        }
    }, [careTeam, router])

    if (careTeam === undefined) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        )
    }

    if (careTeam.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                <div className="p-4 bg-gray-100 rounded-full">
                    <Stethoscope className="h-8 w-8 text-gray-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">No Physiotherapists Found</h2>
                <p className="text-gray-600 text-center max-w-md">
                    You haven't connected with any physiotherapists yet. Use the "Find a Physio" tool to search and connect with professionals.
                </p>
                <Button onClick={() => router.push('/find-a-physio')}>
                    Find a Physio
                </Button>
            </div>
        )
    }

    // If multiple physiotherapists, show a list
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">My Physiotherapists</h1>
                <p className="text-gray-600">
                    Select a physiotherapist to view details and manage your care
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {careTeam.map((member) => (
                    <Card
                        key={member.physiotherapist?._id}
                        className="hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => router.push(`/dashboard/patient/my-physiotherapist/${member.physiotherapist?._id}`)}
                    >
                        <CardHeader className="flex flex-row items-center gap-4 pb-2">
                            <Avatar className="h-12 w-12">
                                <AvatarImage src={member.physiotherapist?.imageUrl} />
                                <AvatarFallback>
                                    {member.physiotherapist?.firstName?.[0]}{member.physiotherapist?.lastName?.[0]}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <CardTitle className="text-base">
                                    {member.physiotherapist?.firstName} {member.physiotherapist?.lastName}
                                </CardTitle>
                                <CardDescription>
                                    {member.clinic?.name || 'Independent Practitioner'}
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between mt-2">
                                <span className={`text-xs px-2 py-1 rounded-full ${member.relationship?.isPrimary ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                    }`}>
                                    {member.relationship?.isPrimary ? 'Primary' : 'Secondary'}
                                </span>
                                <Button variant="ghost" size="sm" className="text-[#005b57]">
                                    View Dashboard &rarr;
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
