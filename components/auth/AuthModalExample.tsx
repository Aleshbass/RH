'use client';

import React, { useState, useEffect } from 'react';
import { AuthModal } from './AuthModal';
import { Button } from '@/components/ui/button';
import './auth-modal.css';

export function AuthModalExample() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'signin' | 'signup'>('signin');

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }

    // Cleanup on unmount
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isModalOpen]);

  const openSignIn = () => {
    setModalMode('signin');
    setIsModalOpen(true);
  };

  const openSignUp = () => {
    setModalMode('signup');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#FAF6E7] flex items-center justify-center p-8">
      {/* Example page content */}
      <div className="text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-[#002e2c]">
            RehabifyHealth Authentication
          </h1>
          <p className="text-lg text-[#005b57] max-w-2xl mx-auto">
            This demonstrates the new modal-based authentication system with stable layouts, 
            smooth transitions, and no layout collapse issues.
          </p>
        </div>

        {/* Demo buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            onClick={openSignIn}
            className="h-12 px-8 bg-gradient-to-r from-[#002e2c] to-[#005b57] hover:opacity-90 text-white font-semibold rounded-md transition-all duration-200 hover:scale-105"
          >
            Open Sign In Modal
          </Button>
          <Button
            onClick={openSignUp}
            variant="outline"
            className="h-12 px-8 border-2 border-[#005b57] text-[#005b57] hover:bg-[#005b57] hover:text-white font-semibold rounded-md transition-all duration-200 hover:scale-105"
          >
            Open Sign Up Modal
          </Button>
        </div>

        {/* Features list */}
        <div className="mt-12 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#002e2c] mb-6">Key Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="font-semibold text-[#002e2c] mb-2">🎯 Stable Layout</h3>
              <p className="text-gray-600">
                Fixed container height prevents collapse and maintains consistent UI dimensions
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="font-semibold text-[#002e2c] mb-2">Smooth Transitions</h3>
              <p className="text-gray-600">
                Fade and scale animations instead of jarring collapse effects
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="font-semibold text-[#002e2c] mb-2">🚫 No Layout Shift</h3>
              <p className="text-gray-600">
                Background content stays stable when modal opens/closes
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="font-semibold text-[#002e2c] mb-2">📱 Responsive Design</h3>
              <p className="text-gray-600">
                Works perfectly on mobile, tablet, and desktop with consistent styling
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isModalOpen} 
        onClose={closeModal} 
        initialMode={modalMode}
      />
    </div>
  );
}
