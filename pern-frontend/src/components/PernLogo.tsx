import { memo, useId } from 'react';

interface PernLogoProps {
  size?: number;
  className?: string;
  animate?: boolean;
  title?: string;
}

/**
 * PERN brand mark — gradient squircle tile with a rounded "P" letterform
 * and an animated signal pulse along the bottom edge.
 */
export const PernLogo = memo(function PernLogo({
  size = 32,
  className = '',
  animate = true,
  title = 'PERN',
}: PernLogoProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gid = `pern-tile-${uid}`;
  const pulseId = `pern-pulse-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label={title}
      className={`pern-logo ${animate ? 'pern-logo-anim' : ''} ${className}`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
        <linearGradient id={pulseId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {/* Tile */}
      <rect x="2.5" y="2.5" width="43" height="43" rx="13" fill={`url(#${gid})`} />
      <rect x="2.5" y="2.5" width="43" height="43" rx="13" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />

      {/* Top sheen */}
      <path
        d="M6.5 13.5a7 7 0 0 1 7-7h21a7 7 0 0 1 7 7v2.6a7 7 0 0 0-7-7h-21a7 7 0 0 0-7 7z"
        fill="rgba(255,255,255,0.18)"
      />

      {/* P letterform */}
      <path
        d="M15.5 13.8h8.6a6.3 6.3 0 0 1 0 12.6H19.9v9.4h-4.4z"
        fill="#fff"
      />

      {/* Signal pulse */}
      <path
        d="M20.5 38.2h2l1.6-2.6 1.9 2.6h2.2l1.7-2.4 1.7 2.4h3.2"
        fill="none"
        stroke={`url(#${pulseId})`}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});
