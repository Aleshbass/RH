'use client';

import { useRef, useState, type PointerEvent } from 'react';
import { Caveat } from 'next/font/google';

/** Handwriting face for typed signatures (also drawn into the PDF copy). */
export const signatureFont = Caveat({ subsets: ['latin'], weight: ['600'], display: 'swap' });

const W = 600;
const H = 180;

export function TypedSignature({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`${signatureFont.className} block truncate leading-none text-rh-ink ${className}`} aria-label={`Signature: ${name}`}>
      {name}
    </span>
  );
}

export function DrawnSignature({ path, className = '' }: { path: string; className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Drawn signature">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Draw a signature with a finger, pen or mouse. The value is SVG path data on a 600 × 180 pad,
 * so it's small to store and sharp at any size.
 */
export function DrawPad({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);
  const [live, setLive] = useState(value);

  const point = (event: PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current!.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * W;
    const y = ((event.clientY - box.top) / box.height) * H;
    return `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
  };

  const start = (event: PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    setLive((path) => `${path}${path ? ' ' : ''}M${point(event)} L${point(event)}`);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (!drawing.current) return;
    const next = ` L${point(event)}`;
    setLive((path) => path + next);
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setLive((path) => {
      onChange(path);
      return path;
    });
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-inset ring-rh-ink/15">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-36 w-full cursor-crosshair touch-none text-rh-ink"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          aria-label="Signature pad. Draw your signature here."
          role="img"
        >
          <line x1={24} x2={W - 24} y1={H - 40} y2={H - 40} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="6 6" />
          {live && <path d={live} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
        {!live && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-rh-ink/40">
            Sign here with your finger or mouse
          </p>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setLive('');
            onChange('');
          }}
          disabled={!live}
          className="text-sm font-medium text-rh-ink/60 underline-offset-4 hover:text-rh-ink hover:underline disabled:opacity-40 dark:text-white/60 dark:hover:text-white"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
