import { ChangeEvent, useRef, useState } from 'react';

interface FileUploadProps {
  id: string;
  label: string;
  helpText?: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  value?: File | File[];
  onChange: (files: File | File[] | null) => void;
  onError?: (error: string) => void;
  maxSizeInMB?: number;
}

export default function FileUpload({
  id,
  label,
  helpText,
  accept,
  multiple = false,
  required = false,
  value,
  onChange,
  onError,
  maxSizeInMB = 10,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const validateFile = (file: File): boolean => {
    // Size validation (default 10MB or custom size)
    const maxSize = maxSizeInMB * 1024 * 1024; // Convert MB to bytes
    if (file.size > maxSize) {
      const errorMsg = `File size must be less than ${maxSizeInMB}MB`;
      setError(errorMsg);
      onError?.(errorMsg);
      return false;
    }

    // Type validation
    if (accept) {
      const acceptedTypes = accept.split(',').map(type => type.trim());
      const fileType = (file.type || '').toLowerCase();

      // Fallback to extension-based detection when file.type is missing or atypical
      const ext = (file.name.split('.')?.pop() || '').toLowerCase();
      const extToMime: Record<string, string> = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
      };
      const derivedType = extToMime[ext];

      // Account for common non-standard variants browsers may report
      const normalizeType = (t: string) => {
        const lower = t.toLowerCase();
        if (lower === 'image/jpg') return 'image/jpeg';
        if (lower === 'application/x-pdf') return 'application/pdf';
        if (lower === 'image/pjpeg') return 'image/jpeg';
        return lower;
      };

      const candidateType = normalizeType(fileType || derivedType || '');

      const isValidType = acceptedTypes.some(type => {
        const normalizedAccept = normalizeType(type);
        if (normalizedAccept.includes('/*')) {
          // Handle wildcards like 'image/*'
          const [category] = normalizedAccept.split('/');
          // If we have a candidateType, test against it; otherwise infer from ext
          if (candidateType) return candidateType.startsWith(category + '/');
          return !!derivedType && derivedType.startsWith(category + '/');
        }
        // Exact match against candidateType OR extension-derived type
        return (
          (candidateType && candidateType === normalizedAccept) ||
          (derivedType && normalizeType(derivedType) === normalizedAccept)
        );
      });

      if (!isValidType) {
        const errorMsg = `File type must be one of: ${accept}`;
        setError(errorMsg);
        onError?.(errorMsg);
        return false;
      }
    }

    setError(null);
    return true;
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      onChange(multiple ? [] : null);
      return;
    }

    if (multiple) {
      // Handle multiple files
      const validFiles = Array.from(files).filter(validateFile);
      // Important: If we already have files in value, add the new ones
      if (Array.isArray(value) && value.length > 0) {
        const combinedFiles = [...value, ...validFiles];
        onChange(combinedFiles);
      } else {
        onChange(validFiles.length > 0 ? validFiles : []);
      }
    } else {
      // Handle single file
      const file = files[0];
      if (!validateFile(file)) {
        onChange(null);
        return;
      }
      onChange(file);
    }

    // Reset input value so the same file can be selected again if needed
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  // Handle file removal
  const handleRemoveFile = (fileToRemove: File) => {
    if (multiple && Array.isArray(value)) {
      const newFiles = value.filter(file => file !== fileToRemove);
      onChange(newFiles.length > 0 ? newFiles : null);
    } else {
      onChange(null);
    }
  };

  // Retry upload for a specific file
  const handleRetry = () => {
    setError(null);
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-sm font-medium text-[#002e2c]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {helpText && (
        <p className="mt-1 text-sm text-gray-500">{helpText}</p>
      )}
      
      {/* File Input */}
      <div className="mt-2">
        <input
          ref={inputRef}
          type="file"
          id={id}
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          // The 'required' prop is intentionally not passed to the native input.
          // Form-level validation (e.g., with Zod) should handle if the field is mandatory.
          // The component's 'required' prop is used for visual cues (e.g., asterisk in label).
          aria-describedby={`${id}-help ${id}-error`}
          aria-invalid={!!error}
          className="block w-full text-sm text-gray-700
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-medium
            file:bg-[#005b57] file:text-white
            hover:file:cursor-pointer hover:file:bg-[#002e2c]
            focus:outline-none focus:ring-2 focus:ring-[#005b57] focus:ring-offset-2"
        />
      </div>
      
      {/* Error Message with Retry */}
      {error && (
        <div id={`${id}-error`} className="mt-2 flex items-center">
          <p className="text-red-500 text-sm">{error}</p>
          <button 
            type="button" 
            onClick={handleRetry}
            className="ml-2 text-sm text-[#005b57] hover:underline focus:outline-none focus:ring-2 focus:ring-[#005b57] focus:ring-offset-1 rounded-sm"
            aria-label="Retry upload"
          >
            Retry
          </button>
        </div>
      )}
      
      {/* Display Uploaded Files */}
      {value && (
        <ul id={`${id}-filelist`} className="mt-3 space-y-2" aria-live="polite">
          {Array.isArray(value) ? (
            value.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center justify-between bg-gray-50 p-2 rounded-md">
                <div className="flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#005b57] mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm truncate max-w-xs">{file.name}</span>
                  <span className="text-xs text-gray-500 ml-2">({formatFileSize(file.size)})</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(file)}
                  className="text-gray-500 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 rounded-full p-1"
                  aria-label={`Remove file ${file.name}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))
          ) : (
            <li className="flex items-center justify-between bg-gray-50 p-2 rounded-md">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#005b57] mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm truncate max-w-xs">{(value as File).name}</span>
                <span className="text-xs text-gray-500 ml-2">({formatFileSize((value as File).size)})</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveFile(value as File)}
                className="text-gray-500 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 rounded-full p-1"
                aria-label={`Remove file ${(value as File).name}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
