import React from 'react';

interface MouldDamageIconProps {
  className?: string;
  size?: number;
}

export function MouldDamageIcon({ className = '', size = 80 }: MouldDamageIconProps) {
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
        <linearGradient id="silverGradientMould" x1="0%" y1="0%" x2="100%" y2="100%">
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
        fill="url(#silverGradientMould)"
        stroke="#6B7280"
        strokeWidth="2"
      />

      {/* Inner light grey background */}
      <circle cx="60" cy="60" r="55" fill="#E5E7EB" />

      {/* "MOULD DAMAGE" curved text at top */}
      <defs>
        <path
          id="topCurveMould"
          d="M 20,60 A 40,40 0 0,1 100,60"
          fill="none"
        />
      </defs>
      <text fontSize="11" fontWeight="bold" fill="#1e3a8a" fontFamily="Arial, sans-serif">
        <textPath href="#topCurveMould" startOffset="50%" textAnchor="middle">
          MOULD DAMAGE
        </textPath>
      </text>

      {/* House outline in navy blue */}
      <path
        d="M 38 70 L 38 52 L 60 40 L 82 52 L 82 70 Z"
        fill="none"
        stroke="#1e3a8a"
        strokeWidth="3"
        strokeLinejoin="miter"
      />

      {/* House roof line */}
      <line x1="38" y1="52" x2="82" y2="52" stroke="#1e3a8a" strokeWidth="3" />

      {/* Mould spores/particles above the house - organic cloud shapes */}
      {/* Large mould cloud formations */}
      <circle cx="52" cy="35" r="4" fill="#1e3a8a" />
      <circle cx="58" cy="33" r="5" fill="#1e3a8a" />
      <circle cx="65" cy="34" r="4.5" fill="#1e3a8a" />
      <circle cx="71" cy="36" r="4" fill="#1e3a8a" />

      {/* Additional small spore dots */}
      <circle cx="48" cy="37" r="2" fill="#1e3a8a" opacity="0.8" />
      <circle cx="62" cy="38" r="2.5" fill="#1e3a8a" opacity="0.8" />
      <circle cx="75" cy="38" r="2" fill="#1e3a8a" opacity="0.8" />
      <circle cx="54" cy="40" r="1.5" fill="#1e3a8a" opacity="0.7" />
      <circle cx="68" cy="40" r="1.5" fill="#1e3a8a" opacity="0.7" />

      {/* Magnifying glass handle */}
      <rect
        x="66"
        y="62"
        width="3"
        height="16"
        fill="#1e3a8a"
        transform="rotate(45 67.5 70)"
      />

      {/* Magnifying glass circle/lens */}
      <circle
        cx="60"
        cy="58"
        r="10"
        fill="none"
        stroke="#1e3a8a"
        strokeWidth="3"
      />

      {/* Mould spores inside magnifying glass - detailed view */}
      {/* Central mould cluster in magnifying glass */}
      <circle cx="60" cy="58" r="4" fill="#1e3a8a" opacity="0.6" />

      {/* Spore details - small circles around center */}
      <circle cx="56" cy="56" r="1.5" fill="#1e3a8a" />
      <circle cx="64" cy="56" r="1.5" fill="#1e3a8a" />
      <circle cx="56" cy="60" r="1.5" fill="#1e3a8a" />
      <circle cx="64" cy="60" r="1.5" fill="#1e3a8a" />
      <circle cx="58" cy="54" r="1.2" fill="#1e3a8a" />
      <circle cx="62" cy="54" r="1.2" fill="#1e3a8a" />
      <circle cx="58" cy="62" r="1.2" fill="#1e3a8a" />
      <circle cx="62" cy="62" r="1.2" fill="#1e3a8a" />

      {/* Small radiating spores from center */}
      <circle cx="53" cy="58" r="1" fill="#1e3a8a" opacity="0.7" />
      <circle cx="67" cy="58" r="1" fill="#1e3a8a" opacity="0.7" />
      <circle cx="60" cy="51" r="1" fill="#1e3a8a" opacity="0.7" />
      <circle cx="60" cy="65" r="1" fill="#1e3a8a" opacity="0.7" />

      {/* "REPORTING SYSTEM" curved text at bottom */}
      <defs>
        <path
          id="bottomCurveMould"
          d="M 20,60 A 40,40 0 0,0 100,60"
          fill="none"
        />
      </defs>
      <text fontSize="11" fontWeight="bold" fill="#1e3a8a" fontFamily="Arial, sans-serif">
        <textPath href="#bottomCurveMould" startOffset="50%" textAnchor="middle">
          REPORTING SYSTEM
        </textPath>
      </text>
    </svg>
  );
}
