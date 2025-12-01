'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';

interface UploadDocumentModalProps {
    isOpen: boolean;
    onClose: () => void;
    patientId: string;
}

export function UploadDocumentModal({ isOpen, onClose, patientId }: UploadDocumentModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [documentType, setDocumentType] = useState('medicalRecord');
    const [isUploading, setIsUploading] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            toast.error('Please select a file');
            return;
        }

        setIsUploading(true);
        try {
            // Placeholder for actual upload logic
            // In a real implementation, this would:
            // 1. Get an upload URL from Convex
            // 2. Upload the file to the URL
            // 3. Save the storage ID and metadata to the database

            await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate upload

            toast.success('Document uploaded successfully');
            onClose();
            setFile(null);
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Failed to upload document');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Upload Document</DialogTitle>
                    <DialogDescription>
                        Upload a medical record, referral letter, or other document for this patient.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="document-type">Document Type</Label>
                        <select
                            id="document-type"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={documentType}
                            onChange={(e) => setDocumentType(e.target.value)}
                        >
                            <option value="medicalRecord">Medical Record</option>
                            <option value="referralLetter">Referral Letter</option>
                            <option value="insuranceCard">Insurance Card</option>
                            <option value="otherDocument">Other</option>
                        </select>
                    </div>

                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="file">File</Label>
                        <Input id="file" type="file" onChange={handleFileChange} />
                    </div>

                    {file && (
                        <div className="text-sm text-muted-foreground">
                            Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                        </div>
                    )}
                </div>
                <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={onClose} disabled={isUploading}>
                        Cancel
                    </Button>
                    <Button onClick={handleUpload} disabled={!file || isUploading}>
                        {isUploading ? (
                            <>
                                <Upload className="mr-2 h-4 w-4 animate-spin" />
                                Uploading...
                            </>
                        ) : (
                            <>
                                <Upload className="mr-2 h-4 w-4" />
                                Upload
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
