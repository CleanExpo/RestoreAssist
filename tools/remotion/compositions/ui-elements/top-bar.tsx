import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';

export const TopBar: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <div style={{
      height: 56,
      backgroundColor: '#ffffff',
      borderBottom: '1px solid #2A3A55',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
    }}>
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        <div style={{
          width: 260,
          height: 36,
          backgroundColor: '#f1f5f9',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 8,
        }}>
          <span style={{color: '#D4A574', fontSize: 14}}></span>
          <input
            type="text"
            placeholder="Search inspections, clients, reports..."
            style={{
              border: 'none',
              background: 'none',
              outline: 'none',
              fontSize: 13,
              color: '#1C2E47',
              width: '100%',
              fontFamily: 'Inter, sans-serif',
            }}
          />
        </div>
      </div>

      <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          backgroundColor: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
        }}>
          <span style={{fontSize: 16, color: '#8A6B4E'}}></span>
          <span style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: '#8A6B4E',
            border: '2px solid #ffffff',
          }} />
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 12px 4px 4px',
          borderRadius: 20,
          backgroundColor: '#f1f5f9',
          cursor: 'pointer',
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: '#8A6B4E',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            color: '#ffffff',
            fontFamily: 'Inter, sans-serif',
          }}>PM</div>
          <div style={{fontSize: 13, fontWeight: 600, color: '#1C2E47', fontFamily: 'Inter, sans-serif'}}>Admin</div>
        </div>
      </div>
    </div>
  );
};
