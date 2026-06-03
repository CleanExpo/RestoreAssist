// @ts-nocheck
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, spring} from 'remotion';
import {IntroSlide, OutroSlide} from './ui-elements/intro-slide';

export const WhyRestoreAssist = () => {
  const frame = useCurrentFrame();

  const heroOpacity = interpolate(frame, [0, 25, 110, 140], [0, 1, 1, 0]);
  const problemOpacity = interpolate(frame, [120, 150, 290, 320], [0, 1, 1, 0]);
  const solutionOpacity = interpolate(frame, [280, 310, 590, 620], [0, 1, 1, 0]);
  const featuresOpacity = interpolate(frame, [580, 610, 890, 920], [0, 1, 1, 0]);
  const trustOpacity = interpolate(frame, [880, 910, 1040, 1070], [0, 1, 1, 0]);

  const features = [
    {icon: '📋', title: 'Smart Inspections', desc: 'Structured checklists that adapt to every hazard type — water, fire, mould, storm.'},
    {icon: '📄', title: 'Instant Reports', desc: 'Professional PDFs generated in minutes, not hours. Auto-filled from your inspection data.'},
    {icon: '🔗', title: 'Client Portal', desc: 'Share reports securely — your clients see branded, professional documentation with one click.'},
    {icon: '💰', title: 'Built-in Quotes & Invoices', desc: 'Generate quotes from scope. Convert to invoices in seconds. Track payments.'},
    {icon: '👥', title: 'Team Management', desc: 'Assign jobs, track progress, and manage permissions for your entire restoration crew.'},
    {icon: '📱', title: 'Mobile Field Workflow', desc: 'Capture evidence, moisture readings, and photos on-site — offline sync included.'},
  ];

  return (
    <AbsoluteFill style={{fontFamily: 'system-ui, sans-serif'}}>
      {/* Hero */}
      <div style={{position: 'absolute', inset: 0, opacity: heroOpacity}}>
        <AbsoluteFill style={{backgroundColor: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{width:80, height: 80, borderRadius: 20, backgroundColor: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, marginBottom: 32}}>🏗</div>
          <h1 style={{fontSize: 64, fontWeight: 800, color: '#ffffff', textAlign: 'center', margin: 0, lineHeight: 1.1}}>Why Restoration Teams<br />Choose RestoreAssist</h1>
          <p style={{fontSize: 22, color: '#64748b', marginTop: 24, textAlign: 'center', maxWidth: 700}}>The all-in-one platform built for Australian restoration professionals.</p>
        </AbsoluteFill>
      </div>

      {/* Problem — Paper & Spreadsheets */}
      <div style={{position: 'absolute', inset: 0, opacity: problemOpacity}}>
        <AbsoluteFill style={{backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60}}>
          <h2 style={{fontSize: 42, fontWeight: 700, color: '#1e293b', marginBottom: 48, textAlign: 'center'}}>Still running on paper & spreadsheets?</h2>
          <div style={{display: 'flex', gap: 32, maxWidth: 1200}}>
            {[
              {icon: '📝', label: '2+ hours per report'}, {icon: '📸', label: 'Photos scattered across devices'},
              {icon: '❌', label: 'Lost inspection notes'}, {icon: '📧', label: 'Client follow-ups manual'},
            ].map((item, i) => (
              <div key={i} style={{
                flex: 1,
                padding: 32,
                borderRadius: 16,
                backgroundColor: '#ffffff',
                border: '2px solid #fecaca',
                textAlign: 'center',
                opacity: interpolate(frame - 150 - i * 15, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
              }}>
                <div style={{fontSize: 32, marginBottom: 12}}>{item.icon}</div>
                <div style={{fontSize: 16, fontWeight: 600, color: '#7f1d1d', fontFamily: 'system-ui'}}>{item.label}</div>
              </div>
            ))}
          </div>
        </AbsoluteFill>
      </div>

      {/* Solution — One Platform */}
      <div style={{position: 'absolute', inset: 0, opacity: solutionOpacity}}>
        <AbsoluteFill style={{backgroundColor: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60}}>
          <h2 style={{fontSize: 42, fontWeight: 700, color: '#ffffff', marginBottom: 16, textAlign: 'center'}}>Everything in one place</h2>
          <p style={{fontSize: 18, color: '#94a3b8', marginBottom: 48, textAlign: 'center', maxWidth: 600}}>From inspection to invoice — one seamless workflow.</p>
          <div style={{
            display: 'flex',
            gap: 0,
            alignItems: 'center',
          }}>
            {['Inspection', 'Evidence', 'Report', 'Quote', 'Invoice'].map((step, i) => (
              <div key={step} style={{display: 'flex', alignItems: 'center', gap: 0}}>
                <div style={{
                  padding: '16px 28px',
                  borderRadius: i === 0 ? '12px 0 0 12px' : i === 4 ? '0 12px 12px 0' : 0,
                  backgroundColor: i === 4 ? '#dc2626' : '#1e293b',
                  color: i === 4 ? '#ffffff' : '#94a3b8',
                  fontSize: 15,
                  fontWeight: 600,
                  fontFamily: 'system-ui',
                  opacity: interpolate(frame - 310 - i * 20, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
                }}>{step}</div>
                {i < 4 && <div style={{width: 24, textAlign: 'center', color: '#475569', fontSize: 18, opacity: interpolate(frame - 310 - i * 20 - 20, [0, 15], [0, 1])}}>→</div>}
              </div>
            ))}
          </div>
        </AbsoluteFill>
      </div>

      {/* Features Grid */}
      <div style={{position: 'absolute', inset: 0, opacity: featuresOpacity}}>
        <AbsoluteFill style={{backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60}}>
          <h2 style={{fontSize: 36, fontWeight: 700, color: '#1e293b', marginBottom: 48}}>Built for Australian Restorers</h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 24,
            maxWidth: 1200,
          }}>
            {features.map((f, i) => (
              <div key={f.title} style={{
                padding: 28,
                borderRadius: 16,
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                opacity: interpolate(frame - 610 - i * 12, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
              }}>
                <div style={{fontSize: 28, marginBottom: 12}}>{f.icon}</div>
                <h3 style={{fontSize: 17, fontWeight: 700, color: '#1e293b', margin: '0 0 8px', fontFamily: 'system-ui'}}>{f.title}</h3>
                <p style={{fontSize: 14, color: '#64748b', lineHeight: 1.5, margin: 0, fontFamily: 'system-ui'}}>{f.desc}</p>
              </div>
            ))}
          </div>
        </AbsoluteFill>
      </div>

      {/* Trust / CTA */}
      <div style={{position: 'absolute', inset: 0, opacity: trustOpacity}}>
        <AbsoluteFill style={{backgroundColor: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60}}>
          <div style={{display: 'flex', gap: 64, marginBottom: 48}}>
            {[
              {value: '45%', label: 'Faster Reports'},
              {value: '3x', label: 'More Jobs Won'},
              {value: '$12K', label: 'Avg Monthly Saving'},
            ].map((stat, i) => (
              <div key={stat.label} style={{
                textAlign: 'center',
                opacity: interpolate(frame - 910 - i * 15, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
              }}>
                <div style={{fontSize: 52, fontWeight: 800, color: '#dc2626', lineHeight: 1}}>{stat.value}</div>
                <div style={{fontSize: 16, color: '#94a3b8', marginTop: 8, fontFamily: 'system-ui'}}>{stat.label}</div>
              </div>
            ))}
          </div>
          <div style={{
            opacity: interpolate(frame - 960, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
          }}>
            <button style={{
              padding: '18px 48px',
              borderRadius: 12,
              border: 'none',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              fontSize: 20,
              fontWeight: 700,
              fontFamily: 'system-ui',
              cursor: 'pointer',
            }}>Start Your Free Trial</button>
            <div style={{fontSize: 14, color: '#64748b', marginTop: 16, textAlign: 'center'}}>14 days free · No credit card required</div>
          </div>
        </AbsoluteFill>
      </div>
    </AbsoluteFill>
  );
};
