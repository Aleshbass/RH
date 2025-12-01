'use client';

import { useState, useRef } from 'react';
import { useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface ImageKitUploadProps {
    onUploadSuccess: (res: { url: string; thumbnailUrl: string; fileId: string }) => void;
    onRemove?: () => void;
    currentImageUrl?: string;
    folder?: string;
}

export function ImageKitUpload({ onUploadSuccess, onRemove, currentImageUrl, folder = '/exercises' }: ImageKitUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getUploadAuth = useAction(api.imagekit.getUploadAuth);

    console.log('ImageKit Public Key:', process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

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
                const errorData = await response.json();
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
            console.error('Upload error:', error);
            toast.error('Failed to upload image');
            setPreviewUrl(currentImageUrl || null); // Revert preview
        } finally {
            setIsUploading(false);
            // Clear input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleRemove = () => {
        setPreviewUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        if (onRemove) onRemove();
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-center w-full">
                {previewUrl ? (
                    <div className="relative w-full h-64 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                        <img
                            src={previewUrl}
                            alt="Preview"
                            className="w-full h-full object-contain"
                        />
                        <button
                            onClick={handleRemove}
                            className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-md hover:bg-gray-100 transition-colors"
                            type="button"
                        >
                            <X className="w-5 h-5 text-gray-600" />
                        </button>
                        {isUploading && (
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                <Loader2 className="w-8 h-8 text-white animate-spin" />
                            </div>
                        )}
                    </div>
                ) : (
                    <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <div className="p-4 bg-white rounded-full shadow-sm mb-3">
                                <Upload className="w-8 h-8 text-gray-400" />
                            </div>
                            <p className="mb-2 text-sm text-gray-500">
                                <span className="font-semibold">Click to upload</span> or drag and drop
                            </p>
                            <p className="text-xs text-gray-500">SVG, PNG, JPG or GIF (MAX. 800x400px)</p>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={handleFileChange}
                            disabled={isUploading}
                        />
                    </label>
                )}
            </div>
        </div>
    );
}
