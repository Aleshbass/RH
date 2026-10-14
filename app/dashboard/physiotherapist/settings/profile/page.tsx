'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { primaryButtonClass } from '@/components/physio/ui';
import {
    SettingsPageHeader,
    SettingsSection,
    SpecialisationPicker,
    fieldHintClass,
    fieldLabelClass,
} from '@/components/physio/SettingsUI';
import { useFileUpload } from '@/lib/hooks/useFileUpload';

/** Matches the "photo and short bio" item on the setup checklist (convex/physioSetup.ts). */
const MIN_BIO_LENGTH = 40;

// Convert an image File to WebP on the client for faster loading
async function convertImageToWebp(file: File, quality = 0.85): Promise<File> {
    return new Promise<File>((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Canvas not supported');
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(
                    (blob) => {
                        URL.revokeObjectURL(objectUrl);
                        if (!blob) return reject(new Error('Could not convert image'));
                        resolve(
                            new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
                                type: 'image/webp',
                                lastModified: Date.now(),
                            })
                        );
                    },
                    'image/webp',
                    quality
                );
            } catch (e) {
                URL.revokeObjectURL(objectUrl);
                reject(e as Error);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Could not read image'));
        };
        img.src = objectUrl;
    });
}

export default function ProfileSettingsPage() {
    const currentUser = useQuery(api.users.getMyUser);
    const currentUserProfile = useQuery(api.queries.getCurrentUser);
    const updateProfile = useMutation(api.users.updatePhysiotherapistProfile);
    const updateProfileImage = useMutation(api.users.updateProfileImageFromStorage);
    const removeProfileImage = useMutation(api.users.removeProfileImage);
    const { uploadFile, isUploading, progress } = useFileUpload();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [bio, setBio] = useState('');
    const [specializations, setSpecializations] = useState<string[]>([]);
    const [yearsOfExperience, setYearsOfExperience] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isRemovingPhoto, setIsRemovingPhoto] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // Fill the form once, so live updates don't overwrite what the user is typing
    useEffect(() => {
        if (loaded || !currentUser || currentUserProfile === undefined) return;
        setFirstName(currentUser.firstName || '');
        setLastName(currentUser.lastName || '');
        setPhone(currentUser.phoneNumber || '');
        const profile = currentUserProfile?.profileData as
            | { bio?: string; specializations?: string[]; yearsOfExperience?: number }
            | undefined;
        setBio(profile?.bio || '');
        setSpecializations(profile?.specializations || []);
        setYearsOfExperience(profile?.yearsOfExperience !== undefined ? String(profile.yearsOfExperience) : '');
        setLoaded(true);
    }, [currentUser, currentUserProfile, loaded]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Choose a photo (JPG, PNG or WebP).');
            return;
        }
        try {
            let toUpload = file;
            try {
                toUpload = await convertImageToWebp(file);
            } catch {
                toUpload = file;
            }
            const res = await uploadFile(toUpload);
            if (!res?.storageId) throw new Error('Upload failed');
            await updateProfileImage({ storageId: res.storageId as Id<'_storage'> });
            toast.success('Photo updated');
        } catch (error) {
            toast.error((error as Error).message || 'Couldn’t upload your photo');
        }
    };

    const handleRemovePhoto = async () => {
        setIsRemovingPhoto(true);
        try {
            await removeProfileImage({});
            toast.success('Photo removed');
        } catch (error) {
            toast.error((error as Error).message || 'Couldn’t remove your photo');
        } finally {
            setIsRemovingPhoto(false);
        }
    };

    const handleSave = async () => {
        if (!firstName.trim() || !lastName.trim()) {
            toast.error('Enter your first and last name.');
            return;
        }
        const years = yearsOfExperience.trim() === '' ? undefined : Number(yearsOfExperience);
        if (years !== undefined && (!Number.isFinite(years) || years < 0 || years > 70)) {
            toast.error('Enter your years of experience as a number.');
            return;
        }
        setIsSaving(true);
        try {
            await updateProfile({
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                phoneNumber: phone.trim(),
                bio: bio.trim(),
                specializations,
                yearsOfExperience: years,
            });
            toast.success('Profile saved');
        } catch (error) {
            toast.error((error as Error).message || 'Couldn’t save your profile. Try again.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!loaded || !currentUser) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-28 rounded-xl" />
                <Skeleton className="h-72 rounded-xl" />
            </div>
        );
    }

    const bioLength = bio.trim().length;
    const initials = `${currentUser.firstName?.[0] ?? ''}${currentUser.lastName?.[0] ?? ''}`.toUpperCase();

    return (
        <div className="space-y-6">
            <SettingsPageHeader title="Profile" description="What patients see on your marketplace page and booking link." />

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

            <SettingsSection title="Photo" description="A clear, friendly headshot. Patients are more likely to book physios they can picture.">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Avatar className="h-20 w-20">
                            <AvatarImage src={currentUser.imageUrl} alt="" className="object-cover" />
                            <AvatarFallback className="bg-neutral-100 text-xl font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                                {initials || '?'}
                            </AvatarFallback>
                        </Avatar>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            aria-label="Change photo"
                            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                        >
                            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                            {isUploading ? (progress ? `Uploading ${progress}%` : 'Uploading…') : currentUser.imageUrl ? 'Change photo' : 'Upload photo'}
                        </Button>
                        {currentUser.imageUrl && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleRemovePhoto}
                                disabled={isRemovingPhoto}
                                className="text-neutral-500"
                            >
                                {isRemovingPhoto ? 'Removing…' : 'Remove'}
                            </Button>
                        )}
                    </div>
                </div>
            </SettingsSection>

            <SettingsSection
                title="Details"
                footer={
                    <Button onClick={handleSave} disabled={isSaving} className={primaryButtonClass}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save changes
                    </Button>
                }
            >
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="firstName" className={fieldLabelClass}>First name</Label>
                            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="lastName" className={fieldLabelClass}>Last name</Label>
                            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="email" className={fieldLabelClass}>Email</Label>
                            <Input id="email" type="email" value={currentUser.email || ''} disabled />
                            <p className={fieldHintClass}>Change it under Login &amp; security in your account menu.</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="phone" className={fieldLabelClass}>Phone</Label>
                            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="0803 123 4567" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="years" className={fieldLabelClass}>Years of experience</Label>
                            <Input
                                id="years"
                                inputMode="numeric"
                                value={yearsOfExperience}
                                onChange={(e) => setYearsOfExperience(e.target.value.replace(/[^\d]/g, ''))}
                                placeholder="5"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="bio" className={fieldLabelClass}>About you</Label>
                        <Textarea
                            id="bio"
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            rows={5}
                            className="resize-y"
                            placeholder="How you work, who you help most, and what a first session with you looks like."
                        />
                        <p className={fieldHintClass}>
                            {bioLength < MIN_BIO_LENGTH
                                ? `At least ${MIN_BIO_LENGTH} characters (${bioLength} so far).`
                                : `${bioLength} characters`}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label className={fieldLabelClass}>Specialisations</Label>
                        <SpecialisationPicker value={specializations} onChange={setSpecializations} />
                    </div>
                </div>
            </SettingsSection>
        </div>
    );
}
