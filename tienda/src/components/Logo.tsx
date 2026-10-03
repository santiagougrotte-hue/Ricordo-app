import { TAGLINE_D, WORDMARK_D } from '../assets/logo-paths';

/** Logo en un solo color (currentColor). `tagline` agrega "PASTA ARTESANAL SIN GLUTEN". */
export function Logo({ tagline = false, className, title = 'Ricordo' }: { tagline?: boolean; className?: string; title?: string }) {
  return (
    <svg className={className} viewBox={tagline ? '0 0 3548 1132' : '0 0 3548 740'} role="img" aria-label={tagline ? `${title} — Pasta artesanal sin gluten` : title}>
      <g fill="currentColor" fillRule="evenodd">
        <path d={WORDMARK_D} />
        {tagline && <path d={TAGLINE_D} transform="translate(0 812)" />}
      </g>
    </svg>
  );
}
