'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2, User, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useFileUpload } from '@/lib/hooks/useFileUpload';
import { useMutationUntyped } from '@/lib/convexUntyped';

// Convert an image File to WebP on the client for faster loading
async function convertImageToWebp(file: File, quality = 0.85): Promise<File> {
    return new Promise<File>((resolve, reject) => {
        let objectUrl: string | null = null;
        try {
            const img = new Image();
            objectUrl = URL.createObjectURL(file);

            img.onload = () => {
                try {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        if (objectUrl) URL.revokeObjectURL(objectUrl);
                        return reject(new Error("Canvas not supported"));
                    }
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob(
                        (blob) => {
                            // Revoke the object URL after we're done with it
                            if (objectUrl) URL.revokeObjectURL(objectUrl);

                            if (!blob) return reject(new Error("Failed to create WebP blob"));
                            const webpFile = new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
                                type: "image/webp",
                                lastModified: Date.now(),
                            });
                            resolve(webpFile);
                        },
                        "image/webp",
                        quality
                    );
                } catch (e) {
                    if (objectUrl) URL.revokeObjectURL(objectUrl);
                    reject(e as Error);
                }
            };

            img.onerror = () => {
                if (objectUrl) URL.revokeObjectURL(objectUrl);
                reject(new Error("Failed to load image for conversion"));
            };

            img.src = objectUrl;
        } catch (e) {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            reject(e as Error);
        }
    });
}

export default function ProfileSettingsPage() {
    const router = useRouter();
    const { isLoaded, isSignedIn } = useAuth();
    const [isSaving, setIsSaving] = useState(false);
    const [isRemovingPhoto, setIsRemovingPhoto] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form state (controlled inputs)
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [bio, setBio] = useState('');
    const [specializations, setSpecializations] = useState('');

    const currentUser = useQuery(api.users.getMyUser);
    const currentUserProfile = useQuery(api.queries.getCurrentUser);
    const updateProfileMutation = useMutation(api.users.updatePhysiotherapistProfile);

    const { uploadFile, isUploading, progress } = useFileUpload();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiAny = api as unknown as Record<string, any>;
    const updateProfileImage = useMutationUntyped(
        apiAny["users"]["updateProfileImageFromStorage"]
    ) as (args: { storageId: string }) => Promise<{ imageUrl: string }>;
    const removeProfileImage = useMutationUntyped(
        apiAny["users"]["removeProfileImage"]
    ) as () => Promise<{ success: boolean }>;

    // Initialize form state from fetched user data
    useEffect(() => {
        if (currentUser) {
            setFirstName(currentUser.firstName || '');
            setLastName(currentUser.lastName || '');
            setEmail(currentUser.email || '');
            setPhone(currentUser.phoneNumber || '');
        }
    }, [currentUser]);

    useEffect(() => {
        if (currentUserProfile?.profileData) {
            setBio(currentUserProfile.profileData.bio || '');
            setSpecializations(currentUserProfile.profileData.specializations?.join(', ') || '');
        }
    }, [currentUserProfile]);

    useEffect(() => {
        if (isLoaded && !isSignedIn) {
            router.push('/sign-in');
        }
    }, [isLoaded, isSignedIn, router]);

    useEffect(() => {
        if (currentUser === null || (currentUser && currentUser.role !== 'physiotherapist')) {
            router.push('/dashboard');
        }
    }, [currentUser, router]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            let toUpload = file;
            // Convert to WebP for faster loading
            if (file.type.startsWith("image/")) {
                try {
                    toUpload = await convertImageToWebp(file, 0.85);
                } catch {
                    toUpload = file;
                }
            }

            const res = await uploadFile(toUpload);
            if (!res?.storageId) throw new Error("Upload failed. No storageId returned.");

            await updateProfileImage({ storageId: res.storageId as unknown as string });
            toast.success("Profile photo updated");
        } catch (error) {
            const err = error as Error;
            console.error('Error uploading profile photo:', err);
            toast.error(err.message || "Failed to upload profile photo");
        }

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };

    const handleRemoveProfilePicture = async () => {
        if (!currentUser?.imageUrl) {
            toast.error('No profile picture to remove');
            return;
        }

        setIsRemovingPhoto(true);
        try {
            await removeProfileImage();
            toast.success('Profile picture removed');
        } catch (error) {
            const err = error as Error;
            console.error('Error removing profile photo:', err);
            toast.error(err.message || 'Failed to remove profile picture');
        } finally {
            setIsRemovingPhoto(false);
        }
    };

    if (!isLoaded || currentUser === undefined || currentUserProfile === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-400">Loading profile...</p>
                </div>
            </div>
        );
    }

    // Handle null currentUser (no Convex record)
    if (currentUser === null) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <p className="text-gray-400">User profile not found</p>
                </div>
            </div>
        );
    }

    const handleSaveProfile = async () => {
        setIsSaving(true);
        try {
            // Parse specializations from comma-separated string to array
            const specializationsArray = specializations
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);

            await updateProfileMutation({
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                phoneNumber: phone.trim(),
                bio: bio.trim(),
                specializations: specializationsArray,
            });

            toast.success('Profile settings saved successfully!');
        } catch (error) {
            console.error('Error saving profile:', error);
            toast.error('Failed to save profile settings. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
            />

            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <User className="h-6 w-6" />
                    Profile
                </h1>
                <p className="text-gray-400 mt-1">Manage settings for your Rehabify profile</p>
            </div>

            {/* Profile Card */}
            <Card className="bg-[#1a1a1a] border-white/10">
                <CardContent className="p-6 space-y-6">
                    {/* Profile Picture */}
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="h-20 w-20 rounded-full bg-[#005b57] overflow-hidden">
                                {currentUser?.imageUrl ? (
                                    <img src={currentUser.imageUrl} alt="Profile" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center text-2xl font-semibold text-white">
                                        {currentUser?.firstName?.[0]}{currentUser?.lastName?.[0]}
                                    </div>
                                )}
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full p-0 bg-white hover:bg-gray-100"
                                onClick={triggerFileUpload}
                                disabled={isUploading}
                            >
                                {isUploading ? (
                                    <Loader2 className="h-4 w-4 text-gray-700 animate-spin" />
                                ) : (
                                    <Camera className="h-4 w-4 text-gray-700" />
                                )}
                            </Button>
                        </div>
                        <div>
                            <h4 className="font-medium text-white">Profile picture</h4>
                            <div className="flex gap-2 mt-2">
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={triggerFileUpload}
                                    disabled={isUploading}
                                >
                                    {isUploading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            {progress ? `${progress}%` : 'Uploading...'}
                                        </>
                                    ) : (
                                        'Upload avatar'
                                    )}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-gray-400 hover:text-white"
                                    onClick={handleRemoveProfilePicture}
                                    disabled={isRemovingPhoto || !currentUser?.imageUrl}
                                >
                                    {isRemovingPhoto ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        'Remove'
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <Separator className="bg-white/10" />

                    {/* Form Fields - Now controlled */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="firstName" className="text-gray-300">First Name</Label>
                            <Input
                                id="firstName"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                placeholder="Enter your first name"
                                className="mt-1.5 bg-[#0a0a0a] border-white/10 text-white placeholder:text-gray-500"
                            />
                        </div>
                        <div>
                            <Label htmlFor="lastName" className="text-gray-300">Last Name</Label>
                            <Input
                                id="lastName"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                placeholder="Enter your last name"
                                className="mt-1.5 bg-[#0a0a0a] border-white/10 text-white placeholder:text-gray-500"
                            />
                        </div>
                        <div>
                            <Label htmlFor="email" className="text-gray-300">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                disabled
                                placeholder="Enter your email"
                                className="mt-1.5 bg-[#0a0a0a] border-white/10 text-white placeholder:text-gray-500 opacity-60"
                            />
                            <p className="text-xs text-gray-500 mt-1">Email cannot be changed here</p>
                        </div>
                        <div>
                            <Label htmlFor="phone" className="text-gray-300">Phone Number</Label>
                            <Input
                                id="phone"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="Enter your phone number"
                                className="mt-1.5 bg-[#0a0a0a] border-white/10 text-white placeholder:text-gray-500"
                            />
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="bio" className="text-gray-300">About</Label>
                        <Textarea
                            id="bio"
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Tell us about your professional background..."
                            rows={4}
                            className="mt-1.5 bg-[#0a0a0a] border-white/10 text-white placeholder:text-gray-500 resize-none"
                        />
                    </div>

                    <div>
                        <Label htmlFor="specializations" className="text-gray-300">Specializations</Label>
                        <Input
                            id="specializations"
                            value={specializations}
                            onChange={(e) => setSpecializations(e.target.value)}
                            placeholder="e.g., Sports Therapy, Neurological Rehabilitation"
                            className="mt-1.5 bg-[#0a0a0a] border-white/10 text-white placeholder:text-gray-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Separate multiple specializations with commas</p>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            onClick={handleSaveProfile}
                            disabled={isSaving}
                            className="bg-[#005b57] hover:bg-[#00443e] text-white"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Update'
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
