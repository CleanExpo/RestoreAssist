// @ts-nocheck
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

export const IntroSlide = ({title}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 25, 60, 90], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const scale = interpolate(frame, [0, 25], [0.9, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const logoY = interpolate(frame, [0, 20], [30, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{backgroundColor: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif'}}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 40,
        opacity: Math.min(1, frame / 15),
        transform: `translateY(${logoY}px)`,
      }}>
        <div style={{width: 64, height: 64, borderRadius: 16, backgroundColor: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32}}>🏗</div>
        <div>
          <div style={{fontSize: 36, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em'}}>RestoreAssist</div>
          <div style={{fontSize: 16, color: '#94a3b8', marginTop: 4}}>Restoration Management Platform</div>
        </div>
      </div>

      <h1 style={{
        fontSize: 52,
        fontWeight: 800,
        color: '#ffffff',
        textAlign: 'center',
        maxWidth: 900,
        lineHeight: 1.2,
        margin: 0,
        opacity: Math.min(1, (frame - 10) / 20),
        transform: `scale(${scale})`,
      }}>{title}</h1>

      <div style={{
        fontSize: 20,
        color: '#64748b',
        marginTop: 24,
        opacity: Math.min(1, (frame - 20) / 20),
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span>⏱</span> Tutorial
      </div>
    </AbsoluteFill>
  );
};
