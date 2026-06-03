import React, {useMemo} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

interface AnimatedMouseProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startFrame: number;
  endFrame: number;
  clickFrame?: number;
}

export const AnimatedMouse: React.FC<AnimatedMouseProps> = ({
  startX,
  startY,
  endX,
  endY,
  startFrame,
  endFrame,
  clickFrame,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const progress = interpolate(frame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const spr = spring({
    fps,
    frame: Math.max(0, frame - startFrame),
    config: {damping: 25, stiffness: 120, mass: 1},
  });

  const x = startX + (endX - startX) * spr;
  const y = startY + (endY - startY) * spr;

  const isClicking = clickFrame !== undefined && frame >= clickFrame && frame < (clickFrame + 6);
  const scale = isClicking ? 0.85 : 1;

  return (
    <div style={{
      position: 'absolute',
      left: x,
      top: y,
      width: 28,
      height: 28,
      transform: `scale(${scale})`,
      zIndex: 10000,
      pointerEvents: 'none',
      transition: 'none',
    }}>
      <svg viewBox="0 0 32 32" width="28" height="28" style={{filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'}}>
        <path
          d="M8 4L8 24L13 19L17 27L20 26L16 18L23 18L8 4Z"
          fill="white"
          stroke="#8A6B4E"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      {isClicking && <ClickRipple x={14} y={14} />}
    </div>
  );
};

export const ClickRipple: React.FC<{x: number; y: number}> = ({x, y}) => {
  const frame = useCurrentFrame();
  const radius = interpolate(frame % 10, [0, 10], [0, 50]);
  const opacity = interpolate(frame % 10, [0, 10], [0.6, 0]);

  return (
    <div style={{
      position: 'absolute',
      left: x - radius,
      top: y - radius,
      width: radius * 2,
      height: radius * 2,
      borderRadius: '50%',
      backgroundColor: `rgba(225, 29, 72, ${opacity})`,
      pointerEvents: 'none',
    }} />
  );
};

interface HighlightBoxProps {
  x: number;
  y: number;
  width: number;
  height: number;
  startFrame: number;
  endFrame: number;
}

export const HighlightBox: React.FC<HighlightBoxProps> = ({x, y, width, height, startFrame, endFrame}) => {
  const frame = useCurrentFrame();

  const safeStart = startFrame;
  const safeEnd = Math.max(endFrame, safeStart + 30);
  const fadeInEnd = safeStart + 10;
  const fadeOutStart = safeEnd - 10;

  const opacity = interpolate(frame, [safeStart, fadeInEnd, fadeOutStart, safeEnd], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{
      position: 'absolute',
      left: x,
      top: y,
      width,
      height,
      border: '3px solid #8A6B4E',
      borderRadius: 8,
      backgroundColor: `rgba(225, 29, 72, 0.08)`,
      opacity,
      zIndex: 100,
      pointerEvents: 'none',
      boxShadow: `0 0 20px rgba(225, 29, 72, 0.3), inset 0 0 20px rgba(225, 29, 72, 0.05)`,
    }} />
  );
};

interface ScreenContainerProps {
  children: React.ReactNode;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({children}) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#1C2E47',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 60,
    }}>
      <div style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#0A0A0A',
        borderRadius: 20,
        boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 40,
          backgroundColor: '#1C2E47',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 16,
          gap: 8,
          zIndex: 50,
        }}>
          <div style={{width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ef4444'}} />
          <div style={{width: 12, height: 12, borderRadius: '50%', backgroundColor: '#f59e0b'}} />
          <div style={{width: 12, height: 12, borderRadius: '50%', backgroundColor: '#22c55e'}} />
          <span style={{color: '#D4A574', fontSize: 12, marginLeft: 12, fontFamily: 'Inter'}}>restoreassist.com.au</span>
        </div>
        <div style={{width: '100%', height: '100%', paddingTop: 40, position: 'relative'}}>
          {children}
        </div>
      </div>
    </div>
  );
};

interface AnnotationProps {
  text: string;
  x: number;
  y: number;
  startFrame: number;
  endFrame: number;
}

export const Annotation: React.FC<AnnotationProps> = ({text, x, y, startFrame, endFrame}) => {
  const frame = useCurrentFrame();

  const safeStart = startFrame;
  const safeEnd = Math.max(endFrame, safeStart + 20);
  const fadeInEnd = safeStart + 7;
  const fadeOutStart = safeEnd - 7;

  const opacity = interpolate(frame, [safeStart, fadeInEnd, fadeOutStart, safeEnd], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const translateY = interpolate(frame, [startFrame, startFrame + 10], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{
      position: 'absolute',
      left: x,
      top: y,
      backgroundColor: '#1C2E47',
      color: '#0A0A0A',
      padding: '12px 20px',
      borderRadius: 12,
      fontSize: 18,
      fontFamily: 'Inter, -apple-system, sans-serif',
      fontWeight: 500,
      maxWidth: 400,
      lineHeight: 1.5,
      opacity,
      transform: `translateY(${translateY}px)`,
      zIndex: 1000,
      boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
      pointerEvents: 'none',
    }}>
      {text}
    </div>
  );
};
