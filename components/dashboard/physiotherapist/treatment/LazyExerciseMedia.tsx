import React, { useState, useRef, useEffect } from 'react';
import { Play } from '@/components/icons';

interface ExerciseDetail {
  id: string;
  name: string;
  overview: string;
  imageUrl: string;
  videoUrl: string;
  targetMuscles: string[];
  instructions: string[];
}

interface LazyExerciseMediaProps {
  exerciseDetail?: ExerciseDetail;
  exerciseId: string;
}

export function LazyExerciseMedia({ exerciseDetail, exerciseId }: LazyExerciseMediaProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError] = useState(false);
  const mediaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (mediaRef.current) {
      observer.observe(mediaRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleImageLoad = () => {
    setImageLoaded(true);
  };


  return (
    <div ref={mediaRef} className="relative w-full h-48 bg-gray-100">
      {!isVisible ? (
        // Placeholder while not in viewport
        <div className="w-full h-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
          <div className="text-center">
            <Play className="h-8 w-8 mx-auto text-gray-300 mb-2" />
          </div>
        </div>
      ) : exerciseDetail?.imageUrl && exerciseDetail.imageUrl !== '' && !imageError ? (
        // Display image with loading state
        <div className="relative w-full h-full">
          <img
            src={exerciseDetail.imageUrl}
            alt={exerciseDetail.name}
            className={`w-full h-full object-contain p-2 transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={handleImageLoad}
            onError={() => setImageLoaded(false)}
            onClick={() => {
              if (exerciseDetail.imageUrl) {
                window.open(exerciseDetail.imageUrl, '_blank');
              }
            }}
          />
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
              <div className="text-center">
                <Play className="h-8 w-8 mx-auto text-gray-300 mb-2 animate-pulse" />
              </div>
            </div>
          )}
          {imageLoaded && (
            <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center opacity-0 hover:opacity-100 pointer-events-none">
              <Play className="h-12 w-12 text-white drop-shadow-lg" />
            </div>
          )}
        </div>
      ) : (
        // Fallback placeholder
        <div className="w-full h-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
          <div className="text-center">
            <Play className="h-12 w-12 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">{exerciseDetail?.name || exerciseId}</p>
            <p className="text-xs text-gray-400 mt-1">No media available</p>
          </div>
        </div>
      )
      }
    </div>
  );
}
