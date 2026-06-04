import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';

interface Props {
  activeItem: string;
  frame: number;
  startFrame: number;
  endFrame: number;
}

export const Sidebar: React.FC<Props> = ({activeItem, startFrame, endFrame}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [startFrame - 10, startFrame, endFrame, endFrame + 20], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const items = [
    {id: 'dashboard', label: 'Dashboard', icon: '📊'},
    {id: 'inspections', label: 'Inspections', icon: '📋'},
    {id: 'reports', label: 'Reports', icon: '📄'},
    {id: 'clients', label: 'Clients', icon: '👥'},
    {id: 'invoices', label: 'Invoices', icon: '💵'},
    {id: 'analytics', label: 'Analytics', icon: '📈'},
  ];

  return (
    <div style={{
      width: 240,
      backgroundColor: '#ffffff',
      borderRight: '1px solid #2A3A55',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 12px',
      opacity,
    }}>
      <div style={{
        padding: '0 12px 16px',
        borderBottom: '1px solid #2A3A55',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: '#8A6B4E',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
        }}><img src='/logo.png' style={{width: 24, height: 'auto', objectFit: 'contain'}} /></div>
        <div>
          <div style={{fontSize: 15, fontWeight: 700, color: '#1C2E47', fontFamily: 'Inter, sans-serif'}}>RestoreAssist</div>
          <div style={{fontSize: 11, color: '#D4A574', marginTop: -2, fontFamily: 'Inter, sans-serif'}}>Restoration Toolkit</div>
        </div>
      </div>

      {items.map((item) => (
        <div key={item.id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 12px',
          borderRadius: 8,
          marginBottom: 4,
          backgroundColor: activeItem === item.id ? '#fef2f2' : 'transparent',
          color: activeItem === item.id ? '#8A6B4E' : '#8A6B4E',
          fontSize: 14,
          fontWeight: activeItem === item.id ? 600 : 500,
          fontFamily: 'Inter, -apple-system, sans-serif',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}>
          <span style={{fontSize: 16}}>{item.icon}</span>
          <span>{item.label}</span>
        </div>
      ))}

      <div style={{marginTop: 'auto', padding: '8px 12px', borderTop: '1px solid #2A3A55'}}>
        <div style={{
          fontSize: 12,
          color: '#D4A574',
          fontFamily: 'Inter, sans-serif',
        }}>© RestoreAssist</div>
      </div>
    </div>
  );
};
