'use client'

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { useParams, useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Activity, Video, MessageSquare, CreditCard, FileText, Calendar, Plus, ArrowLeft, Download, Clock, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MyPhysiotherapistCard } from '@/components/dashboard/patient/MyPhysiotherapistCard'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PatientAppointmentBookingModal } from '@/components/patient/PatientAppointmentBookingModal'
import { TourGuide } from '@/components/shared/TourGuide'

export default function DynamicMyPhysiotherapistPage() {
    const router = useRouter()
    const params = useParams()
    const physiotherapistId = params.physiotherapistId as Id<'users'>

    // Modal state
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)

    // Fetch physiotherapist details
    const careTeam = useQuery(api.patients.getPatientCareTeam)
    const physiotherapist = careTeam?.find(
        (member: any) => member.physiotherapist?._id === physiotherapistId
    )

    // Fetch current user to get patient ID and profile ID
    const user = useQuery(api.users.getMyUser)

    // Fetch patient data specific to this physiotherapist
    // Note: We're using existing queries but filtering client-side for now.
    // Ideally, we should have specific backend queries for efficiency  // Fetch data using correct patient-facing queries
    const appointments = useQuery(api.appointments.getPatientAppointments, {
        status: undefined // Fetch all statuses
    });

    const invoices = useQuery(api.billing.getPatientInvoices, {});

    const treatmentPlans = useQuery(api.treatmentPlans.getPatientTreatmentPlans,
        user ? { patientId: user._id } : "skip"
    );

    const documents = useQuery(api.files.getPatientDocuments,
        user?.patientProfileId ? { patientProfileId: user.patientProfileId } : "skip"
    );

    // Filter data for this specific physiotherapist
    // Note: This assumes the data objects have a physiotherapistId field or similar
    // If not, we might need to adjust the backend or schema.
    // For MVP, we'll display all data but in a real app we'd filter.

    const physioAppointments = appointments?.filter((a: any) => a.physiotherapistId === physiotherapistId) || []
    const physioInvoices = invoices?.filter((i: any) => i.physiotherapistId === physiotherapistId) || []
    const physioPlans = treatmentPlans?.filter((p: any) => p.physiotherapistId === physiotherapistId) || []
    // Documents might not have physio ID directly if uploaded by patient, but we can show all for now

    if (careTeam === undefined) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        )
    }

    if (!physiotherapist) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">Physiotherapist Not Found</h2>
                <p className="text-gray-600">The requested physiotherapist could not be found in your care team.</p>
                <Button onClick={() => router.push('/dashboard/patient/my-physiotherapist')}>
                    Back to Overview
                </Button>
            </div>
        )
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'confirmed': return 'bg-green-100 text-green-800'
            case 'pending': return 'bg-yellow-100 text-yellow-800'
            case 'cancelled': return 'bg-red-100 text-red-800'
            case 'completed': return 'bg-gray-100 text-gray-800'
            default: return 'bg-gray-100 text-gray-800'
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/patient/my-physiotherapist')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div id="physio-detail-header">
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                        {physiotherapist.physiotherapist?.firstName} {physiotherapist.physiotherapist?.lastName}
                    </h1>
                    <p className="text-gray-600">
                        Manage your care with this physiotherapist
                    </p>
                </div>
            </div>

            {/* Physiotherapist Card */}
            <Card id="physio-profile-card">
                <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row items-start gap-6">
                        <Avatar className="h-20 w-20">
                            <AvatarImage src={physiotherapist.physiotherapist?.imageUrl} />
                            <AvatarFallback className="text-lg">
                                {physiotherapist.physiotherapist?.firstName?.[0]}{physiotherapist.physiotherapist?.lastName?.[0]}
                            </AvatarFallback>
                        </Avatar>
                        <div className="space-y-2 flex-1">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-xl font-semibold">
                                        {physiotherapist.physiotherapist?.firstName} {physiotherapist.physiotherapist?.lastName}
                                    </h2>
                                    <p className="text-gray-600">{physiotherapist.clinic?.name}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/patient/messages')}>
                                        <MessageSquare className="h-4 w-4 mr-2" />
                                        Message
                                    </Button>
                                    <Button size="sm" className="bg-[#005b57] hover:bg-[#00443e]" onClick={() => setIsBookingModalOpen(true)}>
                                        <Calendar className="h-4 w-4 mr-2" />
                                        Book
                                    </Button>
                                </div>
                            </div>
                            <div className="flex gap-4 text-sm text-gray-600">
                                <div className="flex items-center gap-1">
                                    <Activity className="h-4 w-4" />
                                    <span>Physiotherapist</span>
                                </div>
                                {physiotherapist.relationship?.isPrimary && (
                                    <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
                                        Primary Care Provider
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tab-based Navigation */}
            <Tabs defaultValue="treatment" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3 lg:grid-cols-5 bg-gray-100/50 p-1 rounded-xl h-auto gap-1">
                    <TabsTrigger id="physio-tabs-treatment" value="treatment" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#005b57]">
                        <Activity className="h-4 w-4 mr-2" />
                        Treatment
                    </TabsTrigger>
                    <TabsTrigger id="physio-tabs-communication" value="communication" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#005b57]">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Communication
                    </TabsTrigger>
                    <TabsTrigger id="physio-tabs-appointments" value="appointments" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#005b57]">
                        <Calendar className="h-4 w-4 mr-2" />
                        Appointments
                    </TabsTrigger>
                    <TabsTrigger id="physio-tabs-billing" value="billing" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#005b57]">
                        <CreditCard className="h-4 w-4 mr-2" />
                        Billing
                    </TabsTrigger>
                    <TabsTrigger id="physio-tabs-documents" value="documents" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#005b57]">
                        <FileText className="h-4 w-4 mr-2" />
                        Documents
                    </TabsTrigger>
                </TabsList>

                {/* Treatment Tab */}
                <TabsContent value="treatment" className="space-y-6">
                    <Tabs defaultValue="plans" className="w-full">
                        <div className="flex items-center justify-between mb-4">
                            <TabsList className="bg-transparent p-0 gap-4 border-b w-full justify-start rounded-none h-auto">
                                <TabsTrigger value="plans" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-[#005b57] data-[state=active]:shadow-none rounded-none px-1 pb-2 data-[state=active]:text-[#005b57]">Active Plans</TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="plans" className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-900">Your Treatment Plans</h3>
                                <Button
                                    className="bg-[#005b57] hover:bg-[#00443e]"
                                    onClick={() => router.push('/dashboard/patient/treatment-plans')}
                                >
                                    View All Plans
                                </Button>
                            </div>

                            {physioPlans.length > 0 ? (
                                <div className="grid gap-4">
                                    {physioPlans.map((plan: any) => (
                                        <Card key={plan._id}>
                                            <CardHeader>
                                                <CardTitle>{plan.title}</CardTitle>
                                                <CardDescription>{plan.description}</CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="flex justify-between items-center">
                                                    <Badge>{plan.status}</Badge>
                                                    <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/patient/treatment-plans/${plan._id}`)}>
                                                        View Details
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed">
                                    <Activity className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                                    <p className="text-gray-500">No active treatment plans</p>
                                    <p className="text-xs text-gray-400 mt-1">Your physiotherapist will create personalized treatment plans for you.</p>
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                </TabsContent>

                {/* Communication Tab */}
                <TabsContent value="communication" className="space-y-6">
                    <Tabs defaultValue="messages" className="w-full">
                        <div className="flex items-center justify-between mb-4">
                            <TabsList className="bg-transparent p-0 gap-4 border-b w-full justify-start rounded-none h-auto">
                                <TabsTrigger value="messages" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-[#005b57] data-[state=active]:shadow-none rounded-none px-1 pb-2 data-[state=active]:text-[#005b57]">Messages</TabsTrigger>
                                <TabsTrigger value="video" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-[#005b57] data-[state=active]:shadow-none rounded-none px-1 pb-2 data-[state=active]:text-[#005b57]">Video Calls</TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="messages" className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-900">Secure Messaging</h3>
                                <Button
                                    className="bg-[#005b57] hover:bg-[#00443e]"
                                    onClick={() => router.push('/dashboard/patient/messages')}
                                >
                                    <MessageSquare className="h-4 w-4 mr-2" />
                                    Open Messages
                                </Button>
                            </div>
                            <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed">
                                <MessageSquare className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500">No messages yet</p>
                                <p className="text-xs text-gray-400 mt-1">Send secure messages to your physiotherapist.</p>
                            </div>
                        </TabsContent>

                        <TabsContent value="video" className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-900">Telehealth Sessions</h3>
                                <Button
                                    className="bg-[#005b57] hover:bg-[#00443e]"
                                    onClick={() => setIsBookingModalOpen(true)}
                                >
                                    <Video className="h-4 w-4 mr-2" />
                                    Book Video Call
                                </Button>
                            </div>
                            <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed">
                                <Video className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500">No past video sessions</p>
                                <p className="text-xs text-gray-400 mt-1">Join scheduled video consultations with your physiotherapist.</p>
                            </div>
                        </TabsContent>
                    </Tabs>
                </TabsContent>

                {/* Appointments Tab */}
                <TabsContent value="appointments" className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-gray-900">Upcoming Appointments</h3>
                        <Button
                            className="bg-[#005b57] hover:bg-[#00443e]"
                            onClick={() => setIsBookingModalOpen(true)}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Book Appointment
                        </Button>
                    </div>

                    {physioAppointments.length > 0 ? (
                        <div className="space-y-3">
                            {physioAppointments.map((appointment: any) => (
                                <Card key={appointment._id} className="border-l-4 border-l-[#005b57]">
                                    <CardContent className="pt-4">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-3 mb-2">
                                                    <p className="font-semibold text-gray-900">
                                                        {format(new Date(appointment.startTime), 'PPP')}
                                                    </p>
                                                    <Badge className={getStatusColor(appointment.status)}>
                                                        {appointment.status}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-gray-600">
                                                    {format(new Date(appointment.startTime), 'p')} - {format(new Date(appointment.endTime), 'p')}
                                                </p>
                                                <p className="text-sm text-gray-600 mt-1">{appointment.serviceType}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                {appointment.status !== 'cancelled' && (
                                                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                                                        Cancel
                                                    </Button>
                                                )}
                                                <Button variant="outline" size="sm">
                                                    Reschedule
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed">
                            <Calendar className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-500">No upcoming appointments</p>
                            <p className="text-xs text-gray-400 mt-1">Book an appointment with your physiotherapist.</p>
                        </div>
                    )}
                </TabsContent>

                {/* Billing Tab */}
                <TabsContent value="billing" className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-gray-900">Billing & Invoices</h3>
                        <Button
                            className="bg-[#005b57] hover:bg-[#00443e]"
                            onClick={() => router.push('/dashboard/patient/invoices')}
                        >
                            View All Invoices
                        </Button>
                    </div>

                    {physioInvoices.length > 0 ? (
                        <div className="space-y-3">
                            {physioInvoices.map((invoice: any) => (
                                <Card key={invoice._id}>
                                    <CardContent className="pt-4 flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold">Invoice #{invoice.invoiceNumber}</p>
                                            <p className="text-sm text-gray-600">{format(new Date(invoice.createdAt), 'PPP')}</p>
                                            <p className="font-medium mt-1">${invoice.amount.toFixed(2)}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Badge variant={invoice.status === 'paid' ? 'default' : 'destructive'}>
                                                {invoice.status}
                                            </Badge>
                                            {invoice.status !== 'paid' && (
                                                <Button size="sm">Pay Now</Button>
                                            )}
                                            <Button variant="ghost" size="icon">
                                                <Download className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed">
                            <CreditCard className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-500">No invoices found</p>
                            <p className="text-xs text-gray-400 mt-1">View and manage your billing and payments.</p>
                        </div>
                    )}
                </TabsContent>

                {/* Documents Tab */}
                <TabsContent value="documents" className="space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base">Health Records</CardTitle>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => router.push('/dashboard/patient/records')}
                            >
                                <Plus className="h-4 w-4 mr-2" /> Upload Document
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {documents && documents.length > 0 ? (
                                <ul className="space-y-2">
                                    {documents.map((doc: any) => (
                                        <li key={doc._id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-blue-50 rounded-lg">
                                                    <FileText className="h-5 w-5 text-blue-600" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">{doc.fileName}</p>
                                                    <p className="text-xs text-gray-500">{doc.documentType} • {(doc.fileSize / 1024).toFixed(2)} KB</p>
                                                </div>
                                            </div>
                                            <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">
                                                <Button variant="ghost" size="sm">
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="text-center py-8">
                                    <FileText className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                                    <p className="text-sm text-gray-500">No documents uploaded</p>
                                    <p className="text-xs text-gray-400 mt-1">Your health records and documents will appear here.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Appointment Booking Modal */}
            <PatientAppointmentBookingModal
                isOpen={isBookingModalOpen}
                onClose={() => setIsBookingModalOpen(false)}
                preselectedPhysiotherapistId={physiotherapistId}
                onAppointmentBooked={() => {
                    // Refresh data after booking
                    setIsBookingModalOpen(false)
                }}
            />
            <TourGuide
                tourId="patient-physio-detail-tour"
                steps={[
                    {
                        target: "#physio-detail-header",
                        title: "Physiotherapist Profile",
                        content: "View your physiotherapist's details and clinic information.",
                        position: "bottom",
                    },
                    {
                        target: "#physio-profile-card",
                        title: "Quick Contact",
                        content: "Easily message or book an appointment with your physiotherapist.",
                        position: "bottom",
                    },
                    {
                        target: "#physio-tabs-treatment",
                        title: "Treatment Plans",
                        content: "Access your active treatment plans and progress.",
                        position: "bottom",
                    },
                    {
                        target: "#physio-tabs-communication",
                        title: "Communication",
                        content: "Secure messaging and video calls with your provider.",
                        position: "bottom",
                    },
                    {
                        target: "#physio-tabs-appointments",
                        title: "Appointments",
                        content: "Manage upcoming sessions and view past history.",
                        position: "bottom",
                    },
                    {
                        target: "#physio-tabs-billing",
                        title: "Billing",
                        content: "View invoices and manage payments.",
                        position: "bottom",
                    },
                    {
                        target: "#physio-tabs-documents",
                        title: "Documents",
                        content: "Access shared medical records and files.",
                        position: "bottom",
                    },
                ]}
            />
        </div>
    )
}
