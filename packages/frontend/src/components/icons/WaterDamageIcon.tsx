import React from 'react';

interface WaterDamageIconProps {
  className?: string;
  size?: number;
}

export function WaterDamageIcon({ className = '', size = 80 }: WaterDamageIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer circle - metallic silver */}
      <circle cx="60" cy="60" r="58" fill="url(#silverGradient)" stroke="#6B7280" strokeWidth="2"/>

      {/* Inner circle - light grey background */}
      <circle cx="60" cy="60" r="55" fill="#E5E7EB"/>

      {/* Text - WATER DAMAGE (curved top) */}
      <path id="topCurve" d="M 15,60 A 45,45 0 0,1 105,60" fill="none"/>
      <text fontSize="10" fontWeight="700" fill="#1e3a8a" letterSpacing="1.5">
        <textPath href="#topCurve" startOffset="50%" textAnchor="middle">
          WATER DAMAGE
        </textPath>
      </text>

      {/* Water droplet - center top */}
      <path
        d="M60 30 C60 30, 68 42, 68 48 C68 53.523, 64.418 58, 60 58 C55.582 58, 52 53.523, 52 48 C52 42, 60 30, 60 30 Z"
        fill="#1e3a8a"
      />
      {/* Droplet highlight */}
      <ellipse cx="57" cy="44" rx="2" ry="3" fill="#60A5FA" opacity="0.6"/>

      {/* Wave design - center */}
      <g>
        {/* Top wave */}
        <path
          d="M30 62 Q35 58, 40 62 T50 62 Q55 58, 60 62 T70 62 Q75 58, 80 62 T90 62"
          stroke="#2563eb"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        {/* Middle wave */}
        <path
          d="M30 68 Q35 64, 40 68 T50 68 Q55 64, 60 68 T70 68 Q75 64, 80 68 T90 68"
          stroke="#3b82f6"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        {/* Bottom wave */}
        <path
          d="M30 74 Q35 70, 40 74 T50 74 Q55 70, 60 74 T70 74 Q75 70, 80 74 T90 74"
          stroke="#60A5FA"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      </g>

      {/* Tap symbols on both sides */}
      {/* Left tap */}
      <rect x="22" y="60" width="6" height="3" rx="0.5" fill="#1e3a8a"/>
      <rect x="24.5" y="56" width="1" height="4" fill="#1e3a8a"/>
      <line x1="25" y1="63" x2="25" y2="68" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round"/>

      {/* Right tap */}
      <rect x="92" y="60" width="6" height="3" rx="0.5" fill="#1e3a8a"/>
      <rect x="94.5" y="56" width="1" height="4" fill="#1e3a8a"/>
      <line x1="95" y1="63" x2="95" y2="68" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round"/>

      {/* Text - REPORTING SYSTEM (curved bottom) */}
      <path id="bottomCurve" d="M 15,60 A 45,45 0 0,0 105,60" fill="none"/>
      <text fontSize="8" fontWeight="700" fill="#1e3a8a" letterSpacing="1">
        <textPath href="#bottomCurve" startOffset="50%" textAnchor="middle">
          REPORTING SYSTEM
        </textPath>
      </text>

      {/* Gradient definitions */}
      <defs>
        <radialGradient id="silverGradient" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#F3F4F6"/>
          <stop offset="50%" stopColor="#D1D5DB"/>
          <stop offset="100%" stopColor="#9CA3AF"/>
        </radialGradient>
      </defs>
    </svg>
  );
}
