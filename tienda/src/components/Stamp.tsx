import { useId } from 'react';

/** Sello de goma con tinta comida. Decorativo salvo que se le pase `label`. */
export function Stamp({ lines, ring, className, label }: { lines: string[]; ring?: string; className?: string; label?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={'stamp ' + (className ?? '')} viewBox="0 0 160 160" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <filter id={`ink-${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves={2} seed={4} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={2.6} result="d" />
          <feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves={2} seed={9} result="s" />
          <feColorMatrix in="s" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.5 1.55" result="m" />
          <feComposite in="d" in2="m" operator="in" />
        </filter>
        <path id={`ring-${id}`} d="M80 80 m-63 0 a63 63 0 1 1 126 0 a63 63 0 1 1 -126 0" fill="none" />
      </defs>
      <g filter={`url(#ink-${id})`}>
        <circle cx="80" cy="80" r="74" fill="none" stroke="currentColor" strokeWidth="3.5" />
        <circle cx="80" cy="80" r={ring ? 52 : 64} fill="none" stroke="currentColor" strokeWidth="1.5" />
        {ring && (
          <text className="stamp-ring">
            <textPath href={`#ring-${id}`} textLength="392" lengthAdjust="spacingAndGlyphs">
              {ring}
            </textPath>
          </text>
        )}
        {lines.map((l, i) => (
          <text key={i} x="80" y={80 + (i - (lines.length - 1) / 2) * 32 + 11} textAnchor="middle" className="stamp-line">
            {l}
          </text>
        ))}
      </g>
    </svg>
  );
}
