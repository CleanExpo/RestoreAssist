import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';

interface Props {
  title: string;
  value: string;
  change: string;
  changePositive: boolean;
  icon: string;
  highlight?: boolean;
  delay?: number;
}

export const StatCard: React.FC<Props> = ({title, value, change, changePositive, icon, highlight = false, delay = 0}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame - delay, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const scale = interpolate(frame - delay, [0, 30], [0.95, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <div style={{
      backgroundColor: '#ffffff',
      borderRadius: 12,
      border: highlight ? '2px solid #E11D48' : '1px solid #e2e8f0',
      padding: 24,
      opacity: fadeIn,
      transform: `scale(${scale})`,
      boxShadow: highlight ? '0 0 20px rgba(225, 29, 72, 0.15)' : 'none',
      transition: 'box-shadow 0.3s',
    }}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12}}>
        <div style={{fontSize: 13, color: '#64748b', fontFamily: 'system-ui, sans-serif', fontWeight: 500}}>{title}</div>
        <div style={{fontSize: 20}}>{icon}</div>
      </div>
      <div style={{fontSize: 32, fontWeight: 700, color: '#1e293b', fontFamily: 'system-ui, sans-serif', lineHeight: 1}}>{value}</div>
      <div style={{
        fontSize: 13,
        color: changePositive ? '#059669' : '#dc2626',
        marginTop: 8,
        fontWeight: 500,
        fontFamily: 'system-ui, sans-serif',
      }}>{change}</div>
    </div>
  );
};
