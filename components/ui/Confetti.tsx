'use client'

import React, { useMemo } from 'react'

// Lightweight confetti without external deps
// Renders N emoji particles that fall with CSS animation for a short burst
export default function Confetti({ count = 80, durationMs = 2000 }: { count?: number; durationMs?: number }) {
  const particles = useMemo(() => Array.from({ length: count }), [count])
  const emojis = ['🎉', '✨', '🎊', '💚', '💙', '💜']

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
        const size = 16 + Math.random() * 12
        const emoji = emojis[Math.floor(Math.random() * emojis.length)]
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
              fontSize: `${size}px`,
              animation: `confetti-fall ${duration}s ease-in forwards`,
              animationDelay: `${delay}s`,
              filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.15))',
            }}
          >
            {emoji}
          </span>
        )
      })}
    </div>
  )
}
