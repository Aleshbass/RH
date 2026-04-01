'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save, Upload, Trash2, Camera, ShieldCheck, FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import MapboxAddressInput from '@/components/physio-register/MapboxAddressInput';
import { useFileUpload } from '@/lib/hooks/useFileUpload';
import Link from 'next/link';

export default function PhysioProfileEditor() {
    const params = useParams();
    const router = useRouter();
    const slug = params?.slug as string;
    const { user, isLoaded } = useUser();

    const profile = useQuery(api.physioRegistry.getPublicProfile, { slug: slug || '' });
    const updateProfile = useMutation(api.physioRegistry.updateProfile);
    const deletePhoto = useMutation(api.physioRegistry.deleteProfilePhoto);
    const { uploadFile, isUploading } = useFileUpload();

    const [isSaving, setIsSaving] = useState(false);
    
    // Form state
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [practiceName, setPracticeName] = useState('');
    const [practiceAddress, setPracticeAddress] = useState('');
    const [yearsOfExperience, setYearsOfExperience] = useState<number>(0);
    const [bio, setBio] = useState('');
    const [websiteUrl, setWebsiteUrl] = useState('');

    // Files
    const [newProfilePhoto, setNewProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [newLicenseCert, setNewLicenseCert] = useState<File | null>(null);
    const [newPhotoId, setNewPhotoId] = useState<File | null>(null);

    // Initial load
    useEffect(() => {
        if (profile) {
            setFullName(profile.fullName || '');
            setPhone(profile.phone || '');
            setPracticeName(profile.practiceName || '');
            setPracticeAddress(profile.practiceAddress || '');
            setYearsOfExperience(profile.yearsOfExperience || 0);
            setBio(profile.bio || '');
            setWebsiteUrl(profile.websiteUrl || '');
        }
    }, [profile]);

    // Handle photo preview
    useEffect(() => {
        if (newProfilePhoto) {
            const url = URL.createObjectURL(newProfilePhoto);
            setPhotoPreview(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setPhotoPreview(null);
        }
    }, [newProfilePhoto]);

    if (!isLoaded || profile === undefined) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
                <Loader2 className="w-8 h-8 animate-spin text-[#005b57]" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4">
                <h1 className="text-2xl font-bold mb-2 text-gray-800">Profile Not Found</h1>
                <Link href="/physio-register">
                    <Button>Return to Register</Button>
                </Link>
            </div>
        );
    }

    // Check ownership
    if (!user || user.id !== profile.clerkUserId) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4">
                <ShieldCheck className="w-16 h-16 text-amber-500 mb-4" />
                <h1 className="text-2xl font-bold mb-2 text-gray-800">Unauthorized</h1>
                <p className="text-gray-500 mb-6">You can only edit your own profile.</p>
                <Link href={`/physio-register/${slug}`}>
                    <Button variant="outline">Back to Profile</Button>
                </Link>
            </div>
        );
    }

    const handleDeletePhoto = async () => {
        if (confirm("Are you sure you want to remove your profile photo?")) {
            try {
                await deletePhoto({ registryEntryId: profile.id as Id<"physioRegistry"> });
                setNewProfilePhoto(null);
                toast.success('Profile photo removed.');
            } catch (err: any) {
                toast.error(err.message || 'Failed to remove photo.');
            }
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Upload new photos/docs if they exist
            let profilePhotoStorageId = undefined;
            if (newProfilePhoto) {
                const res = await uploadFile(newProfilePhoto);
                profilePhotoStorageId = res.storageId;
            }

            let licenseCertStorageId = undefined;
            if (newLicenseCert) {
                const res = await uploadFile(newLicenseCert);
                licenseCertStorageId = res.storageId;
            }

            let photoIdStorageId = undefined;
            if (newPhotoId) {
                const res = await uploadFile(newPhotoId);
                photoIdStorageId = res.storageId;
            }

            // Update profile
            await updateProfile({
                registryEntryId: profile.id as Id<"physioRegistry">,
                fullName,
                phone,
                practiceName: practiceName || undefined,
                practiceAddress: practiceAddress || undefined,
                yearsOfExperience,
                bio: bio || undefined,
                websiteUrl: websiteUrl || undefined,
                ...(profilePhotoStorageId ? { profilePhotoStorageId: profilePhotoStorageId as Id<"_storage"> } : {}),
                ...(licenseCertStorageId ? { licenseCertStorageId: licenseCertStorageId as Id<"_storage"> } : {}),
                ...(photoIdStorageId ? { photoIdStorageId: photoIdStorageId as Id<"_storage"> } : {}),
            });

            toast.success("Profile updated successfully!");
            router.push(`/physio-register/${slug}`);
            
        } catch (error: any) {
            toast.error(error.message || "Failed to update profile.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50/50 py-8">
            <div className="max-w-3xl mx-auto px-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Link href={`/physio-register/${slug}`}>
                            <Button variant="ghost" size="icon" className="rounded-full">
                                <ArrowLeft className="w-5 h-5 text-gray-600" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-[#002e2c]">Edit Profile</h1>
                            <p className="text-sm text-gray-500">Update your public registry information</p>
                        </div>
                    </div>
                    <Button 
                        onClick={handleSave} 
                        disabled={isSaving || isUploading}
                        className="bg-[#005b57] hover:bg-[#00443e] rounded-xl shadow-md"
                    >
                        {isSaving || isUploading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4 mr-2" />
                        )}
                        Save Changes
                    </Button>
                </div>

                <div className="space-y-6">
                    {/* Photo Management */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                        <h2 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider mb-4">Profile Photo</h2>
                        <div className="flex items-center gap-6">
                            <div className="relative">
                                {photoPreview || profile.profilePhotoUrl ? (
                                    <img 
                                        src={photoPreview || profile.profilePhotoUrl} 
                                        alt="Profile" 
                                        className="w-24 h-24 rounded-full object-cover border-4 border-gray-100 shadow-sm"
                                    />
                                ) : (
                                    <div className="w-24 h-24 rounded-full bg-teal-50 border-4 border-teal-100 flex items-center justify-center text-teal-600 shadow-sm">
                                        <Camera className="w-8 h-8 opacity-50" />
                                    </div>
                                )}
                            </div>
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <Button asChild variant="outline" size="sm" className="rounded-xl h-9 cursor-pointer">
                                        <label>
                                            <Upload className="w-3.5 h-3.5 mr-2" /> Change Photo
                                            <input type="file" accept="image/*" className="hidden" onChange={(e) => setNewProfilePhoto(e.target.files?.[0] || null)} />
                                        </label>
                                    </Button>
                                    {(profile.profilePhotoUrl || newProfilePhoto) && (
                                        <Button variant="outline" size="sm" onClick={handleDeletePhoto} className="rounded-xl h-9 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200">
                                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                                        </Button>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 max-w-xs">Upload a professional photo to build trust. Supported formats: JPG, PNG. Max 5MB.</p>
                            </div>
                        </div>
                    </div>

                    {/* Basic Info */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
                        <h2 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider mb-2">Basic Info</h2>
                        <div className="space-y-2">
                            <Label>Full Name</Label>
                            <Input value={fullName} onChange={e => setFullName(e.target.value)} className="h-11" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Phone</Label>
                                <Input value={phone} onChange={e => setPhone(e.target.value)} className="h-11" />
                            </div>
                            <div className="space-y-2">
                                <Label>Years of Experience</Label>
                                <Input type="number" min={0} value={yearsOfExperience} onChange={e => setYearsOfExperience(Number(e.target.value))} className="h-11" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Short Bio</Label>
                            <Textarea 
                                value={bio} 
                                onChange={e => setBio(e.target.value)} 
                                className="min-h-[120px] resize-none" 
                                placeholder="Describe your experience, approach to treatment, and background..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Website (Optional)</Label>
                            <Input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://..." className="h-11" />
                        </div>
                    </div>

                    {/* Practice Info */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
                        <h2 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider mb-2">Practice Info</h2>
                        <div className="space-y-2">
                            <Label>Practice / Clinic Name</Label>
                            <Input value={practiceName} onChange={e => setPracticeName(e.target.value)} className="h-11" placeholder="e.g. Lagos City Physiotherapy" />
                        </div>
                        <div className="space-y-2">
                            <Label>Practice Address</Label>
                            <MapboxAddressInput 
                                value={practiceAddress} 
                                onChange={setPracticeAddress}
                                placeholder="Search for your practice address..."
                            />
                        </div>
                    </div>

                    {/* Documents */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4 mb-12">
                        <h2 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider mb-2">Update Documents</h2>
                        <p className="text-xs text-gray-500 mb-4">You only need to upload new files if you want to replace the current ones. The new files will overwrite your previous submissions.</p>
                        
                        <div className="space-y-3">
                            <div className="space-y-1.5 border border-gray-200 p-4 rounded-xl hover:border-teal-300 transition-colors">
                                <Label className="text-sm">Update License Certificate</Label>
                                <div className="flex justify-between items-center">
                                    <p className="text-xs text-gray-500">Current file is active. Upload a new PDF/image to replace it.</p>
                                    <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 transition-colors flex items-center">
                                        <Upload className="w-3.5 h-3.5 mr-1.5" /> {newLicenseCert ? "Selected" : "Browse"}
                                        <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setNewLicenseCert(e.target.files?.[0] || null)} />
                                    </label>
                                </div>
                                {newLicenseCert && <p className="text-xs text-teal-600 mt-2 flex items-center"><FileText className="w-3 h-3 mr-1" /> Ready to upload: {newLicenseCert.name}</p>}
                            </div>

                            <div className="space-y-1.5 border border-gray-200 p-4 rounded-xl hover:border-teal-300 transition-colors">
                                <Label className="text-sm">Update Govt Photo ID</Label>
                                <div className="flex justify-between items-center">
                                    <p className="text-xs text-gray-500">Current file is active. Upload a new PDF/image to replace it.</p>
                                    <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 transition-colors flex items-center">
                                        <Upload className="w-3.5 h-3.5 mr-1.5" /> {newPhotoId ? "Selected" : "Browse"}
                                        <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setNewPhotoId(e.target.files?.[0] || null)} />
                                    </label>
                                </div>
                                {newPhotoId && <p className="text-xs text-teal-600 mt-2 flex items-center"><FileText className="w-3 h-3 mr-1" /> Ready to upload: {newPhotoId.name}</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
