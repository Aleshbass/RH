import React, { useState, useRef, useEffect } from 'react';
import { Play } from 'lucide-react';

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
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
          <div className="text-center">
            <Play className="h-8 w-8 mx-auto text-gray-300 mb-2" />
            <p className="text-xs text-gray-400">Loading...</p>
          </div>
        </div>
      ) : exerciseDetail?.imageUrl && exerciseDetail.imageUrl !== '' && !imageError ? (
        // Display image with loading state
        <div className="relative w-full h-full">
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
              <div className="text-center">
                <Play className="h-8 w-8 mx-auto text-gray-300 mb-2 animate-pulse" />
                <p className="text-xs text-gray-400">Loading image...</p>
              </div>
            </div>
          )}
          <div 
            className={`w-full h-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center cursor-pointer transition-opacity duration-300 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={() => {
              handleImageLoad();
              // Open image in new tab for better viewing
              if (exerciseDetail.imageUrl) {
                window.open(exerciseDetail.imageUrl, '_blank');
              }
            }}
          >
            <div className="text-center text-sm text-muted-foreground">
              <div className="h-8 w-8 mx-auto mb-2 bg-gray-300 rounded" />
              Exercise Image
            </div>
          </div>
          {imageLoaded && (
            <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center opacity-0 hover:opacity-100">
              <Play className="h-12 w-12 text-white drop-shadow-lg" />
            </div>
          )}
        </div>
      ) : (
        // Fallback placeholder
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
          <div className="text-center">
            <Play className="h-12 w-12 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">{exerciseDetail?.name || exerciseId}</p>
            <p className="text-xs text-gray-400 mt-1">No media available</p>
          </div>
        </div>
      )}
    </div>
  );
}
