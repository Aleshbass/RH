'use client'

import React, { useMemo } from 'react'

// Lightweight confetti without external deps
// Renders N brand-coloured pieces that fall with CSS animation for a short burst
export default function Confetti({ count = 80, durationMs = 2000 }: { count?: number; durationMs?: number }) {
  const particles = useMemo(() => Array.from({ length: count }), [count])
  const colors = ['#005b57', '#00cd0f', '#2dd4bf', '#e8a54f', '#ffe682', '#ffcfdc']

  return (
    <div className="fixed inset-0 pointer-events-none z-[1000]">
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-100vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {particles.map((_, i) => {
        const left = Math.random() * 100
        const delay = Math.random() * 0.6
        const size = 6 + Math.random() * 6
        const color = colors[Math.floor(Math.random() * colors.length)]
        const maxDuration = Math.max(0.6, durationMs / 1000)
        const duration = 0.6 + Math.random() * (maxDuration - 0.6) // seconds
        return (
          <span
            key={i}
            aria-hidden
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: '-10%',
              width: `${size}px`,
              height: `${size * 0.6}px`,
              borderRadius: '2px',
              background: color,
              animation: `confetti-fall ${duration}s ease-in forwards`,
              animationDelay: `${delay}s`,
            }}
          />
        )
      })}
    </div>
  )
}
