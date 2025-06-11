import React from 'react';

const HeroBackground: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Light background */}
      <div className="absolute inset-0 bg-gradient-to-br from-white to-green-50"></div>
      
      {/* Green accent area */}
      <div className="absolute top-0 right-0 w-[45%] h-full bg-green-500 z-0">
        {/* Hexagonal pattern */}
        <div className="absolute top-0 right-0 w-[300px] h-[300px]">
          <div className="absolute top-4 right-4 w-40 h-40 bg-green-400/20 transform rotate-[30deg]" 
               style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }}></div>
          <div className="absolute top-16 right-32 w-32 h-32 bg-green-400/30 transform rotate-[15deg]" 
               style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }}></div>
          <div className="absolute top-4 right-48 w-24 h-24 bg-green-400/25 transform -rotate-[15deg]" 
               style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }}></div>
        </div>
      </div>
    </div>
  );
};

export default HeroBackground;
