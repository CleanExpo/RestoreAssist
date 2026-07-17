import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

export const BYOKExplainer = () => {
  const frame = useCurrentFrame();

  const heroOpacity = interpolate(frame, [0, 25, 110, 140], [0, 1, 1, 0]);
  const whatOpacity = interpolate(frame, [120, 150, 290, 320], [0, 1, 1, 0]);
  const inputsOpacity = interpolate(frame, [280, 310, 520, 550], [0, 1, 1, 0]);
  const workflowOpacity = interpolate(frame, [510, 540, 750, 780], [0, 1, 1, 0]);
  const benefitOpacity = interpolate(frame, [730, 760, 920, 950], [0, 1, 1, 0]);
  const ctaOpacity = interpolate(frame, [930, 960, 1200, 1230], [0, 1, 1, 0]);

  const inputs = [
    {category: 'Moisture Meters', items: ['Tramex ME5', 'Protimeter BLD5360', 'Delmhorst BD-2100', 'FLIR MR176']},
    {category: 'Thermal Cameras', items: ['FLIR ONE Pro', 'Seek Thermal ShotPRO', 'Hikmicro B20']},
    {category: 'Air Quality', items: ['AeroTrak 9303', 'TSI DustTrak', 'GrayWolf Classic']},
    {category: 'Documentation', items: ['Open Standards (CSV/JSON)', 'Photo Exif Data', 'Timestamp Logs']},
  ];

  return (
    <AbsoluteFill style={{fontFamily: 'Inter, sans-serif'}}>
      {/* Hero */}
      <div style={{position: 'absolute', inset: 0, opacity: heroOpacity}}>
        <AbsoluteFill style={{backgroundColor: '#1C2E47', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{
            padding: '20px 40px',
            borderRadius: 12,
            backgroundColor: '#1C2E47',
            border: '2px solid #8A6B4E',
            marginBottom: 32,
            opacity: Math.min(1, frame / 20),
          }}>
            <span style={{fontSize: 16, fontWeight: 700, color: '#8A6B4E', letterSpacing: '0.1em'}}>BYOK</span>
          </div>
          <h1 style={{fontSize: 56, fontWeight: 800, color: '#ffffff', textAlign: 'center', margin: 0}}>
            Bring Your Own<br />Knowledge & Equipment
          </h1>
          <p style={{fontSize: 20, color: '#8A6B4E', marginTop: 24, textAlign: 'center', maxWidth: 600}}>
            No vendor lock-in. No forced hardware. RestoreAssist works with the tools you already own.
          </p>
        </AbsoluteFill>
      </div>

      {/* What is BYOK */}
      <div style={{position: 'absolute', inset: 0, opacity: whatOpacity}}>
        <AbsoluteFill style={{backgroundColor: '#0A0A0A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60}}>
          <h2 style={{fontSize: 36, fontWeight: 700, color: '#1C2E47', marginBottom: 16}}>What does BYOK mean?</h2>
          <p style={{fontSize: 18, color: '#8A6B4E', marginBottom: 48, textAlign: 'center', maxWidth: 700}}>
            BYOK (Bring Your Own Knowledge) means RestoreAssit integrates with your existing equipment, data formats, and workflows — no proprietary hardware required.
          </p>
          <div style={{display: 'flex', gap: 32}}>
            {[
              {icon: '🔧', title: 'Your Equipment', desc: 'Any moisture meter, thermal camera, or air quality sensor'},
              {icon: '📡', title: 'Your Data', desc: 'CSV, JSON, or direct Bluetooth readings'},
              {icon: '🔓', title: 'Your Control', desc: 'Export anything, anytime — no lock-in'},
            ].map((item, i) => (
              <div key={item.title} style={{
                width: 300,
                padding: 32,
                borderRadius: 16,
                backgroundColor: '#ffffff',
                border: '1px solid #2A3A55',
                textAlign: 'center',
                opacity: interpolate(frame - 150 - i * 15, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
              }}>
                <div style={{fontSize: 36, marginBottom: 16}}>{item.icon}</div>
                <h3 style={{fontSize: 18, fontWeight: 700, color: '#1C2E47', marginBottom: 8}}>{item.title}</h3>
                <p style={{fontSize: 14, color: '#8A6B4E', lineHeight: 1.5}}>{item.desc}</p>
              </div>
            ))}
          </div>
        </AbsoluteFill>
      </div>

      {/* Compatible Equipment */}
      <div style={{position: 'absolute', inset: 0, opacity: inputsOpacity}}>
        <AbsoluteFill style={{backgroundColor: '#1C2E47', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60}}>
          <h2 style={{fontSize: 32, fontWeight: 700, color: '#ffffff', marginBottom: 48}}>Compatible Equipment</h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 20,
            maxWidth: 900,
          }}>
            {inputs.map((cat, i) => (
              <div key={cat.category} style={{
                padding: 24,
                borderRadius: 12,
                backgroundColor: '#1C2E47',
                border: '1px solid #1C2E47',
                opacity: interpolate(frame - 310 - i * 12, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
              }}>
                <h3 style={{fontSize: 16, fontWeight: 700, color: '#8A6B4E', margin: '0 0 12px'}}>{cat.category}</h3>
                {cat.items.map((item) => (
                  <div key={item} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 0',
                    fontSize: 14,
                    color: '#D4A574',
                  }}>
                    <span>✓</span> {item}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </AbsoluteFill>
      </div>

      {/* Workflow */}
      <div style={{position: 'absolute', inset: 0, opacity: workflowOpacity}}>
        <AbsoluteFill style={{backgroundColor: '#0A0A0A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60}}>
          <h2 style={{fontSize: 32, fontWeight: 700, color: '#1C2E47', marginBottom: 48}}>How It Works</h2>
          <div style={{display: 'flex', alignItems: 'center', gap: 0, maxWidth: 1000}}>
            {[
              {step: '1', label: 'Take Reading', icon: '📊'},
              {step: '2', label: 'Bluetooth / Manual', icon: '📡'},
              {step: '3', label: 'Auto-Mapped', icon: '🗺'},
              {step: '4', label: 'In Report', icon: '📄'},
            ].map((item, i) => (
              <div key={item.step} style={{display: 'flex', alignItems: 'center'}}>
                <div style={{
                  width: 200,
                  padding: 28,
                  borderRadius: 16,
                  backgroundColor: '#ffffff',
                  border: '2px solid #8A6B4E',
                  textAlign: 'center',
                  opacity: interpolate(frame - 540 - i * 25, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
                }}>
                  <div style={{fontSize: 32, marginBottom: 8}}>{item.icon}</div>
                  <div style={{fontSize: 13, color: '#8A6B4E', fontWeight: 700, marginBottom: 4}}>Step {item.step}</div>
                  <div style={{fontSize: 15, fontWeight: 600, color: '#1C2E47'}}>{item.label}</div>
                </div>
                {i < 3 && <div style={{width: 30, textAlign: 'center', color: '#D4A574', fontSize: 24}}>→</div>}
              </div>
            ))}
          </div>
        </AbsoluteFill>
      </div>

      {/* Benefits */}
      <div style={{position: 'absolute', inset: 0, opacity: benefitOpacity}}>
        <AbsoluteFill style={{backgroundColor: '#1C2E47', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60}}>
          <h2 style={{fontSize: 32, fontWeight: 700, color: '#ffffff', marginBottom: 40}}>Why This Matters</h2>
          <div style={{display: 'flex', gap: 40}}>
            {[
              {value: '$0', label: 'No hardware lock-in', sub: 'Use what you already own'},
              {value: '∞', label: 'Unlimited integrations', sub: 'If it exports data, it works'},
              {value: '100%', label: 'Data portability', sub: 'Export everything, anytime'},
            ].map((stat, i) => (
              <div key={stat.label} style={{
                width: 260,
                padding: 32,
                borderRadius: 16,
                backgroundColor: '#1C2E47',
                border: '1px solid #1C2E47',
                textAlign: 'center',
                opacity: interpolate(frame - 760 - i * 15, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
              }}>
                <div style={{fontSize: 48, fontWeight: 800, color: '#8A6B4E'}}>{stat.value}</div>
                <div style={{fontSize: 16, fontWeight: 700, color: '#ffffff', marginTop: 8}}>{stat.label}</div>
                <div style={{fontSize: 14, color: '#8A6B4E', marginTop: 4}}>{stat.sub}</div>
              </div>
            ))}
          </div>
        </AbsoluteFill>
      </div>

      {/* CTA */}
      <div style={{position: 'absolute', inset: 0, opacity: ctaOpacity}}>
        <AbsoluteFill style={{backgroundColor: '#8A6B4E', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60}}>
          <h1 style={{fontSize: 48, fontWeight: 800, color: '#ffffff', textAlign: 'center', margin: 0}}>Your Tools. Your Data.<br />Your Way.</h1>
          <p style={{fontSize: 20, color: '#fecaca', marginTop: 24, marginBottom: 40}}>RestoreAssist adapts to you — not the other way around.</p>
          <button style={{
            padding: '18px 48px',
            borderRadius: 12,
            border: 'none',
            backgroundColor: '#ffffff',
            color: '#8A6B4E',
            fontSize: 20,
            fontWeight: 700,
            cursor: 'pointer',
          }}>See Compatible Equipment</button>
          <div style={{fontSize: 14, color: '#fecaca', marginTop: 16}}>restoreassist.app/byok</div>
        </AbsoluteFill>
      </div>
    </AbsoluteFill>
  );
};
