import React from 'react';

const HeroBackground: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Sleek milky/cream background */}
      <div className="absolute inset-0 bg-[#F5F0EA]"></div>
      
      {/* Subtle warm radial glow */}
      <div 
        className="absolute top-[-20%] right-[-10%] w-[60%] h-[80%] rounded-full opacity-40"
        style={{ background: 'radial-gradient(ellipse, #EDE6DA 0%, transparent 70%)' }}
      ></div>
      <div 
        className="absolute bottom-[-30%] left-[-10%] w-[50%] h-[70%] rounded-full opacity-30"
        style={{ background: 'radial-gradient(ellipse, #E8E0D4 0%, transparent 70%)' }}
      ></div>
    </div>
  );
};

export default HeroBackground;
