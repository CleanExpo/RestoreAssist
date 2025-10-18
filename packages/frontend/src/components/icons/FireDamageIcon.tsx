import React from 'react';

interface FireDamageIconProps {
  className?: string;
  size?: number;
}

export function FireDamageIcon({ className = '', size = 80 }: FireDamageIconProps) {
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

      {/* Text - FIRE DAMAGE (curved top) */}
      <path id="topCurve" d="M 18,60 A 42,42 0 0,1 102,60" fill="none"/>
      <text fontSize="10" fontWeight="700" fill="#1e3a8a" letterSpacing="1.5">
        <textPath href="#topCurve" startOffset="50%" textAnchor="middle">
          FIRE DAMAGE
        </textPath>
      </text>

      {/* House outline - navy blue */}
      <path
        d="M 40 70 L 40 52 L 60 38 L 80 52 L 80 70 Z"
        fill="none"
        stroke="#1e3a8a"
        strokeWidth="3"
        strokeLinejoin="miter"
      />
      {/* House base fill */}
      <path
        d="M 42 70 L 42 54 L 60 42 L 78 54 L 78 70 Z"
        fill="#1e3a8a"
        opacity="0.1"
      />

      {/* Flames - layered for depth */}
      {/* Back flames - orange */}
      <g opacity="0.8">
        <path
          d="M 48 55 Q 46 50, 48 45 Q 50 48, 52 45 Q 54 50, 52 55 Z"
          fill="#FB923C"
        />
        <path
          d="M 68 55 Q 66 50, 68 45 Q 70 48, 72 45 Q 74 50, 72 55 Z"
          fill="#FB923C"
        />
      </g>

      {/* Middle flames - red-orange */}
      <g>
        <path
          d="M 50 58 Q 48 52, 50 46 Q 52 50, 54 46 Q 56 52, 54 58 Z"
          fill="#F97316"
        />
        <path
          d="M 66 58 Q 64 52, 66 46 Q 68 50, 70 46 Q 72 52, 70 58 Z"
          fill="#F97316"
        />
        <path
          d="M 58 60 Q 56 54, 58 48 Q 60 52, 62 48 Q 64 54, 62 60 Z"
          fill="#F97316"
        />
      </g>

      {/* Front flames - bright yellow-orange */}
      <g>
        <path
          d="M 52 62 Q 50 56, 52 50 Q 54 54, 56 50 Q 58 56, 56 62 Z"
          fill="#FB923C"
        />
        <path
          d="M 64 62 Q 62 56, 64 50 Q 66 54, 68 50 Q 70 56, 68 62 Z"
          fill="#FB923C"
        />
        <path
          d="M 58 65 Q 56 58, 58 51 Q 60 56, 62 51 Q 64 58, 62 65 Z"
          fill="#FBBF24"
        />
      </g>

      {/* Top center flame - tallest */}
      <path
        d="M 58 50 Q 56 42, 58 35 Q 60 40, 62 35 Q 64 42, 62 50 Z"
        fill="#FB923C"
      />
      <path
        d="M 59 48 Q 58 43, 59 38 Q 60 42, 61 38 Q 62 43, 61 48 Z"
        fill="#FBBF24"
      />

      {/* Small flame accents */}
      <ellipse cx="54" cy="53" rx="2" ry="3" fill="#FBBF24" opacity="0.8"/>
      <ellipse cx="66" cy="53" rx="2" ry="3" fill="#FBBF24" opacity="0.8"/>
      <ellipse cx="60" cy="45" rx="2" ry="3" fill="#FEF3C7" opacity="0.9"/>

      {/* Smoke - dark grey */}
      <g opacity="0.6">
        <ellipse cx="85" cy="35" rx="4" ry="5" fill="#4B5563"/>
        <ellipse cx="88" cy="32" rx="3" ry="4" fill="#4B5563"/>
        <ellipse cx="82" cy="32" rx="3" ry="4" fill="#6B7280"/>
      </g>

      {/* Text - REPORTING SYSTEM (curved bottom) */}
      <path id="bottomCurve" d="M 18,60 A 42,42 0 0,0 102,60" fill="none"/>
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
