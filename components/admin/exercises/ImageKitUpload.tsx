'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import Image from 'next/image';
import { useAction } from 'convex/react';
import { ImageUp, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { softButtonClass } from '@/components/admin/ui';

interface ImageKitUploadProps {
    onUploadSuccess: (res: { url: string; thumbnailUrl: string; fileId: string }) => void;
    onRemove?: () => void;
    currentImageUrl?: string;
    folder?: string;
}

export function ImageKitUpload({ onUploadSuccess, onRemove, currentImageUrl, folder = '/exercises' }: ImageKitUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getUploadAuth = useAction(api.imagekit.getUploadAuth);

    const uploadFile = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Choose an image file');
            return;
        }

        setIsUploading(true);

        // Create local preview
        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);

        try {
            // Get auth params immediately before upload
            const uploadAuth = await getUploadAuth();

            const formData = new FormData();
            formData.append('file', file);
            formData.append('fileName', file.name);
            formData.append('publicKey', process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY || '');
            formData.append('signature', uploadAuth.signature);
            formData.append('expire', uploadAuth.expire.toString());
            formData.append('token', uploadAuth.token);
            formData.append('folder', folder);
            formData.append('useUniqueFileName', 'true');

            const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Upload failed');
            }

            const data = await response.json();

            onUploadSuccess({
                url: data.url,
                thumbnailUrl: data.thumbnailUrl || data.url,
                fileId: data.fileId,
            });

            toast.success('Image uploaded successfully');
        } catch (error) {
            toast.error('Failed to upload image', { description: (error as Error)?.message });
            setPreviewUrl(currentImageUrl || null); // Revert preview
        } finally {
            setIsUploading(false);
            // Clear input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) void uploadFile(file);
    };

    const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (isUploading) return;
        const file = e.dataTransfer.files?.[0];
        if (file) void uploadFile(file);
    };

    const handleRemove = () => {
        setPreviewUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        if (onRemove) onRemove();
    };

    return (
        <div className="space-y-3">
            <input
                ref={fileInputRef}
                id="exercise-image-input"
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
                disabled={isUploading}
            />
            {previewUrl ? (
                <>
                    <div className="relative h-64 w-full overflow-hidden rounded-xl border border-black/[0.06] bg-rh-canvas dark:border-white/10 dark:bg-white/[0.04]">
                        <Image src={previewUrl} alt="Exercise image preview" fill unoptimized sizes="(min-width: 1024px) 33vw, 100vw" className="object-contain" />
                        <button
                            onClick={handleRemove}
                            className="absolute right-2 top-2 rounded-full bg-white p-1.5 shadow-md transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:bg-rh-ink-3 dark:hover:bg-rh-ink-2"
                            type="button"
                            disabled={isUploading}
                            aria-label="Remove image"
                        >
                            <X className="h-4 w-4 text-neutral-600 dark:text-neutral-300" />
                        </button>
                        {isUploading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <Loader2 className="h-8 w-8 animate-spin text-white" />
                            </div>
                        )}
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className={cn(softButtonClass, 'w-full')}
                    >
                        <ImageUp className="mr-2 h-4 w-4" />
                        Replace image
                    </Button>
                </>
            ) : (
                <label
                    htmlFor="exercise-image-input"
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={cn(
                        'flex h-64 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors',
                        isDragging
                            ? 'border-rh-teal bg-rh-mist dark:border-rh-aqua dark:bg-rh-aqua/10'
                            : 'border-black/10 bg-rh-canvas hover:bg-rh-mist/60 dark:border-white/15 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]'
                    )}
                >
                    <span className="mb-3 rounded-full bg-white p-4 shadow-soft dark:bg-rh-ink-3">
                        <Upload className="h-7 w-7 text-rh-teal dark:text-rh-aqua" />
                    </span>
                    <p className="mb-1 text-sm text-neutral-600 dark:text-neutral-300">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">SVG, PNG, JPG or GIF (max. 800×400px)</p>
                </label>
            )}
        </div>
    );
}
