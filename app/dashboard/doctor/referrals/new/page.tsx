'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function SubmitReferralPage() {
    const router = useRouter()
    const submitReferral = useMutation(api.doctors.submitReferral)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const doctorProfile = useQuery(api.doctors.getMyDoctorProfile)

    const [formData, setFormData] = useState({
        patientFirstName: '',
        patientLastName: '',
        patientEmail: '',
        patientPhone: '',
        hospitalClinic: '',
        condition: '',
        clinicalNotes: ''
    })

    // Pre-fill hospital from doctor's profile once loaded, if not edited yet
    useEffect(() => {
        if (doctorProfile && doctorProfile.profile?.hospitalAffiliation && !formData.hospitalClinic) {
            setFormData(prev => ({ ...prev, hospitalClinic: doctorProfile.profile!.hospitalAffiliation! }))
        }
    }, [doctorProfile])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            setIsSubmitting(true)
            await submitReferral({
                patientFirstName: formData.patientFirstName,
                patientLastName: formData.patientLastName,
                patientEmail: formData.patientEmail || undefined,
                patientPhone: formData.patientPhone,
                hospitalClinic: formData.hospitalClinic || undefined,
                condition: formData.condition || undefined,
                clinicalNotes: formData.clinicalNotes || undefined,
            })
            toast.success("Referral submitted successfully!")
            router.push('/dashboard/doctor/referrals')
        } catch (error: any) {
            console.error("Failed to submit referral", error)
            toast.error(error.message || "Something went wrong. Please try again.")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center space-x-4">
                <Link href="/dashboard/doctor">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Refer a Patient</h1>
                    <p className="text-sm text-gray-500">Send a patient to Rehabify. Our team will contact them to arrange their first session.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Patient Details</CardTitle>
                    <CardDescription>Provide basic contact and clinical context for the referral.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">First Name</label>
                                <Input
                                    name="patientFirstName"
                                    value={formData.patientFirstName}
                                    onChange={handleChange}
                                    required
                                    className="mt-1"
                                    placeholder="Jane"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Last Name</label>
                                <Input
                                    name="patientLastName"
                                    value={formData.patientLastName}
                                    onChange={handleChange}
                                    required
                                    className="mt-1"
                                    placeholder="Doe"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Phone Number</label>
                                <Input
                                    name="patientPhone"
                                    type="tel"
                                    value={formData.patientPhone}
                                    onChange={handleChange}
                                    required
                                    className="mt-1"
                                    placeholder="+234..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Email Address (Optional)</label>
                                <Input
                                    name="patientEmail"
                                    type="email"
                                    value={formData.patientEmail}
                                    onChange={handleChange}
                                    className="mt-1"
                                    placeholder="jane.doe@example.com"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">Referring Hospital/Clinic</label>
                                <Input
                                    name="hospitalClinic"
                                    value={formData.hospitalClinic}
                                    onChange={handleChange}
                                    className="mt-1"
                                    placeholder="Which hospital or clinic is the patient coming from?"
                                    required
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">Primary Condition</label>
                                <Input
                                    name="condition"
                                    value={formData.condition}
                                    onChange={handleChange}
                                    className="mt-1"
                                    placeholder="e.g., Lower Back Pain, Post-op Knee Surgery"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">Clinical Notes / Reason for Referral</label>
                                <Textarea
                                    name="clinicalNotes"
                                    value={formData.clinicalNotes}
                                    onChange={handleChange}
                                    rows={4}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                    placeholder="Please provide any relevant medical history or specific instructions for the physiotherapist..."
                                />
                            </div>
                        </div>

                        <div className="pt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:gap-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => router.back()}
                                className="w-full sm:w-auto"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white"
                            >
                                {isSubmitting ? "Submitting..." : "Submit Referral"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
