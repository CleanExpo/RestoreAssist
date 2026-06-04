import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

export const OutroSlide = ({title, subtitle}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{
      backgroundColor: '#1C2E47',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 48,
        opacity: Math.min(1, frame / 20),
      }}>
        <div style={{width: 56, height: 56, borderRadius: 14, backgroundColor: '#8A6B4E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28}}><img src='/logo.png' style={{width: 40, height: 'auto', objectFit: 'contain'}} /></div>
        <div style={{fontSize: 28, fontWeight: 700, color: '#ffffff'}}>{subtitle}</div>
      </div>

      <h1 style={{
        fontSize: 56,
        fontWeight: 800,
        color: '#ffffff',
        textAlign: 'center',
        maxWidth: 900,
        lineHeight: 1.2,
        margin: 0,
        opacity: Math.min(1, (frame - 5) / 25),
      }}>{title}</h1>

      <div style={{
        marginTop: 48,
        display: 'flex',
        gap: 16,
        opacity: Math.min(1, (frame - 15) / 25),
      }}>
        {['Water Damage', 'Fire & Smoke', 'Mould', 'Storm', 'Sewage'].map((tag, i) => (
          <span key={tag} style={{
            padding: '8px 20px',
            borderRadius: 20,
            backgroundColor: '#1C2E47',
            color: '#D4A574',
            fontSize: 14,
            fontWeight: 500,
            border: '1px solid #1C2E47',
            opacity: interpolate(frame - 15 - i * 8, [0, 15], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
          }}>{tag}</span>
        ))}
      </div>

      <div style={{
        marginTop: 60,
        fontSize: 16,
        color: '#8A6B4E',
        opacity: Math.min(1, (frame - 30) / 25),
      }}>
        restoreassist.app
      </div>
    </AbsoluteFill>
  );
};
