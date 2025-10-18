import React from 'react';

interface FloodDamageIconProps {
  className?: string;
  size?: number;
}

export function FloodDamageIcon({ className = '', size = 80 }: FloodDamageIconProps) {
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
        <linearGradient id="silverGradientFlood" x1="0%" y1="0%" x2="100%" y2="100%">
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
        fill="url(#silverGradientFlood)"
        stroke="#6B7280"
        strokeWidth="2"
      />

      {/* Inner light grey background */}
      <circle cx="60" cy="60" r="55" fill="#E5E7EB" />

      {/* "FLOOD DAMAGE" curved text at top */}
      <defs>
        <path
          id="topCurveFlood"
          d="M 20,60 A 40,40 0 0,1 100,60"
          fill="none"
        />
      </defs>
      <text fontSize="11" fontWeight="bold" fill="#1e3a8a" fontFamily="Arial, sans-serif">
        <textPath href="#topCurveFlood" startOffset="50%" textAnchor="middle">
          FLOOD DAMAGE
        </textPath>
      </text>

      {/* House outline in navy blue */}
      <path
        d="M 35 65 L 35 50 L 60 35 L 85 50 L 85 65 Z"
        fill="none"
        stroke="#1e3a8a"
        strokeWidth="3"
        strokeLinejoin="miter"
      />

      {/* House roof line */}
      <line x1="35" y1="50" x2="85" y2="50" stroke="#1e3a8a" strokeWidth="3" />

      {/* Window - 4 panes */}
      <rect x="54" y="42" width="4" height="4" fill="#1e3a8a" />
      <rect x="62" y="42" width="4" height="4" fill="#1e3a8a" />
      <rect x="54" y="48" width="4" height="4" fill="#1e3a8a" />
      <rect x="62" y="48" width="4" height="4" fill="#1e3a8a" />

      {/* Window frame */}
      <rect x="52" y="40" width="16" height="14" fill="none" stroke="#1e3a8a" strokeWidth="2" />

      {/* Flood water waves - layered navy blue waves */}
      {/* Bottom wave layer */}
      <path
        d="M 25 70 Q 32 68 38 70 T 52 70 T 66 70 T 80 70 T 95 70 L 95 85 L 25 85 Z"
        fill="#1e3a8a"
        opacity="0.9"
      />

      {/* Middle wave layer */}
      <path
        d="M 25 66 Q 30 64 36 66 T 48 66 T 60 66 T 72 66 T 84 66 T 95 66 L 95 70 L 25 70 Z"
        fill="#1e3a8a"
        opacity="0.7"
      />

      {/* Top wave layer - creating flowing water effect */}
      <path
        d="M 25 62 Q 28 60 32 62 T 40 62 T 48 62 T 56 62 T 64 62 T 72 62 T 80 62 T 88 62 T 95 62 L 95 66 L 25 66 Z"
        fill="#1e3a8a"
        opacity="0.5"
      />

      {/* Water splashes/droplets */}
      <ellipse cx="30" cy="58" rx="2" ry="3" fill="#1e3a8a" opacity="0.6" />
      <ellipse cx="45" cy="56" rx="2" ry="3" fill="#1e3a8a" opacity="0.6" />
      <ellipse cx="75" cy="57" rx="2" ry="3" fill="#1e3a8a" opacity="0.6" />
      <ellipse cx="90" cy="59" rx="2" ry="3" fill="#1e3a8a" opacity="0.6" />

      {/* "REPORTING SYSTEM" curved text at bottom */}
      <defs>
        <path
          id="bottomCurveFlood"
          d="M 20,60 A 40,40 0 0,0 100,60"
          fill="none"
        />
      </defs>
      <text fontSize="11" fontWeight="bold" fill="#1e3a8a" fontFamily="Arial, sans-serif">
        <textPath href="#bottomCurveFlood" startOffset="50%" textAnchor="middle">
          REPORTING SYSTEM
        </textPath>
      </text>
    </svg>
  );
}
