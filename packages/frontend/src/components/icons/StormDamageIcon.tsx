import React from 'react';

interface StormDamageIconProps {
  className?: string;
  size?: number;
}

export function StormDamageIcon({ className = '', size = 80 }: StormDamageIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Metallic silver gradient for outer ring */}
        <linearGradient id="silverGradientStorm" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#D1D5DB" />
          <stop offset="50%" stopColor="#9CA3AF" />
          <stop offset="100%" stopColor="#D1D5DB" />
        </linearGradient>
      </defs>

      {/* Outer metallic silver circle */}
      <circle
        cx="60"
        cy="60"
        r="58"
        fill="url(#silverGradientStorm)"
        stroke="#6B7280"
        strokeWidth="2"
      />

      {/* Inner light grey background */}
      <circle cx="60" cy="60" r="55" fill="#E5E7EB" />

      {/* "STORM DAMAGE" curved text at top */}
      <defs>
        <path
          id="topCurveStorm"
          d="M 20,60 A 40,40 0 0,1 100,60"
          fill="none"
        />
      </defs>
      <text fontSize="11" fontWeight="bold" fill="#1e3a8a" fontFamily="Arial, sans-serif">
        <textPath href="#topCurveStorm" startOffset="50%" textAnchor="middle">
          STORM DAMAGE
        </textPath>
      </text>

      {/* Dark blue storm cloud */}
      <ellipse cx="50" cy="36" rx="12" ry="8" fill="#1e3a8a" />
      <ellipse cx="60" cy="34" rx="14" ry="10" fill="#1e3a8a" />
      <ellipse cx="70" cy="36" rx="12" ry="8" fill="#1e3a8a" />
      <rect x="38" y="36" width="44" height="8" fill="#1e3a8a" />

      {/* House outline in navy blue */}
      <path
        d="M 40 70 L 40 55 L 60 45 L 80 55 L 80 70 Z"
        fill="none"
        stroke="#1e3a8a"
        strokeWidth="3"
        strokeLinejoin="miter"
      />

      {/* House roof line */}
      <line x1="40" y1="55" x2="80" y2="55" stroke="#1e3a8a" strokeWidth="3" />

      {/* Window - 4 panes */}
      <rect x="54" y="60" width="4" height="4" fill="#1e3a8a" />
      <rect x="62" y="60" width="4" height="4" fill="#1e3a8a" />
      <rect x="54" y="66" width="4" height="4" fill="#1e3a8a" />
      <rect x="62" y="66" width="4" height="4" fill="#1e3a8a" />

      {/* Window frame */}
      <rect x="52" y="58" width="16" height="14" fill="none" stroke="#1e3a8a" strokeWidth="2" />

      {/* Rain lines in blue */}
      <line x1="30" y1="44" x2="26" y2="54" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
      <line x1="38" y1="44" x2="34" y2="54" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />

      {/* Yellow lightning bolt */}
      <path
        d="M 48 44 L 44 52 L 48 52 L 45 60 L 54 50 L 49 50 L 52 44 Z"
        fill="#FBBF24"
        stroke="#F59E0B"
        strokeWidth="1"
      />

      {/* Wind lines in grey */}
      <path
        d="M 82 55 Q 86 55 88 57"
        fill="none"
        stroke="#9CA3AF"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M 82 60 Q 88 60 92 62"
        fill="none"
        stroke="#9CA3AF"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M 82 65 Q 86 65 88 67"
        fill="none"
        stroke="#9CA3AF"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* "REPORTING SYSTEM" curved text at bottom */}
      <defs>
        <path
          id="bottomCurveStorm"
          d="M 20,60 A 40,40 0 0,0 100,60"
          fill="none"
        />
      </defs>
      <text fontSize="11" fontWeight="bold" fill="#1e3a8a" fontFamily="Arial, sans-serif">
        <textPath href="#bottomCurveStorm" startOffset="50%" textAnchor="middle">
          REPORTING SYSTEM
        </textPath>
      </text>
    </svg>
  );
}
