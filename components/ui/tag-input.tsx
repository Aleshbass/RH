import React, { useState, KeyboardEvent } from 'react';
import { X } from '@/components/icons';
import { Input } from './input';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface TagInputProps {
    placeholder?: string;
    tags: string[];
    setTags: (tags: string[]) => void;
    className?: string;
}

export function TagInput({ placeholder, tags, setTags, className }: TagInputProps) {
    const [inputValue, setInputValue] = useState('');

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTag();
        } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
            removeTag(tags.length - 1);
        }
    };

    const addTag = () => {
        const trimmedInput = inputValue.trim();
        if (trimmedInput && !tags.includes(trimmedInput)) {
            setTags([...tags, trimmedInput]);
            setInputValue('');
        }
    };

    const removeTag = (index: number) => {
        setTags(tags.filter((_, i) => i !== index));
    };

    return (
        <div className={cn("flex flex-wrap gap-2 p-2 border rounded-xl bg-white focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2", className)}>
            {tags.map((tag, index) => (
                <span key={index} className="flex items-center gap-1 px-2 py-1 text-sm bg-teal-50 text-teal-700 rounded-md border border-teal-100">
                    {tag}
                    <button type="button" onClick={() => removeTag(index)} className="hover:text-teal-900">
                        <X className="w-3 h-3" />
                    </button>
                </span>
            ))}
            <input
                type="text"
                className="flex-1 min-w-[120px] outline-none bg-transparent text-sm h-8"
                placeholder={tags.length === 0 ? placeholder : ""}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={addTag}
            />
        </div>
    );
}
